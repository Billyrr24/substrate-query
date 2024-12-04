const { ApiPromise, WsProvider } = require('@polkadot/api');

async function queryVipMembers() {
  // Connect to the Substrate-based blockchain via WebSocket
  const wsProvider = new WsProvider('wss://rpc-mainnet.vtrs.io:443'); // Use your RPC endpoint
  const api = await ApiPromise.create({ provider: wsProvider });

  try {
    // Query the vipMembers in the privileges pallet
    const vipMembers = await api.query.privileges.vipMembers.entries();
    
    // Check if data exists
    if (vipMembers.length === 0) {
      console.log('No VIP members found.');
      return;
    }

    // Process and log the data
    vipMembers.forEach(([key, value], index) => {
      const address = key.toHuman()[0]; // Address of the VIP member
      const data = value.unwrapOr(null); // Unwrap the Option

      if (data) {
        const start = data.start.toString();
        const taxType = data.taxType.toString();
        const points = data.points.toString();
        const activeStake = data.activeStake.toString();

        console.log(`Processing VIP Member ${index + 1}:`);
        console.log(`Address: ${address}`);
        console.log(`Start: ${start}`);
        console.log(`Tax Type: ${taxType}`);
        console.log(`Points: ${points}`);
        console.log(`Active Stake: ${activeStake}`);
        console.log('-----------------------------------');
      } else {
        console.log(`VIP Member ${index + 1}: No data available`);
      }
    });
  } catch (error) {
    console.error('Error querying VIP members:', error);
  } finally {
    // Disconnect after the query
    await api.disconnect();
  }
}

queryVipMembers();
