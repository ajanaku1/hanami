import "dotenv/config";
import { uploadText, readByRoot } from "../src/og-storage.js";

const sample = "Mei-chan: 'The cherry blossoms only bloom for those who notice.' — Hanami smoke test " + Date.now();

const up = await uploadText(sample);
console.log("uploaded:", up);

const got = (await readByRoot(up.rootHash)).toString("utf8");
console.log("roundtrip match:", got === sample);
