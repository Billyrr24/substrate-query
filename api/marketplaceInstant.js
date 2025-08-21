// api/marketplaceInstant.js
import { ApiPromise, WsProvider } from "@polkadot/api";

// Helper to safely convert value to string
function safeToString(value) {
  if (value === undefined || value === null) return "0";
  try {
    return value.toString();
  } catch {
    return "0";
  }
}

export default async function handler(req, res) {
  try {
    const provider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider });

    // --------------------
    // 1. Validators
    // --------------------
    const validatorEntries = await api.query.energyGeneration.validators.entries();

    // --------------------
    // 2. Ledger (solo stake)
    // --------------------
    const ledgerEntries = await api.query.energyGeneration.ledger.entries();
    const ledgerMap = new Map(
      ledgerEntries.map(([key, optValue]) => {
        const address = key.args[0].toString();
        let active = "0";
        try {
          active = optValue.isSome ? optValue.unwrap().active.toString() : "0";
        } catch {}
        return [address, active];
      })
    );

    // --------------------
    // 3. Collaborations (validator -> cooperators[])
    // --------------------
    const collabEntries = await api.query.energyGeneration.collaborations.entries();
    const collabMap = new Map(
      collabEntries.map(([key, optValue]) => {
        const address = key.args[0].toString();
        let collaborators = [];
        try {
          collaborators = optValue.isSome ? optValue.unwrap().toJSON() : [];
        } catch {}
        return [address, collaborators];
      })
    );

    // --------------------
    // 4. Reputation
    // --------------------
    const repEntries = await api.query.reputation.accountReputation.entries();
    const repMap = new Map(
      repEntries.map(([key, optValue]) => {
        const address = key.args[0].toString();
        let points = "0";
        let tier = "Unknown";
        try {
          if (optValue.isSome) {
            const rep = optValue.unwrap();
            points = rep.reputation.points.toString();
            const tierObj = rep.reputation.tier.toHuman();
            const tierName = Object.keys(tierObj)[0] || "Unknown";
            const tierValue = tierObj[tierName] ?? "";
            tier = `${tierName} ${tierValue}`;
          }
        } catch {}
        return [address, { points, tier }];
      })
    );

    // --------------------
    // 5. Assemble results
    // --------------------
    const results = [];

    for (const [key, value] of validatorEntries) {
      const address = key.args[0].toString();

      // Commission (Perbill -> percent)
      let commission = 0;
      try {
        commission = Number(value.commission.toString()) / 10_000_000;
      } catch {}

      // Solo stake
      const soloStake = ledgerMap.get(address) || "0";

      // Cooperators
      const collaborators = collabMap.get(address) || [];
      let cooperatorStake = 0n;
      for (const coop of collaborators) {
        try {
          const coopInfo = await api.query.energyGeneration.cooperators(coop);
          if (coopInfo.isSome) {
            const targets = coopInfo.unwrap().targets;
            const stakeForValidator = targets[address] || 0;
            cooperatorStake += BigInt(stakeForValidator);
          }
        } catch {}
      }
      const numCooperators = collaborators.length;

      // Reputation
      const repData = repMap.get(address) || { points: "0", tier: "Unknown" };
      const reputationPoints = repData.points;
      const tier = repData.tier;

      results.push({
        address,
        commission,
        cooperatorStake: cooperatorStake.toString(),
        numCooperators,
        reputationPoints,
        tier,
        soloStake,
      });
    }

    await api.disconnect();
    res.status(200).json(results);

  } catch (error) {
    console.error("Error querying data:", error);
    res.status(500).json({ error: error.message });
  }
}
