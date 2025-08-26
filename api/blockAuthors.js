import { ApiPromise, WsProvider } from "@polkadot/api";

// Cache connection to reuse across requests
let cachedApi = null;
let connectionPromise = null;

async function getApi() {
  if (cachedApi && cachedApi.isConnected) {
    return cachedApi;
  }
  
  if (!connectionPromise) {
    connectionPromise = createNewConnection();
  }
  
  try {
    cachedApi = await connectionPromise;
    return cachedApi;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
}

async function createNewConnection() {
  const wsProvider = new WsProvider("wss://rpc-mainnet.vtrs.io:443", 1000, {}, 15000);
  return ApiPromise.create({ provider: wsProvider });
}

async function extractBlockData(api, blockNumber) {
  try {
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    const [block, events, header] = await Promise.all([
      api.rpc.chain.getBlock(blockHash),
      api.query.system.events.at(blockHash),
      api.rpc.chain.getHeader(blockHash)
    ]);

    // Extract timestamp from block
    const timestamp = block.block.extrinsics.find(ext => 
      ext.method.section === 'timestamp' && ext.method.method === 'set'
    );
    
    let blockTimestamp = null;
    if (timestamp) {
      const timestampArg = timestamp.method.args[0];
      blockTimestamp = new Date(parseInt(timestampArg.toString())).toISOString();
    }

    // Extract block author from header
    let blockAuthor = null;
    if (header.digest && header.digest.logs) {
      for (const log of header.digest.logs) {
        if (log.isPreRuntime && log.asPreRuntime[0].toHex() === '0x42414245') {
          // This is a BABE pre-runtime digest, extract author
          try {
            const preRuntime = log.asPreRuntime[1];
            // Author extraction logic may vary by chain - this is a common pattern
            blockAuthor = header.author ? header.author.toString() : 'Unknown';
          } catch (e) {
            console.log(`Could not extract author for block ${blockNumber}`);
          }
          break;
        }
      }
    }

    // Extract heartbeat events
    const heartbeats = [];
    events.forEach((record, index) => {
      const { event } = record;
      
      // Look for heartbeat events - adjust section/method names based on your chain
      if (event.section === 'imOnline' && event.method === 'HeartbeatReceived') {
        heartbeats.push({
          eventIndex: index,
          address: event.data[0] ? event.data[0].toString() : null,
          timestamp: blockTimestamp,
          blockNumber: blockNumber,
          blockHash: blockHash.toHex()
        });
      }
      
      // Also check for other heartbeat-related events
      if (event.section === 'imOnline' && 
          (event.method === 'AllGood' || event.method === 'SomeOffline')) {
        heartbeats.push({
          eventIndex: index,
          eventType: event.method,
          data: event.data.map(d => d.toString()),
          timestamp: blockTimestamp,
          blockNumber: blockNumber,
          blockHash: blockHash.toHex()
        });
      }
    });

    return {
      blockNumber,
      blockHash: blockHash.toHex(),
      blockAuthor,
      timestamp: blockTimestamp,
      heartbeats: heartbeats.length > 0 ? heartbeats : null,
      success: true
    };

  } catch (error) {
    return {
      blockNumber,
      error: error.message,
      success: false
    };
  }
}

export default async function handler(req, res) {
  const startTime = Date.now();
  const TIMEOUT_MS = 25000; // 25 seconds
  const MAX_BLOCKS_PER_REQUEST = 100; // Reduced for complex queries
  
  try {
    const { 
      startBlock, 
      batchSize = 10, // Smaller batches for complex queries
      maxBlocks = MAX_BLOCKS_PER_REQUEST 
    } = req.query;

    if (!startBlock) {
      return res.status(400).json({ 
        error: "Missing required parameter: startBlock",
        example: "?startBlock=7111500"
      });
    }

    const api = await getApi();
    const start = parseInt(startBlock);
    
    // Get the latest finalized block
    const finalizedHead = await api.rpc.chain.getFinalizedHead();
    const finalizedHeader = await api.rpc.chain.getHeader(finalizedHead);
    const latestFinalized = finalizedHeader.number.toNumber();

    if (start > latestFinalized) {
      return res.status(400).json({
        error: `Start block (${start}) is greater than latest finalized block (${latestFinalized})`
      });
    }

    // Calculate actual end block (limited by maxBlocks and timeout)
    const requestedRange = latestFinalized - start + 1;
    const actualEnd = Math.min(start + maxBlocks - 1, latestFinalized);
    const actualBatchSize = Math.min(parseInt(batchSize), 20);

    const results = [];
    const allHeartbeats = [];
    let current = start;
    let processedBlocks = 0;

    console.log(`Processing blocks ${start} to ${actualEnd} (${actualEnd - start + 1} blocks)`);

    while (current <= actualEnd && (Date.now() - startTime) < TIMEOUT_MS) {
      const batchEnd = Math.min(current + actualBatchSize - 1, actualEnd);
      const batchPromises = [];

      // Create batch with individual timeouts
      for (let blockNum = current; blockNum <= batchEnd; blockNum++) {
        const blockPromise = Promise.race([
          extractBlockData(api, blockNum),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Block processing timeout')), 8000)
          )
        ]);
        
        batchPromises.push(blockPromise);
      }

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          const blockData = result.value;
          results.push({
            blockNumber: blockData.blockNumber,
            blockHash: blockData.blockHash,
            blockAuthor: blockData.blockAuthor,
            timestamp: blockData.timestamp,
            hasHeartbeats: blockData.heartbeats ? blockData.heartbeats.length : 0,
            success: blockData.success
          });
          
          // Collect all heartbeats separately
          if (blockData.heartbeats) {
            allHeartbeats.push(...blockData.heartbeats);
          }
        } else {
          results.push({
            blockNumber: current + batchResults.indexOf(result),
            error: result.reason?.message || "Block processing failed",
            success: false
          });
        }
        processedBlocks++;
      }

      current += actualBatchSize;

      // Early exit check
      if ((Date.now() - startTime) > (TIMEOUT_MS - 5000)) {
        console.log('Approaching timeout, stopping early');
        break;
      }
    }

    const isComplete = current > actualEnd;
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      metadata: {
        requestInfo: {
          startBlock: start,
          latestFinalizedBlock: latestFinalized,
          requestedRange: requestedRange,
          maxBlocksLimit: maxBlocks
        },
        processed: {
          startBlock: start,
          endBlock: Math.min(current - 1, actualEnd),
          totalProcessed: processedBlocks,
          complete: isComplete
        },
        performance: {
          duration: `${duration}ms`,
          batchSize: actualBatchSize,
          avgTimePerBlock: `${(duration / processedBlocks).toFixed(2)}ms`
        }
      },
      data: {
        blockCount: results.length,
        blocks: results,
        heartbeatCount: allHeartbeats.length,
        heartbeats: allHeartbeats
      },
      ...((!isComplete) && {
        nextRequest: {
          startBlock: current,
          note: `Continue with this startBlock to fetch remaining blocks up to ${latestFinalized}`,
          estimatedRemainingBlocks: latestFinalized - current + 1
        }
      })
    });

  } catch (err) {
    console.error("Handler error:", err);
    
    if (err.message?.includes('connection') || err.message?.includes('timeout')) {
      cachedApi = null;
      connectionPromise = null;
    }

    return res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}

export async function cleanup() {
  if (cachedApi && cachedApi.isConnected) {
    await cachedApi.disconnect();
    cachedApi = null;
    connectionPromise = null;
  }
}
