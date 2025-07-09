// /api/extrinsicsRange.js  –  Vercel serverless function
import { ApiPromise, WsProvider } from '@polkadot/api';
import * as known                 from '@polkadot/types-known';     // ← changed
import { typesBundle }            from '../types-bundle/index.js';
import util                       from 'util';

// ---------- helpers ----------
const safeJson = (_, v) => (typeof v === 'bigint' ? v.toString() : v);
const dbg = (label, obj) =>
  console.log(label, util.inspect(obj, { depth: 5, colors: false }));

// ---------- normalize built‑in extensions (array vs object) ----------
const builtIn = Array.isArray(known.defaultExtensions)
  ? known.defaultExtensions
  : Object.keys(known.defaultExtensions);

// ---------- describe the custom signed extension ----------
const userExtensions = {
  CheckEnergyFee: {
    extrinsic: { energyFee: 'Compact<Balance>' },
    payload:   { energyFee: 'Compact<Balance>' }
  }
};

export default async function handler(req, res) {
  let api;
  try {
    // 1) validate ?start & ?end
    const { start, end } = req.query;
    const s = Number(start), e = Number(end);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s > e) {
      return res.status(400).json({ error: 'Invalid ?start or ?end' });
    }

    // 2) connect with bundle + custom extension
    dbg('Using signedExtensions', [...builtIn, 'CheckEnergyFee']);

    api = await ApiPromise.create({
      provider: new WsProvider('wss://rpc-mainnet.vtrs.io:443'),
      typesBundle,
      userExtensions,
      signedExtensions: [...builtIn, 'CheckEnergyFee'],   // ← changed
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
          try { decodedArgs[key] = args[i]?.toHuman?.() ?? args[i]?.toString(); }
          catch { decodedArgs[key] = args[i]?.toString(); }
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
          index:   idx,
          section: method.section,
          method:  method.method,
          args:    decodedArgs,
          signer:  isSigned ? signer.toString() : null,
          success: relEvents.some(ev => ev.method === 'ExtrinsicSuccess'),
          events:  relEvents
        };
      });

      results.push({
        blockNumber: bn,
        timestamp:   new Date(ts.toNumber()).toISOString(),
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
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}
