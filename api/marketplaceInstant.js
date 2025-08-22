import { ApiPromise, WsProvider } from '@polkadot/api';

export default async function handler(req, res) {
  try {
    const provider = new WsProvider('wss://rpc-mainnet.vtrs.io:443');
    const api = await ApiPromise.create({ provider });

    // Query all collaborators in the cooperators pallet
    const cooperators = await api.query.cooperators.collaborators.entries();

    let filtered = [];

    cooperators.forEach(([key, value]) => {
      const data = value.toJSON();
      if (data && data.stake && Number(data.stake) > 0) {
        filtered.push({
          address: key.args[0].toString(),
          stake: Number(data.stake)
        });
      }
    });

    // Only include wallets with > 0 stake
    const cooperatorCount = filtered.length;
    const cooperativeStakeTotal = filtered.reduce((sum, item) => sum + item.stake, 0);

    const response = {
      cooperatorCount,
      cooperativeStakeTotal,
      cooperators: filtered
    };

    res.status(200).json(response);

    await provider.disconnect();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
