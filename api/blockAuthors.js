import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';
import pLimit from 'p-limit'; // controls concurrency

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const CONCURRENCY = 10; // max parallel RPC calls

export default async function handler(req, res) {
  try {
    const startBlockParam = req.query.startBlock;
    let startBlock = parseInt(startBlockParam, 10);
    if (!startBlock || isNaN(startBlock) || startBlock < 0)
      return res.status(400).json({ error: 'Missing or invalid `startBlock` parameter' });

    startBlock += 1;

    await cryptoWaitReady();
    const api = await ApiPromise.create({ provider: new WsProvider(WS_ENDPOINT) });
    await api.isReady;

    const validators = (await api.query.session.validators()).map(v => v.toString().toLowerCase());
    const validatorData = Object.fromEntries(validators.map(v => [v, { authored: [], heartbeats: [] }]));

    const authorityToValidator = {};
    const queriedKeyOwners = new Set();

    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();
    const blocksToFetch = Array.from({ length: currentBlock - startBlock + 1 }, (_, i) => startBlock + i);

    const limit = pLimit(CONCURRENCY);

    await Promise.all(
      blocksToFetch.map(blockNumber =>
        limit(async () => {
          try {
            const signedBlock = await api.rpc.chain.getBlock(blockNumber);
            const header = signedBlock.block.header;
            const tsExtrinsic = signedBlock.block.extrinsics.find(e => e.method.section === 'timestamp');
            const ts = tsExtrinsic ? Math.floor(tsExtrinsic.method.args[0].toNumber() / 1000) : Math.floor(Date.now() / 1000);

            const author = header?.author?.toString()?.toLowerCase();
            if (author && validatorData[author]) validatorData[author].authored.push({ block: blockNumber, time: ts });

            const events = await api.query.system.events.at(await api.rpc.chain.getBlockHash(blockNumber));
            for (const { event } of events) {
              if (event.section === 'imOnline' && event.method === 'HeartbeatReceived') {
                const authorityHex = event.data[0].toHex().toLowerCase();
                if (!authorityToValidator[authorityHex] && !queriedKeyOwners.has(authorityHex)) {
                  queriedKeyOwners.add(authorityHex);
                  const keyTypeId = stringToU8a('imon');
                  const keyOwner = await api.query.session.keyOwner.at(await api.rpc.chain.getBlockHash(blockNumber), [keyTypeId, event.data[0]]);
                  if (keyOwner.isSome) authorityToValidator[authorityHex] = keyOwner.unwrap().toString().toLowerCase();
                }

                const validator = authorityToValidator[authorityHex];
                if (validator && validatorData[validator]) validatorData[validator].heartbeats.push({ block: blockNumber, time: ts });
              }
            }
          } catch (_) {}
        })
      )
    );

    await api.disconnect();

    const filteredValidatorData = {};
    for (const [v, data] of Object.entries(validatorData)) {
      if (data.authored.length || data.heartbeats.length) filteredValidatorData[v] = data;
    }

    res.status(200).json({
      fromBlock: startBlock,
      toBlock: currentBlock,
      scannedAt: Math.floor(Date.now() / 1000),
      validators: filteredValidatorData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error occurred' });
  }
}
