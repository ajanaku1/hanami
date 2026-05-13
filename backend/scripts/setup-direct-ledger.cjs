require("dotenv/config");
const { createZGComputeNetworkBroker } = require("@0gfoundation/0g-compute-ts-sdk");
const { ethers } = require("ethers");

const PROVIDER = "0x4b2a941929E39Adbea5316dDF2B9Bd8Ff3134389";

(async () => {
  const w = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, new ethers.JsonRpcProvider(process.env.GALILEO_RPC_URL));
  console.log("signer:", await w.getAddress());

  const b = await createZGComputeNetworkBroker(w);

  // 1. Create a ledger account if missing, funded with 0.05 OG
  try {
    const l = await b.ledger.getLedger();
    console.log("ledger already exists:", { totalBalance: l.totalBalance?.toString(), available: l.available?.toString?.() });
  } catch (e) {
    console.log("creating ledger with 0.05 OG initial deposit...");
    await b.ledger.addLedger("0.05");
    const l = await b.ledger.getLedger();
    console.log("ledger created:", { totalBalance: l.totalBalance?.toString() });
  }

  // 2. Acknowledge provider (one-time per provider)
  try {
    console.log("acknowledging provider...");
    await b.inference.acknowledgeProviderSigner(PROVIDER);
    console.log("acknowledged");
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (msg.includes("already") || msg.includes("acked") || msg.includes("ack")) {
      console.log("already acknowledged");
    } else {
      console.log("ack error:", msg);
    }
  }

  // 3. Service metadata
  const meta = await b.inference.getServiceMetadata(PROVIDER);
  console.log("\nservice metadata:", meta);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
