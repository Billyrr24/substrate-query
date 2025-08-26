import { ApiPromise, WsProvider } from "@polkadot/api";

export default async function handler(req, res) {
  try {
    const { startBlock, endBlock } = req.query;
    if (!startBlock || !endBlock) {
      return res.status(400).json({ error: "Missing startBlock or endBlock" });
    }

    const provider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider });

    const results = [];
    const batchSize = 10; // process 10 blocks at a time

    for (let i = parseInt(startBlock); i <= parseInt(endBlock); i += batchSize) {
      const batchEnd = Math.min(i + batchSize - 1, parseInt(endBlock));
      const blockRange = [];

      for (let j = i; j <= batchEnd; j++) {
        const blockHash = await api.rpc.chain.getBlockHash(j);
        const signedBlock = await api.rpc.chain.getBlock(blockHash);

        blockRange.push({
          blockNumber: j,
          blockHash: blockHash.toString(),
          extrinsics: signedBlock.block.extrinsics.length,
        });
      }

      results.push(...blockRange);

      // short pause to avoid hammering RPC + give Vercel breathing room
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await api.disconnect();

    return res.status(200).json(results);
  } catch (err) {
    console.error("Error fetching blocks:", err);
    return res.status(500).json({ error: err.message });
  }
}
