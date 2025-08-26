// /api/blockAuthors.js
import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";

const WS_ENDPOINT = "wss://rpc-mainnet.vtrs.io:443";
const BATCH_SIZE = 50; // adjust if needed

export default async function handler(req, res) {
  try {
    const { startBlock } = req.query;
    if (!startBlock) {
      return res.status(400).json({ error: "Missing startBlock parameter" });
    }

    const start = parseInt(startBlock, 10);
    await cryptoWaitReady();
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });

    // Get latest finalized block
    const finalizedHead = await api.rpc.chain.getFinalizedHead();
    const latestHeader = await api.rpc.chain.getHeader(finalizedHead);
    const latestBlock = latestHeader.number.toNumber();

    const fetchedAt = Math.floor(Date.now() / 1000);
    const results = [];

    for (let i = start; i <= latestBlock; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE - 1, latestBlock);
      const blockNumbers = [];
      for (let b = i; b <= batchEnd; b++) blockNumbers.push(b);

      const hashes = await Promise.all(
        blockNumbers.map(num => api.rpc.chain.getBlockHash(num))
      );

      const signedBlocks = await Promise.all(
        hashes.map(hash => api.rpc.chain.getBlock(hash))
      );

      for (let j = 0; j < blockNumbers.length; j++) {
        const blockNumber = blockNumbers[j];
        const hash = hashes[j];
        const block = signedBlocks[j].block;

        // Extract author
        const header = await api.rpc.chain.getHeader(hash);
        const author = (await api.derive.chain.getHeader(header)).author?.toString();

        // Timestamp
        const timestamp = (await api.query.timestamp.now.at(hash)).toNumber();

        // Authored row
        if (author) {
          results.push({
            validator: author,
            block: blockNumber,
            timestamp,
            type: "authored",
            fetchedAt
          });
        }

        // Heartbeats
        const events = await api.query.system.events.at(hash);
        for (const { event } of events) {
          if (event.section === "imOnline" && event.method === "HeartbeatReceived") {
            const validator = event.data[0].toString();
            results.push({
              validator,
              block: blockNumber,
              timestamp,
              type: "heartbeat",
              fetchedAt
            });
          }
        }
      }
    }

    await api.disconnect();
    res.status(200).json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unknown error occurred" });
  }
}
