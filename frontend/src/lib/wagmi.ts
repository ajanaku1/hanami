import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const zeroG = defineChain({
  id: 16661,
  name: "0G",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
  blockExplorers: { default: { name: "Chainscan", url: "https://chainscan.0g.ai" } },
});

export const wagmiConfig = createConfig({
  chains: [zeroG],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [zeroG.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
