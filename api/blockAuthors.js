import { ApiPromise, WsProvider } from '@polkadot/api';

const WS_URL = 'wss://rpc-mainnet.vtrs.io:443';

async function main() {
  const provider = new WsProvider(WS_URL);
  const api = await ApiPromise.create({ provider });

  const startBlock = 1000;
  const endBlock = 1020;

  // Collect all block numbers
  const blockNumbers = Array.from({ length: endBlock - startBlock + 1 }, (_, i) => startBlock + i);

  // Fetch all authors in parallel
  const results = await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      const hash = await api.rpc.chain.getBlockHash(blockNumber);
      const signedBlock = await api.rpc.chain.getBlock(hash);

      // Fetch author with api.derive
      const { author } = await api.derive.chain.getHeader(signedBlock.block.header);

      return {
        blockNumber,
        author: author?.toString() || 'Unknown',
      };
    })
  );

  // Print results
  for (const { blockNumber, author } of results) {
    console.log(`Block ${blockNumber}: ${author}`);
  }

  await api.disconnect();
}

main().catch(console.error);
