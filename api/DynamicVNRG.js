const { ApiPromise, WsProvider } = require('@polkadot/api');

const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';

module.exports = async (req, res) => {
    try {
        // Connect to the Substrate blockchain
        const provider = new WsProvider(WS_ENDPOINT);
        const api = await ApiPromise.create({ provider });

        console.log('Connected to the Substrate blockchain.');

        // Query the current era
        const currentEraRaw = await api.query.energyGeneration.currentEra();
        const currentEra = currentEraRaw.toNumber();
        const previousEra = currentEra - 1;

        console.log('Current Era:', currentEra);
        console.log('Previous Era:', previousEra);

        // Query all extrinsics
        const [
            exchangeRate,
            annualPercentageRate,
            sessionEnergyBurn,
            sessionEnergySale,
            energyCapacity,
            currentEnergyPerStakeCurrency,
            baseFee,
            previousEraEnergyPerStakeCurrency
        ] = await Promise.all([
            api.query.dynamicEnergy.exchangeRate(),
            api.query.dynamicEnergy.annualPercentageRate(),
            api.query.dynamicEnergy.sessionEnergyBurn(),
            api.query.dynamicEnergy.sessionEnergySale(),
            api.query.energyBroker.energyCapacity(),
            api.query.energyGeneration.currentEnergyPerStakeCurrency(),
            api.query.energyFee.baseFee(),
            api.query.energyGeneration.erasEnergyPerStakeCurrency(previousEra)
        ]);

        // Format data into a clean JSON structure
        const output = {
            previousEra, // Now separate from `energyGeneration`
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
                previousEraEnergyPerStakeCurrency: previousEraEnergyPerStakeCurrency.toHuman(),
            },
            energyFee: {
                baseFee: baseFee.toHuman(),
            }
        };

        console.log('Final Output:', JSON.stringify(output, null, 2));

        // Return JSON response
        res.status(200).json(output);
    } catch (error) {
        console.error('Error querying the blockchain:', error);
        res.status(500).json({ error: 'Failed to fetch data from the blockchain.' });
    }
};
