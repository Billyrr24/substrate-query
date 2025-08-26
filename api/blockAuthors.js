// filename: blockAuthors.js
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@polkadot/api/options';
import { cryptoWaitReady } from '@polkadot/util-crypto';

async function main() {
  await cryptoWaitReady();
  const provider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
  const api = await ApiPromise.create(options({ provider }));

  // Change this to your desired starting block
  const startBlock = 1000000; 

  // Fetch latest block number automatically
  const latestHash = await api.rpc.chain.getFinalizedHead();
  const latestHeader = await api.rpc.chain.getHeader(latestHash);
  const endBlock = latestHeader.number.toNumber();

  console.log(`Fetching blocks from ${startBlock} to ${endBlock}...\n`);

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    try {
      const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
      const signedBlock = await api.rpc.chain.getBlock(blockHash);

      // Get author
      const blockHeader = await api.rpc.chain.getHeader(blockHash);
      const author = (await api.derive.chain.getHeader(blockHeader)).author?.toString() || 'Unknown';

      // Get timestamp (from timestamp.set extrinsic)
      let timestamp = null;
      signedBlock.block.extrinsics.forEach((ext) => {
        const { method } = ext;
        if (method.section === 'timestamp' && method.method === 'set') {
          timestamp = method.args[0].toHuman();
        }
      });

      // Check for heartbeat extrinsic
      let heartbeatSent = false;
      signedBlock.block.extrinsics.forEach((ext) => {
        const { method } = ext;
        if (method.section === 'imOnline' && method.method === 'heartbeat') {
          heartbeatSent = true;
        }
      });

      console.log(
        `Block #${blockNumber} | Author: ${author} | Timestamp: ${timestamp} | Heartbeat: ${heartbeatSent}`
      );
    } catch (err) {
      console.error(`Error at block ${blockNumber}:`, err.message);
    }
  }

  await api.disconnect();
}

main().catch(console.error);
