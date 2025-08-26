// File: /api/blockAuthors.js
import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const BATCH_SIZE = 50; // adjust for performance, larger = faster but more memory

export default async function handler(req, res) {
  try {
    const startBlockParam = req.query.startBlock;
    let startBlock = parseInt(startBlockParam, 10);
    if (!startBlock || isNaN(startBlock) || startBlock < 0) {
      return res.status(400).json({ error: 'Missing or invalid `startBlock` parameter' });
    }

    startBlock += 1; // skip starting block to avoid duplicates

    await cryptoWaitReady();
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    const validators = (await api.query.session.validators()).map(v => v.toString().toLowerCase());
    const validatorData = {};
    validators.forEach(v => { validatorData[v] = { authored: [], heartbeats: [] }; });

    const authorityToValidator = {};
    const queriedKeyOwners = new Set();

    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    for (let i = startBlock; i <= currentBlock; i += BATCH_SIZE) {
      const batch = [...Array(Math.min(BATCH_SIZE, currentBlock - i + 1)).keys()]
        .map(j => i + j);

      // Fetch block data in parallel
      await Promise.all(batch.map(async (blockNumber) => {
        try {
          const hash = await api.rpc.chain.getBlockHash(blockNumber);
          const [header, timestamp, events] = await Promise.all([
            api.derive.chain.getHeader(hash),
            api.query.timestamp.now.at(hash),
            api.query.system.events.at(hash)
          ]);

          const ts = Math.floor(timestamp.toNumber() / 1000);

          // Authored block
          const author = header.author?.toString()?.toLowerCase();
          if (author && validatorData[author]) {
            validatorData[author].authored.push({ block: blockNumber, time: ts });
          }

          // Heartbeats
          for (const { event } of events) {
            if (event.section === 'imOnline' && event.method === 'HeartbeatReceived') {
              const authorityHex = event.data[0].toHex().toLowerCase();

              if (!authorityToValidator[authorityHex] && !queriedKeyOwners.has(authorityHex)) {
                queriedKeyOwners.add(authorityHex);
                try {
                  const keyOwner = await api.query.session.keyOwner.at(hash, [stringToU8a('imon'), event.data[0]]);
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
        } catch (_) {} // skip problematic blocks
      }));
    }

    await api.disconnect();

    // Keep only validators with activity
    const filteredValidatorData = {};
    Object.entries(validatorData).forEach(([v, data]) => {
      if (data.authored.length || data.heartbeats.length) {
        filteredValidatorData[v] = data;
      }
    });

    res.status(200).json({
      fromBlock: startBlock,
      toBlock: currentBlock,
      scannedAt: Math.floor(Date.now() / 1000),
      validators: filteredValidatorData
    });

  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error occurred' });
  }
}
