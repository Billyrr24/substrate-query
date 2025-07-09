// /api/extrinsicsRange.js
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundle }            from '../types-bundle/index.js';
import util                       from 'util';

// ---------- helpers ----------
const safeJson = (_, v) => (typeof v === 'bigint' ? v.toString() : v);
const dbg = (label, obj) =>
  console.log(label, util.inspect(obj, { depth: 5, colors: false }));

// ---------- placeholder extension layout (we will tweak after log) ----------
const userExtensions = {
  CheckEnergyFee: {
    extrinsic: { energyFee: 'Compact<Balance>' },
    payload:   { energyFee: 'Compact<Balance>' }
  }
};

export default async function handler(req, res) {
  let api;
  try {
    const { start, end } = req.query;
    const s = Number(start), e = Number(end);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s > e) {
      return res.status(400).json({ error: 'Invalid ?start or ?end' });
    }

    // 1) connect (no extension tweaks yet)
    api = await ApiPromise.create({
      provider: new WsProvider('wss://rpc-mainnet.vtrs.io:443'),
      typesBundle,
      throwOnUnknown: false
    });

    // 2) DEBUG: print what runtime advertises
    dbg('Runtime-supplied signedExtensions', api.registry.signedExtensions);

    dbg(
      'Extension identifiers in metadata',
      api.runtimeMetadata.asLatest.extrinsic.signedExtensions
        .map((x) => x.identifier.toString())
    );

    // 3) For now, respond with 200 so logs show up quickly
    await api.disconnect();
    return res.status(200).json({ note: 'See function logs for extensions list' });
  } catch (err) {
    console.error('Serverless error:', err);
    try { await api?.disconnect(); } catch {}
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}
