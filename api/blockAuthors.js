// /api/validatorActivity.js (for Vercel)
import { ApiPromise, WsProvider } from '@polkadot/api';

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';
const BATCH_SIZE = 30;

let lastScannedBlock = 0; // This will reset each deployment; use an external store in production

export default async function handler(req, res) {
  try {
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    const latestHeader = await api.rpc.chain.getHeader();
    const currentBlock = latestHeader.number.toNumber();
    const startBlock = lastScannedBlock > 0 ? lastScannedBlock + 1 : currentBlock - 200;
    const endBlock = currentBlock;
    lastScannedBlock = endBlock;

    const validators = (await api.query.session.validators()).map((v) => v.toString().toLowerCase());
    const authorityToValidator = {};
    const queriedKeyOwners = new Set();
    const results = [];

    for (let i = startBlock; i <= endBlock; i += BATCH_SIZE) {
      const batch = [...Array(BATCH_SIZE).keys()].map((j) => i + j).filter((b) => b <= endBlock);

      await Promise.all(
        batch.map(async (blockNumber) => {
          try {
            const hash = await api.rpc.chain.getBlockHash(blockNumber);
            const header = await api.derive.chain.getHeader(hash);
            const timestampMs = (await api.query.timestamp.now.at(hash)).toNumber();
            const unixTime = Math.floor(timestampMs / 1000);

            // ✅ Authored blocks
            const author = header.author?.toString()?.toLowerCase();
            if (author && validators.includes(author)) {
              results.push({
                validator: author,
                type: 'authored',
                block: blockNumber,
                timestamp: unixTime
              });
            }

            // ✅ Heartbeats
            const events = await api.query.system.events.at(hash);
            for (const { event } of events) {
              if (event.section === 'imOnline' && event.method === 'HeartbeatReceived') {
                const authorityId = event.data[0];
                const authorityIdHex = authorityId.toHex().toLowerCase();

                if (!authorityToValidator[authorityIdHex] && !queriedKeyOwners.has(authorityIdHex)) {
                  queriedKeyOwners.add(authorityIdHex);

                  try {
                    const keyTypeIdBytes = Uint8Array.from([0x69, 0x6d, 0x6f, 0x6e]);
                    const keyTypeId = api.createType('KeyTypeId', keyTypeIdBytes);
                    const lookupKey = api.createType('(KeyTypeId, [u8; 32])', [keyTypeId, authorityId]);
                    const ownerOpt = await api.query.session.keyOwner(lookupKey);

                    if (ownerOpt.isSome) {
                      const owner = ownerOpt.unwrap().toString().toLowerCase();
                      authorityToValidator[authorityIdHex] = owner;
                    }
                  } catch {}
                }

                const validator = authorityToValidator[authorityIdHex];
                if (validator && validators.includes(validator)) {
                  results.push({
                    validator: validator,
                    type: 'heartbeat',
                    block: blockNumber,
                    timestamp: unixTime
                  });
                }
              }
            }
          } catch (e) {
            // Ignore block errors
          }
        })
      );
    }

    await api.disconnect();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
