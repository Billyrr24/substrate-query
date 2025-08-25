import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const BATCH_SIZE = 20; // smaller batch to avoid timeout

export default async function handler(req, res) {
  try {
    const startBlockParam = req.query.startBlock;
    let startBlock = parseInt(startBlockParam, 10);
    if (!startBlock || isNaN(startBlock) || startBlock < 0) {
      return res.status(400).json({ error: 'Missing or invalid `startBlock` parameter' });
    }
    startBlock++;

    await cryptoWaitReady();
    const api = await ApiPromise.create({ provider: new WsProvider(WS_ENDPOINT) });
    await api.isReady;

    const validators = (await api.query.session.validators()).map((v) => v.toString().toLowerCase());
    const validatorData = Object.fromEntries(validators.map((v) => [v, { authored: [], heartbeats: [] }]));

    const authorityToValidator = {};
    const queriedKeyOwners = new Set();

    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    for (let i = startBlock; i <= currentBlock; i += BATCH_SIZE) {
      const batch = [];
      for (let j = 0; j < BATCH_SIZE && i + j <= currentBlock; j++) {
        batch.push(i + j);
      }

      for (const blockNumber of batch) {
        try {
          const hash = await api.rpc.chain.getBlockHash(blockNumber);
          const header = await api.rpc.chain.getHeader(hash);
          const timestampMs = (await api.query.timestamp.now.at(hash)).toNumber();
          const ts = Math.floor(timestampMs / 1000);

          // Authored
          const author = header.author?.toString()?.toLowerCase();
          if (author && validatorData[author]) {
            validatorData[author].authored.push({ block: blockNumber, time: ts });
          }

          // Heartbeats
          const events = await api.query.system.events.at(hash);
          for (const { event } of events) {
            if (event.section === 'imOnline' && event.method === 'HeartbeatReceived') {
              const authorityHex = event.data[0].toHex().toLowerCase();

              if (!authorityToValidator[authorityHex] && !queriedKeyOwners.has(authorityHex)) {
                queriedKeyOwners.add(authorityHex);
                try {
                  const keyTypeId = stringToU8a('imon');
                  const keyOwner = await api.query.session.keyOwner.at(hash, [keyTypeId, event.data[0]]);
                  if (keyOwner.isSome) {
                    authorityToValidator[authorityHex] = keyOwner.unwrap().toString().toLowerCase();
                  }
                } catch (_) {}
              }

              const validator = authorityToValidator[authorityHex];
              if (validator && validatorData[validator]) {
                validatorData[validator].heartbeats.push({ block: blockNumber, time: ts });
              }
            }
          }
        } catch (_) {}
      }
    }

    await api.disconnect();

    const filteredValidatorData = {};
    for (const [validator, data] of Object.entries(validatorData)) {
      if (data.authored.length || data.heartbeats.length) filteredValidatorData[validator] = data;
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
