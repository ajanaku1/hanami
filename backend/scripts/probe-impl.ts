import "dotenv/config";
import { createPublicClient, http } from "viem";
const client = createPublicClient({ transport: http(process.env.GALILEO_RPC_URL!) });
const FLOW = "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296" as const;
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const impl = await client.getStorageAt({ address: FLOW, slot: IMPL_SLOT });
console.log("EIP-1967 implementation slot:", impl);
