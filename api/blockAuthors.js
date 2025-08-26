import { ApiPromise, WsProvider } from "@polkadot/api";

// Simplified connection management
let cachedApi = null;

async function getApi() {
  if (cachedApi?.isConnected) {
    return cachedApi;
  }
  
  const wsProvider = new WsProvider("wss://rpc-mainnet.vtrs.io:443", 500, {}, 8000);
  cachedApi = await ApiPromise.create({ provider: wsProvider });
  return cachedApi;
}

async function processBatch(api, blockNumbers) {
  const results = await Promise.allSettled(
    blockNumbers.map(async (blockNum) => {
      const blockHash = await api.rpc.chain.getBlockHash(blockNum);
      
      // Get minimal data in parallel
      const [signedBlock, events] = await Promise.all([
        api.rpc.chain.getBlock(blockHash),
        api.query.system.events.at(blockHash)
      ]);

      // Quick timestamp extraction
      let timestamp = null;
      const timestampExt = signedBlock.block.extrinsics.find(ext => 
        ext.method.section === 'timestamp' && ext.method.method === 'set'
      );
      if (timestampExt) {
        timestamp = new Date(parseInt(timestampExt.method.args[0].toString())).toISOString();
      }

      // Quick author extraction - try multiple methods
      let blockAuthor = null;
      try {
        // Method 1: Check if author is directly available
        if (signedBlock.block.header.author) {
          blockAuthor = signedBlock.block.header.author.toString();
        }
        // Method 2: Look for consensus digest
        else if (signedBlock.block.header.digest?.logs) {
          for (const log of signedBlock.block.header.digest.logs) {
            if (log.isConsensus || log.isPreRuntime) {
              // Simplified extraction - may need chain-specific logic
              try {
                const logData = log.isConsensus ? log.asConsensus : log.asPreRuntime;
                if (logData[0]?.toHex?.() === '0x42414245') { // BABE
                  blockAuthor = 'BABE_AUTHOR'; // Placeholder - complex extraction
                }
              } catch (e) {
                // Skip if extraction fails
              }
            }
          }
        }
      } catch (e) {
        // Continue without author if extraction fails
      }

      // Fast heartbeat detection
      const heartbeats = [];
      events.forEach((record, idx) => {
        const { event } = record;
        if (event.section === 'imOnline') {
          if (event.method === 'HeartbeatReceived') {
            heartbeats.push({
              address: event.data[0]?.toString() || 'Unknown',
              timestamp,
              blockNumber: blockNum
            });
          } else if (['AllGood', 'SomeOffline'].includes(event.method)) {
            heartbeats.push({
              eventType: event.method,
              timestamp,
              blockNumber: blockNum
            });
          }
        }
      });

      return {
        blockNumber: blockNum,
        blockAuthor,
        timestamp,
        heartbeats: heartbeats.length > 0 ? heartbeats : null
      };
    })
  );

  return results.map((result, idx) => 
    result.status === 'fulfilled' 
      ? result.value 
      : { blockNumber: blockNumbers[idx], error: 'Failed to process' }
  );
}

export default async function handler(req, res) {
  const startTime = Date.now();
  const MAX_TIME = 20000; // 20 seconds max
  const MAX_BLOCKS = 50; // Much smaller limit
  
  try {
    const { startBlock, batchSize = 5 } = req.query; // Very small batches
    
    if (!startBlock) {
      return res.status(400).json({ 
        error: "Missing startBlock parameter" 
      });
    }

    const start = parseInt(startBlock);
    const actualBatchSize = Math.min(parseInt(batchSize), 10);

    // Quick timeout check
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), MAX_TIME)
    );

    const processPromise = (async () => {
      const api = await getApi();
      
      // Get finalized head quickly
      const finalizedHead = await api.rpc.chain.getFinalizedHead();
      const finalizedHeader = await api.rpc.chain.getHeader(finalizedHead);
      const latestFinalized = finalizedHeader.number.toNumber();

      if (start > latestFinalized) {
        throw new Error(`Start block ${start} > finalized ${latestFinalized}`);
      }

      const end = Math.min(start + MAX_BLOCKS - 1, latestFinalized);
      const allResults = [];
      const allHeartbeats = [];
      
      let current = start;
      
      while (current <= end && (Date.now() - startTime) < (MAX_TIME - 3000)) {
        const batchEnd = Math.min(current + actualBatchSize - 1, end);
        const blockNumbers = [];
        for (let i = current; i <= batchEnd; i++) {
          blockNumbers.push(i);
        }
        
        const batchResults = await processBatch(api, blockNumbers);
        
        for (const result of batchResults) {
          if (result.error) {
            allResults.push({
              blockNumber: result.blockNumber,
              error: result.error,
              success: false
            });
          } else {
            allResults.push({
              blockNumber: result.blockNumber,
              blockAuthor: result.blockAuthor,
              timestamp: result.timestamp,
              hasHeartbeats: result.heartbeats?.length || 0,
              success: true
            });
            
            if (result.heartbeats) {
              allHeartbeats.push(...result.heartbeats);
            }
          }
        }
        
        current = batchEnd + 1;
      }

      return {
        latestFinalized,
        results: allResults,
        heartbeats: allHeartbeats,
        processedUpTo: current - 1,
        isComplete: current > end
      };
    })();

    const data = await Promise.race([processPromise, timeoutPromise]);
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      metadata: {
        startBlock: start,
        latestFinalizedBlock: data.latestFinalized,
        processedUpTo: data.processedUpTo,
        complete: data.isComplete,
        duration: `${duration}ms`,
        blocksProcessed: data.results.length
      },
      data: {
        blocks: data.results,
        heartbeats: data.heartbeats
      },
      ...((!data.isComplete) && {
        nextRequest: {
          startBlock: data.processedUpTo + 1,
          remaining: data.latestFinalized - data.processedUpTo
        }
      })
    });

  } catch (err) {
    console.error("Error:", err.message);
    
    // Reset connection on error
    if (cachedApi) {
      try { 
        await cachedApi.disconnect(); 
      } catch (e) { 
        // Ignore disconnect errors 
      }
      cachedApi = null;
    }

    return res.status(500).json({ 
      error: err.message,
      duration: `${Date.now() - startTime}ms`
    });
  }
}
