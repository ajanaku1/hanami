import "dotenv/config";
import { uploadText } from "../src/og-storage.js";
import { mintBouncer, authorizeBackend, createCampaign, recordDecision } from "../src/og-chain.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const personaText = "Mei-chan, Aoyama gallerist. Quiet attention, dislikes hype. Sakura Society admissions.";
const lorebookText = "Sakura Society: 200-person Tokyo collector circle. Founded 2019. Atelier visits, matte paper, Kawanabe Kyōsai.";

console.log("1. uploading persona to 0G Storage...");
const persona = await uploadText(personaText);
console.log("   rootHash:", persona.rootHash);

console.log("2. uploading lorebook...");
const lore = await uploadText(lorebookText);
console.log("   rootHash:", lore.rootHash);

console.log("3. minting bouncer iNFT on Galileo...");
const mint = await mintBouncer(`0g://${persona.rootHash}`, `0g://${lore.rootHash}`);
console.log("   tx:", mint.txHash, "tokenId:", mint.tokenId.toString());

const backend = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex).address;
console.log("4. authorizing backend address", backend, "on the iNFT...");
const auth = await authorizeBackend(mint.tokenId, backend);
console.log("   tx:", auth);

console.log("5. creating campaign...");
const camp = await createCampaign(mint.tokenId, 100n);
console.log("   campaign:", camp.campaign, "tx:", camp.txHash);

console.log("6. recording a decision with synthetic TEE trace...");
const fakeTrace = { request_id: "smoke-test-uuid", provider: backend, tee_verified: true };
const dec = await recordDecision(camp.campaign, "0x0000000000000000000000000000000000000001", true, "thoughtful answer", fakeTrace);
console.log("   tx:", dec.txHash);
console.log("   attestationHash:", dec.attestationHash);
console.log("   reasoningHash:", dec.reasoningHash);

console.log("\nDONE. End-to-end on-chain commit path works.");
