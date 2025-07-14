import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundle } from '../types-bundle/index.js';
import util from 'util';

const safeJson = (_, v) => (typeof v === 'bigint' ? v.toString() : v);
const dbg = (l, o) => console.log(l, util.inspect(o, { depth: 3 }));

export default async function handler(req, res) {
  const s = Number(req.query.start), e = Number(req.query.end);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s > e)
    return res.status(400).json({ error: 'Invalid start/end' });

  try {
    const api = await ApiPromise.create({
      provider: new WsProvider('wss://rpc-mainnet.vtrs.io:443'),
      typesBundle,
      signedExtensions: [
        'CheckNonZeroSender','CheckSpecVersion','CheckTxVersion',
        'CheckGenesis','CheckMortality','CheckNonce','CheckWeight',
        'ChargeTransactionPayment','CheckEnergyFee'
      ],
      throwOnUnknown: false
    });

    const output = [];
    for (let b = s; b <= e; b++) {
      const hash = await api.rpc.chain.getBlockHash(b);
      const block = await api.rpc.chain.getBlock(hash);
      const events = await api.query.system.events.at(hash);

      const decoded = block.block.extrinsics.map((ex, i) => {
        let section='unknown', method='unknown', argsObj={};
        try {
          section = ex.method.section;
          method  = ex.method.method;
          ex.method.args.forEach((_, idx) => {
            const key = ex.method.meta.args[idx]?.name?.toString()||`arg${idx}`;
            argsObj[key] = ex.args[idx]?.toHuman?.() ?? ex.args[idx]?.toString();
          });
        } catch { /* decode fallback */ }

        const relEvents = events
          .filter(ev => ev.phase.isApplyExtrinsic && ev.phase.asApplyExtrinsic.eq(i))
          .map(ev => ({ section: ev.event.section, method: ev.event.method, data: ev.event.data.toHuman() }));

        return {
          index: i,
          section,
          method,
          args: argsObj,
          signer: ex.isSigned ? ex.signer.toString() : null,
          success: relEvents.some(ev=>ev.method==='ExtrinsicSuccess'),
          events: relEvents
        };
      });

      output.push({ blockNumber: b, hash: hash.toHex(), extrinsics: decoded });
    }

    await api.disconnect();
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(output, safeJson));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}
