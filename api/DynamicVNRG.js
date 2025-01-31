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

        // Query all extrinsics
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
            api.query.energyFee.baseFee() // Added energyFee.baseFee query
        ]);

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
            },
            energyFee: {
                baseFee: baseFee.toHuman() // Added energyFee.baseFee to output
            }
        };

        // Return the data as JSON
        res.status(200).json(output);
    } catch (error) {
        console.error('Error querying the blockchain:', error);
        res.status(500).json({ error: 'Failed to fetch data from the blockchain.' });
    }
};
