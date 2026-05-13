import "dotenv/config";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";

const RPC = process.env.GALILEO_RPC_URL!;
const PK = process.env.DEPLOYER_PRIVATE_KEY!;
const INDEXER_RPC = process.env.OG_INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(PK, provider);
  const indexer = new Indexer(INDEXER_RPC);

  const payload = Buffer.from(
    JSON.stringify({ kind: "hanami:hello", ts: Date.now(), note: "0G Storage round-trip smoke test" }),
  );
  const data = new MemData(payload);

  console.log("uploading", payload.length, "bytes...");
  const [tx, uploadErr] = await indexer.upload(data, RPC, signer);
  if (uploadErr) throw uploadErr;
  console.log("upload tx:", tx);
  const root = (tx as { rootHash: string }).rootHash;

  const outPath = "/tmp/hanami-storage-roundtrip.bin";
  const dlErr = await indexer.download(root, outPath, true);
  if (dlErr instanceof Error) throw dlErr;
  const { readFileSync } = await import("node:fs");
  const dlBuf = readFileSync(outPath);
  console.log("downloaded", dlBuf.length, "bytes to", outPath);
  console.log("match:", dlBuf.toString() === payload.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
