import { NextResponse } from "next/server";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Redis } from "@upstash/redis";

const RPC_URL = "wss://rpc-mainnet.vtrs.io:443";
const KV_NAMESPACE = "energyLedger";
const BATCH_SIZE = 500;

// KV client (Upstash Redis via Vercel KV)
const redis = Redis.fromEnv();

export const dynamic = "force-dynamic"; // Disable caching at edge

export async function GET() {
  try {
    // Step 1: Check if cached full result already exists
    const cached = await redis.get(`${KV_NAMESPACE}:final`);
    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }

    // Step 2: Connect to chain
    const provider = new WsProvider(RPC_URL);
    const api = await ApiPromise.create({ provider });

    // Step 3: Get all ledger entries
    const entries = await api.query.energyGeneration.ledger.entries();
    const accounts = entries.map(([key, codec]) => {
      const account = key.args[0].toString();
      const data = codec.toJSON();
      return { account, ...data };
    });

    // Step 4: Chunk + cache progress
    let results = [];
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const chunk = accounts.slice(i, i + BATCH_SIZE);
      results = results.concat(chunk);

      // Store partial results (so retries don’t restart from scratch)
      await redis.set(
        `${KV_NAMESPACE}:chunk:${i / BATCH_SIZE}`,
        JSON.stringify(chunk),
        { ex: 60 * 60 } // 1 hour
      );
    }

    // Step 5: Cache final merged result
    await redis.set(`${KV_NAMESPACE}:final`, JSON.stringify(results), {
      ex: 60 * 60, // 1 hour
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching energy ledger:", error);
    return NextResponse.json(
      { error: "Failed to fetch energy ledger" },
      { status: 500 }
    );
  }
}
