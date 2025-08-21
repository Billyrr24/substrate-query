// api/marketplaceInstant.js
import { ApiPromise, WsProvider } from "@polkadot/api";

export default async function handler(req, res) {
  try {
    const provider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider });

    const entries = await api.query.energyGeneration.validators.entries();

    const results = entries.map(([key, value]) => {
      const address = key.args[0].toString();

      // Raw commission (usually a Perbill = parts per billion)
      const rawCommission = value.commission.toString();

      // Convert: divide by 10,000,000 to get percent (200000000 → 20)
      const commission = Number(rawCommission) / 10_000_000;

      return { address, commission };
    });

    await api.disconnect();

    res.status(200).json(results);
  } catch (error) {
    console.error("Error querying validators:", error);
    res.status(500).json({ error: error.message });
  }
}
