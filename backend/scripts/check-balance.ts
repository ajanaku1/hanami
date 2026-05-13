import { createPublicClient, http, formatEther } from "viem";
const client = createPublicClient({ transport: http("https://evmrpc-testnet.0g.ai") });
const bal = await client.getBalance({ address: "0x34b0Ba20669f3ec4F1056853780c381e5e35F724" });
console.log("balance:", formatEther(bal), "0G");
console.log("chainId:", await client.getChainId());
