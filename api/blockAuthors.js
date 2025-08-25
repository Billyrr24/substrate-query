import { ApiPromise, WsProvider } from '@polkadot/api';

const RPC = 'wss://rpc-mainnet.vtrs.io:443';

async function main() {
  const provider = new WsProvider(RPC);
  const api = await ApiPromise.create({ provider });

  // Define block range
  const latest = await api.rpc.chain.getHeader();
  const latestNumber = latest.number.toNumber();
  const start = latestNumber - 200; // fetch last 200 blocks only

  console.log(`Fetching authors from block #${start} to #${latestNumber}`);

  for (let blockNumber = start; blockNumber <= latestNumber; blockNumber++) {
    try {
      const hash = await api.rpc.chain.getBlockHash(blockNumber);
      const header = await api.derive.chain.getHeader(hash);

      // author is always present
      const author = header?.author?.toString() || 'unknown';

      console.log(`Block #${blockNumber} authored by: ${author}`);
    } catch (err) {
      console.error(`Error fetching block #${blockNumber}:`, err.message);
    }
  }

  await api.disconnect();
}

main().catch(console.error);
