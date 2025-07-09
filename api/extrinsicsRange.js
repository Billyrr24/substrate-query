// /api/extrinsicsRange.js  –  Vercel serverless function
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundle }           from '../types-bundle/index.js';   // <- bundle in repo root
import util                       from 'util';

// ---------- helpers ----------
const safeJson = (_, v) => (typeof v === 'bigint' ? v.toString() : v);
const dbg      = (label, obj) =>
  console.log(label, util.inspect(obj, { depth: 5, colors: false }));

export default async function handler(req, res) {
  let api;        // so we can disconnect in catch
  let tmpApi;     // used only for specName check

  try {
    // ----- validate query params -----
    const { start, end } = req.query;
    const s = Number(start), e = Number(end);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s > e) {
      return res.status(400).json({ error: 'Invalid ?start or ?end' });
    }

    // ----- diagnostics: bundle keys & runtime specName -----
    dbg('Bundle keys', Object.keys(typesBundle.spec));

    tmpApi = await ApiPromise.create({
      provider: new WsProvider('wss://rpc-mainnet.vtrs.io:443')
    });
    const runtimeSpec = tmpApi.runtimeVersion.specName.toString();
    dbg('Runtime specName', runtimeSpec);
    await tmpApi.disconnect();

    // ----- connect with custom bundle -----
    api = await ApiPromise.create({
      provider: new WsProvider('wss://rpc-mainnet.vtrs.io:443'),
      typesBundle,                 // <- pass entire bundle object
      throwOnUnknown: false
    });

    const results = [];

    for (let bn = s; bn <= e; bn++) {
      const hash = await api.rpc.chain.getBlockHash(bn);
      const [signedBlock, events, ts] = await Promise.all([
        api.rpc.chain.getBlock(hash),
        api.query.system.events.at(hash),
        api.query.timestamp.now.at(hash)
      ]);

      const extrinsics = signedBlock.block.extrinsics.map((ext, idx) => {
        const { method, signer, args, isSigned } = ext;

        // decode arguments
        const decodedArgs = {};
        method.args.forEach((_, i) => {
          const key = method.meta.args[i]?.name?.toString() || `arg${i}`;
          try {
            decodedArgs[key] = args[i]?.toHuman?.() ?? args[i]?.toString();
          } catch {
            decodedArgs[key] = args[i]?.toString();
          }
        });

        // match events
        const relEvents = events
          .filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(idx))
          .map(({ event }) => {
            let evArgs;
            try { evArgs = event.data.toHuman(); } catch { evArgs = event.data.toString(); }
            return { section: event.section, method: event.method, args: evArgs };
          });

        return {
          index   : idx,
          section : method.section,
          method  : method.method,
          args    : decodedArgs,
          signer  : isSigned ? signer.toString() : null,
          success : relEvents.some(ev => ev.method === 'ExtrinsicSuccess'),
          events  : relEvents
        };
      });

      results.push({
        blockNumber: bn,
        timestamp  : new Date(ts.toNumber()).toISOString(),
        extrinsics
      });
    }

    await api.disconnect();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type',  'application/json');
    res.end(JSON.stringify(results, safeJson));
  } catch (err) {
    console.error('Serverless error:', err);
    try { await api?.disconnect(); } catch {}
    try { await tmpApi?.disconnect(); } catch {}
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}
