// api/marketplaceInstant.js
import { ApiPromise, WsProvider } from "@polkadot/api";

export default async function handler(req, res) {
  try {
    const provider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider });

    // Query all validators from energyGeneration.validators
    const entries = await api.query.energyGeneration.validators.entries();

    // Map the results
    const results = entries.map(([key, value]) => {
      const address = key.args[0].toString();
      const commission = value.commission.toString(); // Assuming commission field exists

      return { address, commission };
    });

    await api.disconnect();

    res.status(200).json(results);
  } catch (error) {
    console.error("Error querying validators:", error);
    res.status(500).json({ error: error.message });
  }
}
