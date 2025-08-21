// api/marketplaceInstant.js
import { ApiPromise, WsProvider } from "@polkadot/api";

export default async function handler(req, res) {
  try {
    const provider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider });

    // 1. Validators (commission)
    const validatorEntries = await api.query.energyGeneration.validators.entries();

    // 2. Ledger (all active stakes)
    const ledgerEntries = await api.query.energyGeneration.ledger.entries();
    const ledgerMap = new Map(
      ledgerEntries.map(([key, value]) => [
        key.args[0].toString(),
        value.active.toString(),
      ])
    );

    // 3. Collaborations (validator -> cooperators[])
    const collabEntries = await api.query.energyGeneration.collaborations.entries();
    const collabMap = new Map(
      collabEntries.map(([key, value]) => [
        key.args[0].toString(),
        value.map(addr => addr.toString()),
      ])
    );

    // 4. Reputation (points + tier)
    const repEntries = await api.query.reputation.accountReputation.entries();
    const repMap = new Map(
      repEntries.map(([key, value]) => {
        const address = key.args[0].toString();
        const points = value.reputation.points.toString();
        const tierObj = value.reputation.tier.toHuman();
        const tier = Object.keys(tierObj)[0]; // extract tier name
        return [address, { points, tier }];
      })
    );

    // 5. Assemble result per validator
    const results = validatorEntries.map(([key, value]) => {
      const address = key.args[0].toString();

      // Commission
      const rawCommission = value.commission.toString();
      const commission = Number(rawCommission) / 10_000_000;

      // Solo stake
      const soloStake = ledgerMap.get(address) || "0";

      // Cooperators
      const collaborators = collabMap.get(address) || [];
      let cooperatorStake = 0n;
      for (const coop of collaborators) {
        const stake = ledgerMap.get(coop);
        if (stake) {
          cooperatorStake += BigInt(stake);
        }
      }
      const numCooperators = collaborators.length;

      // Reputation
      const repData = repMap.get(address) || { points: "0", tier: "Unknown" };
      const reputationPoints = repData.points;
      const tier = repData.tier;

      return {
        address,
        commission,
        cooperatorStake: cooperatorStake.toString(),
        numCooperators,
        reputationPoints,
        tier,
        soloStake,
      };
    });

    await api.disconnect();
    res.status(200).json(results);
  } catch (error) {
    console.error("Error querying data:", error);
    res.status(500).json({ error: error.message });
  }
}
