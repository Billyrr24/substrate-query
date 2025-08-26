import { ApiPromise, WsProvider } from "@polkadot/api";

export default async function handler(req, res) {
  try {
    const { startBlock, endBlock, batchSize = 50 } = req.query;

    if (!startBlock || !endBlock) {
      return res.status(400).json({ error: "Missing startBlock or endBlock" });
    }

    const wsProvider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider: wsProvider });

    const results = [];
    let current = parseInt(startBlock);

    while (current <= endBlock) {
      const batchEnd = Math.min(current + batchSize - 1, endBlock);

      const blockPromises = [];
      for (let b = current; b <= batchEnd; b++) {
        blockPromises.push(api.rpc.chain.getBlockHash(b)
          .then((hash) => api.rpc.chain.getBlock(hash)
            .then((block) => ({
              blockNumber: b,
              hash: hash.toHex(),
              extrinsicsCount: block.block.extrinsics.length,
            }))));
      }

      const settled = await Promise.allSettled(blockPromises);
      for (const r of settled) {
        if (r.status === "fulfilled") {
          results.push(r.value);
        } else {
          results.push({ error: r.reason?.message || "Query failed" });
        }
      }

      current += batchSize;
    }

    await api.disconnect();

    return res.status(200).json({ count: results.length, blocks: results });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
