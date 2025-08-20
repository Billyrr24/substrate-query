// File: /api/validatorActivity.js

import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const BATCH_SIZE = 200; // increase for better throughput

export default async function handler(req, res) {
  try {
    // Get and validate startBlock
    const startBlockParam = req.query.startBlock;
    let startBlock = parseInt(startBlockParam, 10);
    if (!startBlock || isNaN(startBlock) || startBlock < 0) {
      return res.status(400).json({ error: 'Missing or invalid `startBlock` parameter' });
    }

    // Skip the starting block to avoid duplicate data
    startBlock = startBlock + 1;

    await cryptoWaitReady();
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    // Fetch current validator set
    const validators = (await api.query.session.validators()).map((v) => v.toString().toLowerCase());

    // Fetch current block height
    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    // Prepare validator activity store
    const validatorData = {};
    for (const val of validators) {
      validatorData[val] = { authored: [], heartbeats: [] };
    }

    // ---- Precompute authority -> validator mapping ----
    const imonKeys = await api.query.imOnline.keys();
    const keyOwnerEntries = await Promise.all(
      imonKeys.map(async ({ args: [authorityId] }) => {
        const keyTypeId = stringToU8a('imon');
        const owner = await api.query.session.keyOwner([keyTypeId, authorityId]);
        if (owner.isSome) {
          return [authorityId.toHex().toLowerCase(), owner.unwrap().toString().toLowerCase()];
        }
        return null;
      })
    );
    const authorityToValidator = Object.fromEntries(
      keyOwnerEntries.filter((x) => x !== null)
    );
    // -----------------------------------------------

    // ---- Block scanning loop ----
    for (let i = startBlock; i < currentBlock; i += BATCH_SIZE) {
      const batch = [...Array(BATCH_SIZE).keys()]
        .map((j) => i + j)
        .filter((b) => b <= currentBlock);

      await Promise.all(
        batch.map(async (blockNumber) => {
          try {
            const hash = await api.rpc.chain.getBlockHash(blockNumber);

            // fetch header
            const header = await api.derive.chain.getHeader(hash);

            // fetch timestamp + events in one call
            let timestamp, events;
            try {
              [timestamp, events] = await api.queryMulti.at(hash, [
                api.query.timestamp.now,
                api.query.system.events,
              ]);
            } catch (err) {
              // fallback if queryMulti fails
              timestamp = { toNumber: () => 0 };
              events = [];
            }

            const ts = Math.floor(timestamp.toNumber() / 1000);

            // record authored block
            const author = header.author?.toString()?.toLowerCase();
            if (author && validatorData[author]) {
              validatorData[author].authored.push({ block: blockNumber, time: ts });
            }

            // scan events
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
            // ignore errors for individual blocks
          }
        })
      );
    }

    await api.disconnect();

    // Filter out validators with no activity
    const filteredValidatorData = {};
    for (const [validator, data] of Object.entries(validatorData)) {
      if (data.authored.length > 0 || data.heartbeats.length > 0) {
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
