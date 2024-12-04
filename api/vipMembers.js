const { ApiPromise, WsProvider } = require('@polkadot/api');

// This is the handler function that Vercel expects for API routes
module.exports = async (req, res) => {
  const wsProvider = new WsProvider('wss://rpc-mainnet.vtrs.io:443'); // Use your RPC endpoint
  const api = await ApiPromise.create({ provider: wsProvider });

  try {
    // Query the vipMembers in the privileges pallet
    const vipMembers = await api.query.privileges.vipMembers.entries();
    
    // Check if data exists
    if (vipMembers.length === 0) {
      console.log('No VIP members found.');
      return res.status(200).json({ message: 'No VIP members found.' });
    }

    // Process and prepare the data for response
    const results = [];
    vipMembers.forEach(([key, value], index) => {
      const address = key.toHuman()[0]; // Address of the VIP member
      const data = value.unwrapOr(null); // Unwrap the Option

      if (data) {
        const start = data.start.toString();
        const taxType = data.taxType.toString();
        const points = data.points.toString();
        const activeStake = data.activeStake.toString();

        results.push({
          address: address,
          start: start,
          taxType: taxType,
          points: points,
          activeStake: activeStake,
        });
      } else {
        console.log(`VIP Member ${index + 1}: No data available`);
      }
    });

    // Return the processed data as JSON
    res.status(200).json(results);
  } catch (error) {
    console.error('Error querying VIP members:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    // Disconnect after the query
    await api.disconnect();
  }
};
