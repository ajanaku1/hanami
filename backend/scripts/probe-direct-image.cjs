require("dotenv/config");
const { createZGComputeNetworkBroker } = require("@0gfoundation/0g-compute-ts-sdk");
const { ethers } = require("ethers");

const PROVIDER = "0x4b2a941929E39Adbea5316dDF2B9Bd8Ff3134389";

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.GALILEO_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

  console.log("signer:", await wallet.getAddress());
  const broker = await createZGComputeNetworkBroker(wallet);

  console.log("listing services...");
  const services = await broker.inference.listService();
  console.log("services:", services.length);
  for (const s of services.slice(0, 20)) {
    console.log(" ", s.provider, "·", s.model, "·", s.serviceType ?? "?", "·", s.url);
  }

  const target = services.find((s) => (s.provider || "").toLowerCase() === PROVIDER.toLowerCase());
  if (!target) { console.log("\nNOT FOUND in service list"); return; }

  console.log("\ntarget:", target);

  try {
    const ledger = await broker.ledger.getLedger();
    console.log("ledger:", ledger);
  } catch (e) {
    console.log("ledger err:", e?.message ?? e);
  }
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
