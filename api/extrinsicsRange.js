// /api/extrinsicsRange.js  (Vercel serverless function)

import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundle }           from '../types-bundle/index.js';    // ← path out of /api/
import { decodeAddress }         from '@polkadot/util-crypto';

// ---------- helper: BigInt-safe JSON replacer ----------
const safeJson = (_, v) => (typeof v === 'bigint' ? v.toString() : v);

// ---------- Vercel handler ----------
export default async function handler(req, res) {
  try {
    // --- validate query params ---
    const { start, end } = req.query;
    const startBlock = Number(start);
    const endBlock   = Number(end);

    if (!Number.isInteger(startBlock) || !Number.isInteger(endBlock) || startBlock > endBlock) {
      return res.status(400).json({ error: 'Invalid ?start or ?end block numbers' });
    }

    // --- connect with custom types bundle ---
    const api = await ApiPromise.create({
      provider: new WsProvider('wss://rpc-mainnet.vtrs.io:443'),
      typesBundle,                   // 👈 your custom bundle
      throwOnUnknown: false
    });

    const results = [];

    for (let bn = startBlock; bn <= endBlock; bn++) {
      const hash = await api.rpc.chain.getBlockHash(bn);

      // parallel RPCs for speed
      const [signedBlock, events, tsNow] = await Promise.all([
        api.rpc.chain.getBlock(hash),
        api.query.system.events.at(hash),
        api.query.timestamp.now.at(hash)
      ]);

      const extrinsics = signedBlock.block.extrinsics.map((ext, idx) => {
        const { method, signer, args, isSigned } = ext;

        // decode args safely
        const decoded = {};
        method.args.forEach((_, i) => {
          const argName = method.meta.args[i]?.name?.toString() || `arg${i}`;
          try {
            decoded[argName] = args[i]?.toHuman?.() ?? args[i]?.toString();
          } catch {
            decoded[argName] = args[i]?.toString();
          }
        });

        // match events to this extrinsic index
        const relatedEvents = events
          .filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(idx))
          .map(({ event }) => ({
            section: event.section,
            method : event.method,
            args   : (() => { try { return event.data.toHuman(); } catch { return event.data.toString(); } })()
          }));

        return {
          index   : idx,
          section : method.section,
          method  : method.method,
          args    : decoded,
          signer  : isSigned ? signer.toString() : null,
          success : relatedEvents.some(e => e.method === 'ExtrinsicSuccess'),
          events  : relatedEvents
        };
      });

      results.push({
        blockNumber: bn,
        timestamp  : new Date(tsNow.toNumber()).toISOString(),
        extrinsics
      });
    }

    await api.disconnect();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.write(JSON.stringify(results, safeJson));
    res.end();
  } catch (err) {
    // make sure we always respond
    console.error('Serverless error:', err);
    try { await api?.disconnect(); } catch {}
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}
