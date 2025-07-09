import { ApiPromise, WsProvider } from '@polkadot/api';
import { decodeAddress } from '@polkadot/util-crypto';

export default async function handler(req, res) {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'Missing start or end block query parameters' });
  }

  const startBlock = parseInt(start);
  const endBlock = parseInt(end);

  if (isNaN(startBlock) || isNaN(endBlock) || startBlock > endBlock) {
    return res.status(400).json({ error: 'Invalid block range' });
  }

  const provider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
  const api = await ApiPromise.create({ provider });

  const results = [];

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    const hash = await api.rpc.chain.getBlockHash(blockNumber);
    const [signedBlock, events, timestampNow] = await Promise.all([
      api.rpc.chain.getBlock(hash),
      api.query.system.events.at(hash),
      api.query.timestamp.now.at(hash)
    ]);

    const extrinsics = signedBlock.block.extrinsics.map((extrinsic, index) => {
      const { method, signer, args } = extrinsic;
      const isSigned = extrinsic.isSigned;
      const decodedArgs = {};

      method.args.forEach((arg, i) => {
        const argName = method.meta.args[i]?.name.toString() || `arg${i}`;
        decodedArgs[argName] = args[i]?.toHuman?.() ?? args[i]?.toString();
      });

      // Find associated events
      const associatedEvents = events
        .filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index))
        .map(({ event }) => ({
          section: event.section,
          method: event.method,
          args: event.data.toHuman()
        }));

      return {
        index,
        section: method.section,
        method: method.method,
        args: decodedArgs,
        signer: isSigned ? signer.toString() : null,
        success: associatedEvents.some(e => e.method === 'ExtrinsicSuccess'),
        events: associatedEvents
      };
    });

    results.push({
      blockNumber,
      timestamp: new Date(timestampNow.toNumber()).toISOString(),
      extrinsics
    });
  }

  await api.disconnect();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(results);
}
