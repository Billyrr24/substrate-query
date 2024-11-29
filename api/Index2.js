// Import the required libraries
const { ApiPromise, WsProvider } = require('@polkadot/api');

module.exports = async (req, res) => {
    try {
        // Connect to the Substrate node
        const wsProvider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
        const api = await ApiPromise.create({ provider: wsProvider });

        console.log('Connected to the blockchain');

        // Retrieve all account entries
        const entries = await api.query.system.account.entries();

        console.log('Fetched account entries. Processing...');

        // Process each entry to extract account info
        const walletInfo = entries.map(([key, value]) => {
            const address = key.args[0].toHuman(); // Extract address

            // Check if the account data exists
            if (!value || !value.data) {
                console.warn(`Skipping address ${address}: No account data found.`);
                return { address, error: 'No account data found' };
            }

            const { data: { free, reserved, miscFrozen, feeFrozen } } = value;

            return {
                address,
                balance: {
                    free: free ? free.toHuman() : '0',
                    reserved: reserved ? reserved.toHuman() : '0',
                    miscFrozen: miscFrozen ? miscFrozen.toHuman() : '0',
                    feeFrozen: feeFrozen ? feeFrozen.toHuman() : '0',
                },
            };
        });

        console.log(`Processed ${walletInfo.length} wallets.`);

        // Disconnect the API
        await api.disconnect();
        console.log('Disconnected from the blockchain');

        // Respond with wallet info as JSON
        res.status(200).json(walletInfo);
    } catch (error) {
        console.error('Error querying the blockchain:', error);
        res.status(500).json({ error: 'Failed to query the blockchain', details: error.message });
    }
};
