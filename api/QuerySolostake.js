// Import the required libraries
const { ApiPromise, WsProvider } = require('@polkadot/api');

export default async function handler(req, res) {
  try {
    // Connect to the Substrate blockchain
    const wsProvider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
    const api = await ApiPromise.create({ provider: wsProvider });

    // Query all entries for energyGeneration.ledger
    const entries = await api.query.energyGeneration.ledger.entries();

    // Format all data into an array
    const allData = entries.map(([key, ledger]) => {
      const accountId = key.args.map((k) => k.toHuman()).toString();
      return {
        accountId,
        ledger: ledger.toHuman(),
      };
    });

    // Disconnect
    await api.disconnect();

    // Return the data as a JSON response
    res.status(200).json({
      success: true,
      data: allData,
    });
  } catch (error) {
    console.error("Error querying Substrate blockchain:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
