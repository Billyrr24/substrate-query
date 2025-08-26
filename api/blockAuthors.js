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
    connectionPromise = null; // Reset on failure
    throw error;
  }
}

async function createNewConnection() {
  const wsProvider = new WsProvider("wss://rpc-mainnet.vtrs.io:443", 1000, {}, 10000);
  return ApiPromise.create({ provider: wsProvider });
}

export default async function handler(req, res) {
  const startTime = Date.now();
  const TIMEOUT_MS = 25000; // 25 seconds (Vercel timeout is 30s)
  const MAX_BLOCKS = 500; // Limit total blocks per request
  
  try {
    const { 
      startBlock, 
      endBlock, 
      batchSize = 25, // Reduced default batch size
      maxBlocks = MAX_BLOCKS 
    } = req.query;

    if (!startBlock || !endBlock) {
      return res.status(400).json({ 
        error: "Missing required parameters: startBlock and endBlock" 
      });
    }

    const start = parseInt(startBlock);
    const end = parseInt(endBlock);
    const actualBatchSize = Math.min(parseInt(batchSize), 50); // Cap batch size
    const blockRange = end - start + 1;

    // Validate request size
    if (blockRange > maxBlocks) {
      return res.status(400).json({ 
        error: `Block range too large. Maximum ${maxBlocks} blocks allowed. Requested: ${blockRange}`,
        suggestion: `Consider splitting into smaller ranges or increase maxBlocks parameter`
      });
    }

    if (start > end) {
      return res.status(400).json({ 
        error: "startBlock must be less than or equal to endBlock" 
      });
    }

    const api = await getApi();
    const results = [];
    let current = start;
    let processedBlocks = 0;

    // Stream results and check timeout frequently
    while (current <= end && (Date.now() - startTime) < TIMEOUT_MS) {
      const batchEnd = Math.min(current + actualBatchSize - 1, end);
      const batchPromises = [];

      // Create batch with timeout for each individual request
      for (let blockNum = current; blockNum <= batchEnd; blockNum++) {
        const blockPromise = Promise.race([
          api.rpc.chain.getBlockHash(blockNum)
            .then(hash => api.rpc.chain.getBlock(hash))
            .then(block => ({
              blockNumber: blockNum,
              hash: block.block.header.parentHash.toHex(),
              extrinsicsCount: block.block.extrinsics.length,
              timestamp: Date.now()
            })),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Block request timeout')), 5000)
          )
        ]);
        
        batchPromises.push(blockPromise);
      }

      // Process batch with early timeout check
      const settled = await Promise.allSettled(batchPromises);
      
      for (let i = 0; i < settled.length; i++) {
        const result = settled[i];
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            blockNumber: current + i,
            error: result.reason?.message || "Block fetch failed"
          });
        }
        processedBlocks++;
      }

      current += actualBatchSize;

      // Early exit if approaching timeout
      if ((Date.now() - startTime) > (TIMEOUT_MS - 3000)) {
        break;
      }
    }

    const isComplete = current > end;
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      metadata: {
        requested: { startBlock: start, endBlock: end },
        processed: { 
          startBlock: start, 
          endBlock: current - 1,
          totalProcessed: processedBlocks 
        },
        complete: isComplete,
        duration: `${duration}ms`,
        batchSize: actualBatchSize
      },
      count: results.length,
      blocks: results,
      ...((!isComplete) && {
        nextRequest: {
          startBlock: current,
          endBlock: end,
          note: "Use these parameters to continue fetching remaining blocks"
        }
      })
    });

  } catch (err) {
    console.error("Handler error:", err);
    
    // Don't disconnect cached connection on error, just log it
    if (err.message?.includes('connection') || err.message?.includes('timeout')) {
      // Reset connection cache if it's a connection issue
      cachedApi = null;
      connectionPromise = null;
    }

    return res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Optional: Export cleanup function for graceful shutdown
export async function cleanup() {
  if (cachedApi && cachedApi.isConnected) {
    await cachedApi.disconnect();
    cachedApi = null;
    connectionPromise = null;
  }
}
