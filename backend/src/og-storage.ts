import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = process.env.GALILEO_RPC_URL!;
const INDEXER_RPC = process.env.OG_INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
const SIGNER_KEY = process.env.DEPLOYER_PRIVATE_KEY!;

const provider = new ethers.JsonRpcProvider(RPC);
const signer = new ethers.Wallet(SIGNER_KEY, provider);
const indexer = new Indexer(INDEXER_RPC);

type UploadResult = { rootHash: string; txHash: string; txSeq: number };

export async function uploadBlob(payload: Buffer): Promise<UploadResult> {
  const [tx, err] = await indexer.upload(new MemData(payload), RPC, signer);
  if (err) throw err;
  return tx as UploadResult;
}

export async function uploadText(text: string): Promise<UploadResult> {
  return uploadBlob(Buffer.from(text, "utf8"));
}

export async function readByRoot(rootHash: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "hanami-storage-"));
  const out = join(dir, "blob");
  try {
    const err = await indexer.download(rootHash, out, true);
    if (err instanceof Error) throw err;
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
