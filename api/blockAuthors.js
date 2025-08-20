// File: /api/validatorActivity.js

import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const BATCH_SIZE = 200; // tune for performance

export default async function handler(req, res) {
  try {
    // Get and validate startBlock
    const startBlockParam = req.query.startBlock || req.query.startblock;
    let startBlock = parseInt(startBlockParam, 10);
    if (!startBlock || isNaN(startBlock) || startBlock < 0) {
      return res.status(400).json({ error: 'Missing or invalid `startBlock` parameter' });
    }
    startBlock += 1; // skip starting block to avoid duplicates

    await cryptoWaitReady();
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    // Fetch current validators
    const validators = (await api.query.session.validators()).map((v) => v.toString().toLowerCase());

    // Initialize validator data store
    const validatorData = {};
    validators.forEach((v) => {
      validatorData[v] = { authored: [], heartbeats: [] };
    });

    // Precompute authority -> validator mapping (imOnline)
    const imonKeys = await api.query.imOnline.keys();
    const authorityToValidatorEntries = await Promise.all(
      imonKeys.map(async ({ args: [authorityId] }) => {
        try {
          const keyTypeId = stringToU8a('imon');
          const owner = await api.query.session.keyOwner([keyTypeId, authorityId]);
          if (owner.isSome) {
            return [authorityId.toHex().toLowerCase(), owner.unwrap().toString().toLowerCase()];
          }
        } catch (_) {}
        return null;
      })
    );
    const authorityToValidator = Object.fromEntries(authorityToValidatorEntries.filter(Boolean));

    // Fetch current block number
    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    // Process blocks in batches
    for (let i = startBlock; i < currentBlock; i += BATCH_SIZE) {
      const batch = [...Array(BATCH_SIZE).keys()]
        .map((j) => i + j)
        .filter((b) => b <= currentBlock);

      await Promise.all(batch.map(async (blockNumber) => {
        try {
          const hash = await api.rpc.chain.getBlockHash(blockNumber);
          const header = await api.derive.chain.getHeader(hash);

          let timestamp, events;
          try {
            [timestamp, events] = await api.queryMulti.at(hash, [
              api.query.timestamp.now,
              api.query.system.events,
            ]);
          } catch (_) {
            timestamp = { toNumber: () => 0 };
            events = [];
          }
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
              const validator = authorityToValidator[authorityHex];
              if (validator && validatorData[validator]) {
                validatorData[validator].heartbeats.push({ block: blockNumber, time: ts });
              }
            }
          }
        } catch (_) {
          // ignore individual block errors
        }
      }));
    }

    await api.disconnect();

    // Filter out validators with no activity
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
      validators: filteredValidatorData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error occurred' });
  }
}
