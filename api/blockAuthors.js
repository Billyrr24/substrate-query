import { ApiPromise, WsProvider } from "@polkadot/api";

export default async function handler(req, res) {
  try {
    const { startBlock = 0, limit = 100 } = req.query;

    const wsProvider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider: wsProvider });

    const start = parseInt(startBlock);
    const maxBlocks = parseInt(limit);

    let results = [];

    for (let i = 0; i < maxBlocks; i++) {
      const blockNumber = start + i;

      try {
        const hash = await api.rpc.chain.getBlockHash(blockNumber);
        const signedBlock = await api.rpc.chain.getBlock(hash);

        const timestamp = await api.query.timestamp.now.at(hash);
        const digest = signedBlock.block.header.digest;

        // Extract author
        const author = digest.logs
          .filter(log => log.isPreRuntime)
          .map(log => {
            const [consensusEngine, authorRaw] = log.asPreRuntime;
            return authorRaw.toString();
          })[0] || "Unknown";

        // Heartbeat info
        let heartbeat = "N/A";
        try {
          const heartbeats = await api.query.imOnline?.receivedHeartbeats.at(hash);
          heartbeat = heartbeats ? JSON.stringify(heartbeats.toHuman()) : "N/A";
        } catch {
          heartbeat = "Not available";
        }

        results.push({
          blockNumber,
          hash: hash.toString(),
          author,
          timestamp: new Date(timestamp.toNumber()).toISOString(),
          heartbeat
        });

      } catch (err) {
        console.error(`Error fetching block ${blockNumber}:`, err.message);
      }
    }

    await api.disconnect();
    res.status(200).json({ results });

  } catch (error) {
    console.error("Fatal error:", error);
    res.status(500).json({ error: error.message });
  }
}
