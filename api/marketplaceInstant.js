// api/marketplaceInstant.js
import { ApiPromise, WsProvider } from "@polkadot/api";

export default async function handler(req, res) {
  try {
    const provider = new WsProvider("wss://rpc-mainnet.vtrs.io:443");
    const api = await ApiPromise.create({ provider });

    // 1) Validators (commission)
    const validatorEntries = await api.query.energyGeneration.validators.entries();

    // 2) Ledger (solo stake)
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

    // 3) Collaborations (validator -> cooperators[])
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

    // 4) Reputation (points + tier)
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
            tier = `${tierName} ${tierValue}`; // e.g., "Ultramodern 3"
          }
        } catch {}
        return [address, { points, tier }];
      })
    );

    // 5) Multi-query all unique cooperators for their targets map
    const allCooperatorsSet = new Set();
    collabMap.forEach((coops) => (coops || []).forEach((c) => allCooperatorsSet.add(c)));
    const allCooperators = Array.from(allCooperatorsSet);

    const coopInfos = allCooperators.length
      ? await api.query.energyGeneration.cooperators.multi(allCooperators)
      : [];

    // Map: cooperatorAddress -> plain JS object of { validatorAddress: amount, ... }
    const coopMap = new Map();
    allCooperators.forEach((address, idx) => {
      let targetsObj = {};
      try {
        const info = coopInfos[idx];
        if (info && info.isSome) {
          const targets = info.unwrap().targets;
          targetsObj = targets.toJSON ? targets.toJSON() : targets;
        }
      } catch {}
      coopMap.set(address, targetsObj);
    });

    // 6) Assemble results (PATCH: count only >0 stake collaborators)
    const results = [];

    for (const [key, value] of validatorEntries) {
      const address = key.args[0].toString();

      // Commission Perbill -> %
      let commission = 0;
      try {
        commission = Number(value.commission.toString()) / 10_000_000; // perbill to percent
      } catch {}

      // Solo stake
      const soloStake = ledgerMap.get(address) || "0";

      // Collaborators for this validator
      const collaborators = collabMap.get(address) || [];

      // Build per-collaborator stake list to this validator
      const stakeList = collaborators.map((coop) => {
        const targetsObj = coopMap.get(coop) || {};
        return BigInt(targetsObj[address] || 0);
      });

      // Total delegated stake (unchanged)
      const cooperatorStake = stakeList.reduce((a, b) => a + b, 0n);

      // 🔧 PATCH: numCooperators counts ONLY collaborators with > 0 stake to this validator
      const numCooperators = stakeList.filter((amt) => amt > 0n).length;

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
