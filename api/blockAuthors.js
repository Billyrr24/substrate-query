import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a } from '@polkadot/util';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';

export default async function handler(req, res) {
  try {
    const startBlockParam = req.query.startBlock;
    const blockNumber = parseInt(startBlockParam, 10);
    if (isNaN(blockNumber) || blockNumber < 0) {
      return res.status(400).json({ error: 'Missing or invalid `startBlock` parameter' });
    }

    await cryptoWaitReady();
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    const hash = await api.rpc.chain.getBlockHash(blockNumber);
    const header = await api.rpc.chain.getHeader(hash);
    const timestampMs = (await api.query.timestamp.now.at(hash)).toNumber();
    const ts = Math.floor(timestampMs / 1000);

    const validators = (await api.query.session.validators()).map(v => v.toString().toLowerCase());
    const validatorData = {};
    validators.forEach(v => validatorData[v] = { authored: [], heartbeats: [] });

    // Author of the block
    const author = header.author?.toString()?.toLowerCase();
    if (author && validatorData[author]) {
      validatorData[author].authored.push({ block: blockNumber, time: ts });
    }

    // Heartbeats
    const events = await api.query.system.events.at(hash);
    const authorityToValidator = {};
    const queriedKeyOwners = new Set();

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
          validatorData[validator].heartbeats.push({ block: blockNumber, time: ts });
        }
      }
    }

    await api.disconnect();

    // Only include validators with activity
    const filteredValidatorData = {};
    Object.entries(validatorData).forEach(([v, data]) => {
      if (data.authored.length || data.heartbeats.length) filteredValidatorData[v] = data;
    });

    res.status(200).json({
      blockNumber,
      scannedAt: ts,
      validators: filteredValidatorData,
    });

  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error occurred' });
  }
}
