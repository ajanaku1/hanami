import { buildExport } from "../src/merkle.js";
import type { Address } from "viem";

const r = buildExport([
  "0x000000000000000000000000000000000000a11c",
  "0x000000000000000000000000000000000000b0b0",
  "0x000000000000000000000000000000000000c4a1",
] as Address[]);
console.log("root:", r.root);
console.log("leafCount:", r.leafCount);
console.log("first leaf:", r.leaves[0]?.leaf);
console.log("first proof len:", r.leaves[0]?.proof.length);
console.log("snippet head:", r.solidityHelper.split("\n").slice(0, 5).join(" | "));
