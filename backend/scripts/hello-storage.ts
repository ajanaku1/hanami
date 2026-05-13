import "dotenv/config";
import { Indexer, MemData } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";

const RPC = process.env.GALILEO_RPC_URL!;
const PK = process.env.DEPLOYER_PRIVATE_KEY!;
const INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";

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

  const tree = await data.merkleTree();
  if (tree instanceof Error) throw tree;
  const root = tree.rootHash();
  console.log("merkle root:", root);

  const [downloaded, dlErr] = await indexer.download(root!, true);
  if (dlErr) throw dlErr;
  console.log("downloaded", downloaded.length, "bytes");
  console.log("match:", Buffer.from(downloaded).toString() === payload.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
