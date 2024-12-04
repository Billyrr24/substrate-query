const { ApiPromise, WsProvider } = require('@polkadot/api');

module.exports = async (req, res) => {
  try {
    // Connect to the Substrate blockchain
    const wsProvider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
    const api = await ApiPromise.create({ provider: wsProvider });

    // Get all keys for the `privileges.vippMembers` map
    const keys = await api.query.privileges.vippMembers.keys();
    if (keys.length === 0) {
      res.status(200).json({ message: 'No VIPP members found.' });
    } else {
      // Extract the addresses from the keys
      const addresses = keys.map((key) => key.args[0]);

      // Batch query all the values
      const memberInfos = await api.query.privileges.vippMembers.multi(addresses);

      // Format the results
      const result = addresses.map((address, index) => {
        const memberInfo = memberInfos[index];
        if (memberInfo.isSome) {
          const data = memberInfo.unwrap();
          return {
            address: address.toHuman(),
            points: data.points.toString(),
            activeVippThreshold: data.activeVippThreshold.map(([nft, threshold]) => ({
              nft: nft.toString(),
              threshold: threshold.toString(),
            })),
          };
        } else {
          return { address: address.toHuman(), message: 'No data found for this address.' };
        }
      });

      // Respond with the results
      res.status(200).json(result);
    }

    // Disconnect from the blockchain
    await api.disconnect();
  } catch (error) {
    console.error('Error querying the blockchain:', error);
    res.status(500).json({ error: 'Error querying the blockchain', details: error.message });
  }
};
