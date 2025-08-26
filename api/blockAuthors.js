for (let blockNumber = start; blockNumber <= latestBlock; blockNumber++) {
  try {
    const hash = await api.rpc.chain.getBlockHash(blockNumber);
    if (!hash) continue; // skip if hash not found

    // Use try/catch per block
    let header, timestamp, author;
    try {
      header = await api.rpc.chain.getHeader(hash);
      timestamp = (await api.query.timestamp.now.at(hash)).toNumber();
      author = (await api.derive.chain.getHeader(header)).author?.toString() || "Unknown";
    } catch (e) {
      console.warn(`Skipping block ${blockNumber} due to missing header`);
      continue;
    }

    // …then fetch heartbeats/events safely
    const events = await api.query.system.events.at(hash);
    // process heartbeats...
  } catch (_) {
    // skip block if hash retrieval fails
    continue;
  }
}
