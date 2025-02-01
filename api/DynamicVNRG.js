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
        const previousEra = currentEra > 0 ? currentEra - 1 : null; // Prevent -1 values

        console.log('Current Era:', currentEra);
        console.log('Previous Era:', previousEra !== null ? previousEra : "N/A");

        // Query extrinsics
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
            queries.push(Promise.resolve(null)); // Placeholder to keep array alignment
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

        console.log("Raw Results:", results.map(r => r?.toHuman?.() || r));

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

        console.log('Final Output:', JSON.stringify(output, null, 2));

        // Return JSON response
        res.status(200).json(output);
    } catch (error) {
        console.error('Error querying the blockchain:', error.message, error.stack);
        res.status(500).json({ error: `Blockchain query failed: ${error.message}` });
    }
};
