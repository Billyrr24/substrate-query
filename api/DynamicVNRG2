const { ApiPromise, WsProvider } = require('@polkadot/api');

module.exports = async (req, res) => {
  const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';

  try {
    const provider = new WsProvider(WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });

    console.log('✅ Connected to Substrate blockchain');

    // Query the blockchain
    const [
      exchangeRateParams,
      generationRateParams,
      exchangeRate,
      sessionEnergyBurn,
      sessionEnergySale,
      energyBurnEntries
    ] = await Promise.all([
      api.query.dynamicEnergy.exchangeRateParams(),
      api.query.dynamicEnergy.generationRateParams(),
      api.query.dynamicEnergy.exchangeRate(),
      api.query.dynamicEnergy.sessionEnergyBurn(),
      api.query.dynamicEnergy.sessionEnergySale(),
      api.query.energyBroker.energyBurn.entries()  // Accumulated list
    ]);

    // Format accumulated energy burn data
    const energyBurnData = energyBurnEntries.map(([key, value]) => {
      const accountId = key.args[0].toString();
      const amount = value.toString();
      return { accountId, amount };
    });

    // Prepare the response data
    const result = {
      exchangeRateParams: exchangeRateParams.toHuman(),
      generationRateParams: generationRateParams.toHuman(),
      exchangeRate: exchangeRate.toString(),
      sessionEnergyBurn: sessionEnergyBurn.toString(),
      sessionEnergySale: sessionEnergySale.toString(),
      energyBurn: energyBurnData
    };

    res.status(200).json(result);
    console.log('✅ Data fetched successfully');

  } catch (error) {
    console.error('❌ Error querying blockchain:', error);
    res.status(500).json({ error: 'Failed to fetch data from blockchain' });
  }
};
