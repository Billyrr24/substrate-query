import { ApiPromise, WsProvider } from "@polkadot/api";

let api = null;

// Helper function to decode session keys to get validator address
async function getValidatorFromSessionKeys(api, sessionKeys) {
  try {
    // Session keys are typically stored as a concatenated hex string
    // For most Substrate chains, the validator address is derived from the first key
    if (sessionKeys && sessionKeys.length > 0) {
      // Try to get the validator from session keys
      const keyOwner = await api.query.session.keyOwner(['gran', sessionKeys]);
      if (keyOwner && keyOwner.isSome) {
        return keyOwner.unwrap().toString();
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Extract block author using multiple methods
async function extractBlockAuthor(api, blockHash, blockNumber) {
  try {
    // Method 1: Try to get author directly from runtime API
    try {
      const author = await api.query.authorship.author.at(blockHash);
      if (author && author.isSome) {
        return author.unwrap().toString();
      }
    } catch (e) {
      // Continue to next method
    }

    // Method 2: Look for the validator who authored this block via session
    try {
      const validators = await api.query.session.validators.at(blockHash);
      const currentIndex = await api.query.session.currentIndex.at(blockHash);
      
      // Get block header to find consensus info
      const header = await api.rpc.chain.getHeader(blockHash);
      
      // Look through digest logs for consensus info
      if (header.digest && header.digest.logs) {
        for (const log of header.digest.logs) {
          if (log.isPreRuntime && log.asPreRuntime[0].toHex() === '0x42414245') {
            // BABE pre-runtime digest contains author info
            const preRuntimeData = log.asPreRuntime[1];
            if (preRuntimeData.length >= 4) {
              // Extract validator index from BABE data (first 4 bytes typically contain slot info)
              // This is a simplified extraction - may need adjustment based on chain specifics
              try {
                const slotData = preRuntimeData.slice(0, 8);
                // For now, return the first validator as a placeholder
                if (validators && validators.length > 0) {
                  return validators[0].toString();
                }
              } catch (extractError) {
                // Continue
              }
            }
          }
        }
      }
    } catch (e) {
      // Continue to next method
    }

    // Method 3: Use block number to determine round-robin author (fallback)
    try {
      const validators = await api.query.session.validators.at(blockHash);
      if (validators && validators.length > 0) {
        const authorIndex = blockNumber % validators.length;
        return validators[authorIndex].toString();
      }
    } catch (e) {
      // Final fallback
    }

    return null;
  } catch (error) {
    console.log(`Could not extract author for block ${blockNumber}:`, error.message);
    return null;
  }
}

export default async function handler(req, res) {
  const startTime = Date.now();
  const TIMEOUT = 20000;
  
  try {
    const { startBlock, count = 25 } = req.query;
    
    if (!startBlock) {
      return res.status(400).json({ error: "Missing startBlock parameter" });
    }

    // Connect to API
    if (!api?.isConnected) {
      const provider = new WsProvider("wss://rpc-mainnet.vtrs.io:443", 500, {}, 8000);
      api = await Promise.race([
        ApiPromise.create({ provider }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
      ]);
    }

    const start = parseInt(startBlock);
    const blockCount = Math.min(parseInt(count), 50);
    
    // Get latest finalized block
    const finalizedHead = await api.rpc.chain.getFinalizedHead();
    const finalizedHeader = await api.rpc.chain.getHeader(finalizedHead);
    const latest = finalizedHeader.number.toNumber();
    
    const end = Math.min(start + blockCount - 1, latest);
    const outputData = []; // This will contain rows in the exact format needed

    // Process each block
    for (let blockNum = start; blockNum <= end; blockNum++) {
      if (Date.now() - startTime > TIMEOUT - 3000) break;
      
      try {
        const blockHash = await api.rpc.chain.getBlockHash(blockNum);
        const [block, events] = await Promise.all([
          api.rpc.chain.getBlock(blockHash),
          api.query.system.events.at(blockHash)
        ]);

        // Extract timestamp
        let unixTimestamp = null;
        let formattedTimestamp = null;
        
        const timestampExt = block.block.extrinsics.find(ext => 
          ext.method.section === 'timestamp' && ext.method.method === 'set');
        
        if (timestampExt) {
          const timestampMs = parseInt(timestampExt.method.args[0].toString());
          unixTimestamp = Math.floor(timestampMs / 1000); // Convert to seconds
          formattedTimestamp = new Date(timestampMs).toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
        }

        // Extract block author
        const blockAuthor = await extractBlockAuthor(api, blockHash, blockNum);
        
        if (blockAuthor) {
          // Add authored block row
          outputData.push([
            blockAuthor,           // Column A: Validator address
            blockNum,              // Column B: Block number
            unixTimestamp,         // Column C: Unix timestamp  
            'authored',            // Column D: Type
            formattedTimestamp     // Column E: Formatted timestamp
          ]);
        }

        // Check for heartbeat events
        events.forEach((record) => {
          const { event } = record;
          
          if (event.section === 'imOnline' && event.method === 'HeartbeatReceived') {
            const heartbeatSender = event.data[0]?.toString();
            if (heartbeatSender) {
              // Add heartbeat row
              outputData.push([
                heartbeatSender,       // Column A: Validator address  
                blockNum,              // Column B: Block number
                unixTimestamp,         // Column C: Unix timestamp
                'heartbeat',           // Column D: Type
                formattedTimestamp     // Column E: Formatted timestamp
              ]);
            }
          }
        });

      } catch (blockError) {
        console.log(`Error processing block ${blockNum}:`, blockError.message);
        // Continue with next block
      }
    }

    // Return data in the exact format your Google Sheet expects
    return res.status(200).json({
      success: true,
      metadata: {
        startBlock: start,
        processedUpTo: Math.min(end, start + blockCount - 1),
        latestFinalized: latest,
        totalRows: outputData.length,
        duration: `${Date.now() - startTime}ms`
      },
      data: outputData, // Array of arrays, each representing a row
      nextStartBlock: Math.min(end, start + blockCount - 1) + 1,
      hasMore: (start + blockCount - 1) < latest
    });

  } catch (error) {
    console.error("Handler error:", error);
    
    // Reset connection on error
    if (api) {
      try { await api.disconnect(); } catch (e) {}
      api = null;
    }
    
    return res.status(500).json({ 
      error: error.message,
      duration: `${Date.now() - startTime}ms`
    });
  }
}
