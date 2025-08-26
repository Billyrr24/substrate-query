// File: /api/blockAuthors.js
import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const BATCH_SIZE = 100; // safely increased

export default async function handler(req, res) {
  try {
    // Get and validate startBlock
    let startBlock = parseInt(req.query.startBlock, 10);
    if (!startBlock || isNaN(startBlock) || startBlock < 0) {
      return res.status(400).json({ error: 'Missing or invalid startBlock parameter' });
    }
    startBlock += 1; // avoid duplicates

    await cryptoWaitReady();
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    // Pre-fetch validators
    const validators = (await api.query.session.validators()).map((v) =>
      v.toString().toLowerCase()
    );

    // Precompute authority -> validator mapping
    const imonKeys = await api.query.imOnline.keys();
    const authorityToValidator = {};
    await Promise.all(
      imonKeys.map(async ({ args: [authorityId] }) => {
        try {
          const keyTypeId = stringToU8a('imon');
          const owner = await api.query.session.keyOwner([keyTypeId, authorityId]);
          if (owner.isSome) {
            authorityToValidator[authorityId.toHex().toLowerCase()] =
              owner.unwrap().toString().toLowerCase();
          }
        } catch (_) {}
      })
    );

    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    // Prepare result store
    const validatorData = {};
    for (const val of validators) {
      validatorData[val] = { authored: [], heartbeats: [] };
    }

    // Process in batches
    for (let i = startBlock; i <= currentBlock; i += BATCH_SIZE) {
      const batch = Array.from({ length: BATCH_SIZE }, (_, j) => i + j).filter(
        (b) => b <= currentBlock
      );

      // fetch headers + queries in parallel
      await Promise.all(
        batch.map(async (blockNumber) => {
          try {
            const hash = await api.rpc.chain.getBlockHash(blockNumber);
            const header = await api.derive.chain.getHeader(hash);

            // batch query timestamp + events in one call
            const [timestamp, events] = await api.queryMulti.at(hash, [
              api.query.timestamp.now,
              api.query.system.events,
            ]);

            const ts = Math.floor(timestamp.toNumber() / 1000);

            // authored block
            const author = header.author?.toString()?.toLowerCase();
            if (author && validatorData[author]) {
              validatorData[author].authored.push({ block: blockNumber, time: ts });
            }

            // heartbeats
            for (const { event } of events) {
              if (event.section === 'imOnline' && event.method === 'HeartbeatReceived') {
                const authorityHex = event.data[0].toHex().toLowerCase();
                const validator = authorityToValidator[authorityHex];
                if (validator && validatorData[validator]) {
                  validatorData[validator].heartbeats.push({ block: blockNumber, time: ts });
                }
              }
            }
          } catch (_) {}
        })
      );
    }

    await api.disconnect();

    // Filter only active validators
    const filteredValidatorData = {};
    for (const [validator, data] of Object.entries(validatorData)) {
      if (data.authored.length || data.heartbeats.length) {
        filteredValidatorData[validator] = data;
      }
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
