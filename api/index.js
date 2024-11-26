const { ApiPromise, WsProvider } = require('@polkadot/api');

module.exports = async (req, res) => {
  try {
    const wsProvider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
    const api = await ApiPromise.create({ provider: wsProvider });

    console.log("Connected to Substrate!");

    const assetId = 1;
    console.log("Fetching accounts for asset ID:", assetId);

    const keys = await api.query.assets.account.keys(assetId);
    const accounts = await Promise.all(
      keys.map(async (key) => {
        const accountId = key.args[1].toHuman();
        const accountInfo = await api.query.assets.account(assetId, accountId);

        if (accountInfo.isSome) {
          const accountDetails = accountInfo.unwrap();

          return {
            assetId,
            accountId,
            balance: accountDetails.balance.toString(),
            status: accountDetails.status.toHuman(),
          };
        } else {
          return {
            assetId,
            accountId,
            balance: "0",
            status: "None",
          };
        }
      })
    );

    res.status(200).json(accounts); // Return the data as JSON
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("Error fetching data");
  }
};
