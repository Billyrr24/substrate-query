const { ApiPromise, WsProvider } = require('@polkadot/api');

// Define WebSocket endpoint
const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';

module.exports = async (req, res) => {
    try {
        // Connect to the Substrate blockchain
        const provider = new WsProvider(WS_ENDPOINT);
        const api = await ApiPromise.create({ provider });

        // Query current era safely
        const currentEraRaw = await api.query.energyGeneration.currentEra();
        const currentEra = currentEraRaw.toJSON();
        const previousEra = currentEra - 1; // Get currentEra - 1

        // Fetch all required data
        const [
            exchangeRate,
            annualPercentageRate,
            sessionEnergyBurn,
            sessionEnergySale,
            energyCapacity,
            currentEnergyPerStakeCurrency,
            baseFee,
            erasEnergyPerStakeCurrency
        ] = await Promise.all([
            api.query.dynamicEnergy.exchangeRate(),
            api.query.dynamicEnergy.annualPercentageRate(),
            api.query.dynamicEnergy.sessionEnergyBurn(),
            api.query.dynamicEnergy.sessionEnergySale(),
            api.query.energyBroker.energyCapacity(),
            api.query.energyGeneration.currentEnergyPerStakeCurrency(),
            api.query.energyFee.baseFee(),
            api.query.energyGeneration.erasEnergyPerStakeCurrency(previousEra) // Query for previous era
        ]);

        // Format response JSON
        const responseData = {
            dynamicEnergy: {
                exchangeRate: exchangeRate.toHuman(),
                annualPercentageRate: annualPercentageRate.toHuman(),
                sessionEnergyBurn: sessionEnergyBurn.toHuman(),
                sessionEnergySale: sessionEnergySale.toHuman(),
            },
            energyBroker: {
                energyCapacity: energyCapacity.toHuman(),
            },
            energyGeneration: {
                currentEnergyPerStakeCurrency: currentEnergyPerStakeCurrency.toHuman(),
                erasEnergyPerStakeCurrency: {
                    era: previousEra,
                    value: erasEnergyPerStakeCurrency.toHuman()
                }
            },
            energyFee: {
                baseFee: baseFee.toHuman()
            }
        };

        // Close WebSocket connection
        await api.disconnect();

        // Return response as JSON
        return res.status(200).json(responseData);
    } catch (error) {
        console.error('Error querying the blockchain:', error);
        return res.status(500).json({ error: 'Failed to fetch data from the blockchain.' });
    }
};
