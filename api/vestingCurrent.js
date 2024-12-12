const { ApiPromise, WsProvider } = require('@polkadot/api');

module.exports = async (req, res) => {
  try {
    // Connect to the Substrate blockchain via the WebSocket provider
    const provider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
    const api = await ApiPromise.create({ provider });

    // Retrieve all account reserves from the balances.reserves pallet
    const reserves = await api.query.balances.reserves.entries();

    const result = reserves.map(([key, value]) => {
      // Extract the account ID
      const accountId = key.args[0].toString();

      // Extract and decode the reserves
      const reserveData = value.map(reserve => ({
        id: Buffer.from(reserve.id.toU8a()).toString('utf-8').trim(), // Decode hex to string
        amount: reserve.amount.toBigInt().toString()
      }));

      return [accountId, reserveData];
    });

    // Respond with the result as JSON
    res.status(200).json(result);

    // Close the connection to the blockchain
    await provider.disconnect();
  } catch (error) {
    console.error('Error querying blockchain:', error);
    res.status(500).json({ error: 'Failed to fetch data from blockchain' });
  }
};
