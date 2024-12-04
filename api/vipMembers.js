// Import required modules or libraries (e.g., for blockchain querying)
const { ApiPromise, WsProvider } = require('@polkadot/api');

// Define your handler function for Vercel
module.exports = async (req, res) => {
  try {
    // Logic for querying the blockchain (or other logic) goes here
    const provider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
    const api = await ApiPromise.create({ provider });

    // Fetch VIP Members (as you did earlier)
    const vipMembers = await api.query.privileges.vipMembers.entries();

    const results = [];
    for (let [key, value] of vipMembers) {
      // Processing each VIP Member as you did
      const member = {
        address: key.toString(),
        start: value.start.toString(),
        taxType: value.taxType.toString(),
        points: value.points.toString(),
        activeStake: value.activeStake.toString(),
      };
      results.push(member);
    }

    // Send the processed data back as the response
    res.status(200).json(results);
  } catch (error) {
    console.error('Error processing VIP Members:', error);
    res.status(500).send('Internal Server Error');
  }
};
