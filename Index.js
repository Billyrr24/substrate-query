const { ApiPromise, WsProvider } = require('@polkadot/api');

module.exports = async (req, res) => {
  try {
    const wsProvider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
    const api = await ApiPromise.create({ provider: wsProvider });

    const keys = await api.query.system.account.keys();
    const accountIds = keys.map((key) => key.args[0].toHuman());

    const accounts = await Promise.all(
      accountIds.map(async (accountId) => {
        const accountInfo = await api.query.system.account(accountId);
        return {
          accountId,
          nonce: accountInfo.nonce.toString(),
          consumers: accountInfo.consumers.toString(),
          providers: accountInfo.providers.toString(),
          sufficients: accountInfo.sufficients.toString(),
          data: {
            free: accountInfo.data.free.toString(),
            reserved: accountInfo.data.reserved.toString(),
            frozen: accountInfo.data.frozen.toString(),
            flags: accountInfo.data.flags.toString(),
          },
        };
      })
    );

    res.status(200).json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
