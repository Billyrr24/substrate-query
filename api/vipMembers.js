// Import required modules or libraries (e.g., for blockchain querying)
const { ApiPromise, WsProvider } = require('@polkadot/api');

// Define your handler function for Vercel
module.exports = async (req, res) => {
  try {
    // Initialize the WebSocket provider and API instance
    const provider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
    const api = await ApiPromise.create({ provider });

    // Fetch VIP Members
    const vipMembers = await api.query.privileges.vipMembers.entries();

    // Log the response to check its structure
    console.log('VIP Members data:', vipMembers);

    // Initialize an array to store the results
    const results = [];

    // Process each VIP Member
    for (let [key, value] of vipMembers) {
      // Log the individual key and value for debugging
      console.log('Processing VIP Member - Key:', key.toString());
      console.log('Processing VIP Member - Value:', value.toJSON());  // Log value in JSON format

      // Check if key and value are defined and process them
      if (key && value) {
        // Convert hex values for points and activeStake to decimal
        const points = value.points ? parseInt(value.points, 16) : 'N/A';
        const activeStake = value.activeStake ? parseInt(value.activeStake, 16) : 'N/A';

        // Build the member object
        const member = {
          address: key.toString(),
          start: value.start ? value.start.toString() : 'N/A',  // 'start' should be in milliseconds
          taxType: value.taxType || 'N/A',  // Use taxType directly if available
          points: points !== 'N/A' ? points.toString() : 'N/A',  // Convert to string after processing
          activeStake: activeStake !== 'N/A' ? activeStake.toString() : 'N/A',  // Convert to string after processing
        };

        results.push(member);
      } else {
        console.error('Missing data for VIP Member at index:', key);
      }
    }

    // Send the processed data back as the response
    res.status(200).json(results);
  } catch (error) {
    console.error('Error processing VIP Members:', error);
    res.status(500).send('Internal Server Error');
  }
};
