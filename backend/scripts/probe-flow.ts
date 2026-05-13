import "dotenv/config";
import { createPublicClient, http, parseAbi } from "viem";

const FLOW = "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296" as const;
const client = createPublicClient({ transport: http(process.env.GALILEO_RPC_URL!) });

const abi = parseAbi([
  "function market() view returns (address)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
]);

for (const fn of ["market", "paused", "owner"] as const) {
  try {
    const r = await client.readContract({ address: FLOW, abi, functionName: fn });
    console.log(`${fn}:`, r);
  } catch (e) {
    console.log(`${fn}: <not present>`);
  }
}

console.log("bytecode size:", ((await client.getCode({ address: FLOW })) ?? "0x").length / 2);
