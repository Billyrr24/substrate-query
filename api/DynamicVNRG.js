const { ApiPromise, WsProvider } = require('@polkadot/api');

// Define WebSocket endpoint
const WS_ENDPOINT = 'wss://rpc-mainnet.vtrs.io:443';

module.exports = async (req, res) => {
    try {
        // Connect to the Substrate blockchain
        const provider = new WsProvider(WS_ENDPOINT);
        const api = await ApiPromise.create({ provider });

        // Query the current era
        const currentEraRaw = await api.query.energyGeneration.currentEra();
        const currentEra = parseInt(currentEraRaw.toString(), 10);
        const previousEra = currentEra > 0 ? currentEra - 1 : null;

        // Query all extrinsics, including the previous era's energy data
        const queries = [
            api.query.dynamicEnergy.exchangeRate(),
            api.query.dynamicEnergy.annualPercentageRate(),
            api.query.dynamicEnergy.sessionEnergyBurn(),
            api.query.dynamicEnergy.sessionEnergySale(),
            api.query.energyBroker.energyCapacity(),
            api.query.energyGeneration.currentEnergyPerStakeCurrency(),
            api.query.energyFee.baseFee(),
        ];

        if (previousEra !== null) {
            queries.push(api.query.energyGeneration.erasEnergyPerStakeCurrency(previousEra));
        } else {
            queries.push(Promise.resolve(null)); // Placeholder
        }

        // Execute all queries
        const results = await Promise.all(queries);

        // Assign values
        const [
            exchangeRate,
            annualPercentageRate,
            sessionEnergyBurn,
            sessionEnergySale,
            energyCapacity,
            currentEnergyPerStakeCurrency,
            baseFee,
            previousEraEnergyPerStakeCurrency
        ] = results;

        // Format output
        const output = {
            previousEra,
            dynamicEnergy: {
                exchangeRate: exchangeRate?.toHuman() || "N/A",
                annualPercentageRate: annualPercentageRate?.toHuman() || "N/A",
                sessionEnergyBurn: sessionEnergyBurn?.toHuman() || "N/A",
                sessionEnergySale: sessionEnergySale?.toHuman() || "N/A",
            },
            energyBroker: {
                energyCapacity: energyCapacity?.toHuman() || "N/A",
            },
            energyGeneration: {
                currentEnergyPerStakeCurrency: currentEnergyPerStakeCurrency?.toHuman() || "N/A",
                previousEraEnergyPerStakeCurrency: previousEraEnergyPerStakeCurrency?.toHuman() || "N/A",
            },
            energyFee: {
                baseFee: baseFee?.toHuman() || "N/A",
            }
        };

        // Return the data as JSON
        res.status(200).json(output);

    } catch (error) {
        console.error('Error querying the blockchain:', error.message);
        res.status(500).json({ error: 'Failed to fetch data from the blockchain.' });
    }
};
