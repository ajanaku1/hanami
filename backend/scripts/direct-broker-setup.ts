import "dotenv/config";
import { createRequire } from "node:module";
import { Wallet, JsonRpcProvider, formatEther } from "ethers";

// Lazy CommonJS require: tsx's ESM loader chokes on the SDK's bundled .mjs (see og-compute-direct.ts).
type Service = { provider: string; model: string; teeSignerAddress: string; teeSignerAcknowledged: boolean };
type Broker = {
  ledger: { addLedger: (n: number) => Promise<void>; depositFund: (n: number) => Promise<void>; getLedger: () => Promise<{ totalBalance: bigint; availableBalance: bigint }> };
  inference: { acknowledgeProviderSigner: (p: string) => Promise<void>; listService: () => Promise<Service[]> };
};
const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = require("@0gfoundation/0g-compute-ts-sdk") as {
  createZGComputeNetworkBroker: (signer: Wallet) => Promise<Broker>;
};

// One-time setup for the Direct-broker decision path (see src/og-compute-direct.ts).
//
//   npx tsx scripts/direct-broker-setup.ts                 # list TEE providers + ledger balance
//   npx tsx scripts/direct-broker-setup.ts fund=0.05       # deposit 0.05 0G into the Compute ledger
//   npx tsx scripts/direct-broker-setup.ts ack=0xProvider  # acknowledge a provider's TEE signer
//
// After funding + acknowledging, set OG_DIRECT_ENABLED=true and OG_DIRECT_PROVIDER=<addr>.

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=") as [string, string]));
const rpc = process.env.OG_RPC_URL ?? "https://evmrpc.0g.ai";
const wallet = new Wallet(process.env.DEPLOYER_PRIVATE_KEY as string, new JsonRpcProvider(rpc));
const broker = await createZGComputeNetworkBroker(wallet);

if (args.fund) {
  // Creating a ledger uses addLedger and requires a contract minimum of 3 0G; once it exists,
  // depositFund tops it up by any amount. Pick the right call by checking existence first.
  const amount = Number(args.fund);
  const exists = await broker.ledger.getLedger().then(() => true).catch(() => false);
  console.log(`${exists ? "Topping up" : "Creating"} the Compute ledger with ${amount} 0G…`);
  if (exists) await broker.ledger.depositFund(amount);
  else await broker.ledger.addLedger(amount);
  console.log("Done.");
}

if (args.ack) {
  console.log(`Acknowledging provider ${args.ack}…`);
  await broker.inference.acknowledgeProviderSigner(args.ack);
  console.log("Done.");
}

// getLedger reverts with LedgerNotExists until the ledger is funded once — that's not fatal for a
// read-only listing, so report it and carry on to the provider list.
try {
  const ledger = await broker.ledger.getLedger();
  console.log(`\nLedger balance: ${formatEther(ledger.totalBalance)} 0G (available ${formatEther(ledger.availableBalance)})`);
} catch {
  console.log("\nLedger: none yet — run `fund=<amount>` (e.g. fund=0.05) to create and fund it.");
}

const services = await broker.inference.listService();
const tee = services.filter((s) => s.teeSignerAddress && s.teeSignerAddress !== "0x0000000000000000000000000000000000000000");
console.log(`\nTEE-verifiable providers (${tee.length}):`);
for (const s of tee) {
  console.log(`  ${s.provider}  model=${s.model}  signer=${s.teeSignerAddress}  acknowledged=${s.teeSignerAcknowledged}`);
}
