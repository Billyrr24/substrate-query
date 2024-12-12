const { ApiPromise, WsProvider } = require('@polkadot/api');

module.exports = async (req, res) => {
    // Define the WebSocket endpoint
    const wsProvider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');

    try {
        // Initialize the API
        const api = await ApiPromise.create({ provider: wsProvider });

        // Iterate over all keys in the `simpleVesting.vesting` storage map
        const entries = await api.query.simpleVesting.vesting.entries();

        if (entries.length === 0) {
            return res.status(200).json({ message: "No accounts with vesting information found." });
        }

        const result = entries.map(([key, value]) => {
            const accountId = key.args[0].toString(); // Extract account ID from the key
            if (value.isSome) {
                const info = value.unwrap();
                return {
                    accountId,
                    locked: info.locked.toHuman(),
                    perBlock: info.perBlock.toHuman(),
                    startingBlock: info.startingBlock.toHuman(),
                };
            }
            return null;
        }).filter(Boolean); // Remove null values for accounts without vesting

        // Disconnect from the API
        await api.disconnect();

        // Respond with JSON data
        res.status(200).json(result);
    } catch (error) {
        console.error("Error querying the vesting information:", error);
        res.status(500).json({ error: "Failed to query vesting information", details: error.message });
    }
};
