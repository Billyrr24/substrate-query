// types-bundle/index.js
export const typesBundle = {
  spec: {
    "vitreus-power-plant": {
      alias: {},
      rpc: {},
      instances: {},
      signedExtensions: {
        CheckNonZeroSender: {},
        CheckSpecVersion: {},
        CheckTxVersion: {},
        CheckGenesis: {},
        CheckMortality: {},
        CheckNonce: {},
        CheckWeight: {},
        ChargeTransactionPayment: {},
        CheckEnergyFee: {}
      },
      types: [
        {
          minmax: [0, null],
          types: {
            // Standard types
            AccountId: "AccountId32",
            Address: "MultiAddress",
            LookupSource: "MultiAddress",
            Balance: "u128",
            BlockNumber: "u32",
            Nonce: "u32",
            Hash: "H256",
            Moment: "u64",

            // Custom types
            NativeOrAssetId: { _enum: { Native: "Null", Asset: "u32" } },
            CollectionId: "u128",
            ItemId: "u128",
            Energy: "u128",
            Points: "u128",
            Stake: "u128",
            Rate: "u128",
            VaultId: "u64",
            TransactionId: "u64",
            ScheduleId: "u64",
            StrategyId: "u64",
            EraIndex: "u32",
            UnlockChunk: { value: "Balance", era: "EraIndex" },
            PalletEnergyGenerationStakingLedger: {
              stash: "AccountId",
              total: "Balance",
              active: "Balance",
              unlocking: "Vec<UnlockChunk>"
            }
          }
        }
      ]
    }
  }
};
