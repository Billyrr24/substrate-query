// Install dependencies with: npm install @polkadot/api 
const { ApiPromise, WsProvider } = require('@polkadot/api');

// Define WebSocket endpoint
const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';

module.exports = async (req, res) => {
    try {
        // Connect to the Substrate blockchain
        const provider = new WsProvider(WS_ENDPOINT);
        const api = await ApiPromise.create({ provider });

        console.log('Connected to the Substrate blockchain.');

        // Query the current era first
        const currentEra = await api.query.energyGeneration.currentEra();
        console.log('Current Era:', currentEra.toHuman()); // Debug log

        const previousEra = currentEra.toNumber() - 1;
        console.log('Previous Era:', previousEra); // Debug log

        // Query all extrinsics including the previous era's energy data
        const [
            exchangeRate,
            annualPercentageRate,
            sessionEnergyBurn,
            sessionEnergySale,
            energyCapacity,
            currentEnergyPerStakeCurrency,
            baseFee
        ] = await Promise.all([
            api.query.dynamicEnergy.exchangeRate(),
            api.query.dynamicEnergy.annualPercentageRate(),
            api.query.dynamicEnergy.sessionEnergyBurn(),
            api.query.dynamicEnergy.sessionEnergySale(),
            api.query.energyBroker.energyCapacity(),
            api.query.energyGeneration.currentEnergyPerStakeCurrency(),
            api.query.energyFee.baseFee()
        ]);

        // Query the previous era's energy per stake currency separately
        let previousEraEnergyPerStakeCurrency;
        if (previousEra >= 0) { // Ensure previousEra is valid
            previousEraEnergyPerStakeCurrency = await api.query.energyGeneration.erasEnergyPerStakeCurrency(previousEra);
            console.log('Previous Era Energy Per Stake Currency:', previousEraEnergyPerStakeCurrency.toHuman()); // Debug log
        } else {
            previousEraEnergyPerStakeCurrency = 'N/A';
        }

        // Format data into a single object
        const output = {
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
                previousEra: previousEra, // Include the previous era number for reference
            },
            energyFee: {
                baseFee: baseFee.toHuman(),
            }
        };

        // Log output for debugging
        console.log('Final Output:', JSON.stringify(output, null, 2));

        // Return the data as JSON
        res.status(200).json(output);
    } catch (error) {
        console.error('Error querying the blockchain:', error);
        res.status(500).json({ error: 'Failed to fetch data from the blockchain.' });
    }
};
