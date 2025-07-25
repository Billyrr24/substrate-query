// File: /api/validatorActivity.js (for Vercel serverless function)

import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const BATCH_SIZE = 30;

export default async function handler(req, res) {
  try {
    // Get startBlock from query params, validate
    const startBlockParam = req.query.startBlock;
    const startBlock = parseInt(startBlockParam, 10);
    if (!startBlock || isNaN(startBlock) || startBlock < 0) {
      return res.status(400).json({ error: 'Missing or invalid `startBlock` parameter' });
    }

    await cryptoWaitReady();
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    const validators = (await api.query.session.validators()).map((v) => v.toString().toLowerCase());

    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    const validatorData = {};
    for (const val of validators) {
      validatorData[val] = {
        authored: [],
        heartbeats: [],
      };
    }

    const authorityToValidator = {};
    const queriedKeyOwners = new Set();

    for (let i = startBlock; i < currentBlock; i += BATCH_SIZE) {
      const batch = [...Array(BATCH_SIZE).keys()]
        .map((j) => i + j)
        .filter((b) => b <= currentBlock);

      await Promise.all(
        batch.map(async (blockNumber) => {
          try {
            const hash = await api.rpc.chain.getBlockHash(blockNumber);
            const extHeader = await api.derive.chain.getHeader(hash);
            const timestampMs = (await api.query.timestamp.now.at(hash)).toNumber();

            const author = extHeader.author?.toString()?.toLowerCase();
            if (author && validatorData[author]) {
              validatorData[author].authored.push({
                block: blockNumber,
                time: Math.floor(timestampMs / 1000),
              });
            }

            const events = await api.query.system.events.at(hash);
            for (const { event } of events) {
              if (event.section === 'imOnline' && event.method === 'HeartbeatReceived') {
                const authorityId = event.data[0];
                const authorityHex = authorityId.toHex().toLowerCase();

                if (!authorityToValidator[authorityHex] && !queriedKeyOwners.has(authorityHex)) {
                  queriedKeyOwners.add(authorityHex);
                  try {
                    const keyTypeId = stringToU8a('imon');
                    const keyOwner = await api.query.session.keyOwner.at(hash, [keyTypeId, authorityId]);

                    if (keyOwner.isSome) {
                      const validatorId = keyOwner.unwrap().toString().toLowerCase();
                      authorityToValidator[authorityHex] = validatorId;
                    }
                  } catch (_) {}
                }

                const validator = authorityToValidator[authorityHex];
                if (validator && validatorData[validator]) {
                  validatorData[validator].heartbeats.push({
                    block: blockNumber,
                    time: Math.floor(timestampMs / 1000),
                  });
                }
              }
            }
          } catch (_) {}
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
