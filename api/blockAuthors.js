import { ApiPromise, WsProvider } from "@polkadot/api";

export default async function handler(req, res) {
  try {
    const provider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider });

    console.log("Connected to chain.");

    // Try fetching storage entries
    let ledgers;
    try {
      ledgers = await api.query.energyGeneration.ledger.entries();
    } catch (err) {
      console.error("Error calling .entries() on energyGeneration.ledger:", err);
    }

    if (!ledgers) {
      return res.status(500).json({
        error: "energyGeneration.ledger.entries() returned undefined",
        hint: "This storage item may not be iterable. Try api.query.energyGeneration.ledger.keys() or .entriesPaged().",
      });
    }

    const results = ledgers.map(([key, ledger]) => ({
      accountId: key.args[0].toString(),
      ledger: ledger.toHuman(),
    }));

    await api.disconnect();

    return res.status(200).json(results);
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}
