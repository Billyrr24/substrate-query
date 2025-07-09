// /api/extrinsicsRange.js
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundle } from '../types-bundle/index.js';

// Properly define custom extensions
const userExtensions = {
  CheckEnergyFee: {
    extrinsic: {
      energyFee: 'Compact<Balance>'
    },
    payload: {
      energyFee: 'Compact<Balance>'
    }
  }
};

// Chain-ordered list of signed extensions
const signedExtensions = [
  'CheckNonZeroSender',
  'CheckSpecVersion',
  'CheckTxVersion',
  'CheckGenesis',
  'CheckMortality',
  'CheckNonce',
  'CheckWeight',
  'ChargeTransactionPayment',
  'CheckEnergyFee'
];

export default async function handler(req, res) {
  let api;
  try {
    const { start, end } = req.query;
    const s = Number(start), e = Number(end);

    if (!Number.isInteger(s) || !Number.isInteger(e) || s > e) {
      return res.status(400).json({ error: 'Invalid ?start or ?end' });
    }

    // Connect to node
    api = await ApiPromise.create({
      provider: new WsProvider('wss://rpc-mainnet.vtrs.io:443'),
      typesBundle,
      signedExtensions,
      userExtensions,
      throwOnUnknown: false
    });

    const result = [];

    for (let blockNumber = s; blockNumber <= e; blockNumber++) {
      const hash = await api.rpc.chain.getBlockHash(blockNumber);
      const signedBlock = await api.rpc.chain.getBlock(hash);
      const extrinsics = signedBlock.block.extrinsics.map((ex, i) => ({
        index: i,
        method: `${ex.method.section}.${ex.method.method}`,
        signer: ex.isSigned ? ex.signer.toString() : null
      }));
      result.push({ blockNumber, extrinsics });
    }

    await api.disconnect();
    return res.status(200).json(result);
  } catch (err) {
    console.error('Serverless error:', err);
    try { await api?.disconnect(); } catch {}
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
