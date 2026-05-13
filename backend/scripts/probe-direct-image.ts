import "dotenv/config";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { ethers } from "ethers";

const PROVIDER = "0x4b2a941929E39Adbea5316dDF2B9Bd8Ff3134389";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.GALILEO_RPC_URL!);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  console.log("creating broker with signer", await wallet.getAddress());
  const broker = await createZGComputeNetworkBroker(wallet);

  console.log("listing services across providers...");
  const services = await broker.inference.listService();
  console.log("services:", services.length);
  for (const s of services.slice(0, 12)) {
    console.log(" ", s.provider ?? "?", "·", s.model ?? s.serviceType ?? "?", "·", s.url ?? "");
  }

  const target = services.find((s) => (s.provider ?? "").toLowerCase() === PROVIDER.toLowerCase());
  console.log("\ntarget provider entry:", target ?? "NOT FOUND");

  if (target) {
    console.log("acknowledging provider...");
    try {
      await broker.inference.acknowledgeProviderSigner(PROVIDER);
      console.log("acknowledged");
    } catch (e) {
      console.log("ack error (may be pre-acked):", e instanceof Error ? e.message : e);
    }

    console.log("checking ledger balance...");
    try {
      const ledger = await broker.ledger.getLedger();
      console.log("ledger:", ledger);
    } catch (e) {
      console.log("ledger err:", e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
