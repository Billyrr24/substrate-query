// File: /api/validatorActivity.js
import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const MAX_BLOCKS = 200; // smaller batch for performance

export default async function handler(req, res) {
  try {
    const startBlockParam = req.query.startBlock || req.query.startblock;
    let startBlock = parseInt(startBlockParam, 10);
    if (!startBlock || isNaN(startBlock) || startBlock < 0) {
      return res.status(400).json({ error: 'Missing or invalid `startBlock` parameter' });
    }
    startBlock += 1;

    await cryptoWaitReady();
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    // --- Validators ---
    const validators = (await api.query.session.validators()).map((v) => v.toString().toLowerCase());
    const validatorData = {};
    validators.forEach((v) => {
      validatorData[v] = { authored: [], heartbeats: [] };
    });

    // --- Authority → Validator mapping ---
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

    // --- Block window ---
    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();
    const endBlock = Math.min(startBlock + MAX_BLOCKS, currentBlock);

    // --- Process blocks in parallel ---
    const blockNumbers = [];
    for (let b = startBlock; b <= endBlock; b++) {
      blockNumbers.push(b);
    }

    await Promise.all(
      blockNumbers.map(async (blockNumber) => {
        try {
          const hash = await api.rpc.chain.getBlockHash(blockNumber);
          const header = await api.rpc.chain.getHeader(hash);

          // Get system events for the block
          const events = await api.query.system.events.at(hash);

          const ts = Date.now() / 1000; // fallback timestamp

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
          // ignore per-block errors
        }
      })
    );

    await api.disconnect();

    // --- Filter ---
    const filteredValidatorData = {};
    Object.entries(validatorData).forEach(([v, data]) => {
      if (data.authored.length || data.heartbeats.length) {
        filteredValidatorData[v] = data;
      }
    });

    res.status(200).json({
      fromBlock: startBlock,
      toBlock: endBlock,
      scannedAt: Math.floor(Date.now() / 1000),
      validators: filteredValidatorData,
      hasMore: endBlock < currentBlock,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error occurred' });
  }
}
