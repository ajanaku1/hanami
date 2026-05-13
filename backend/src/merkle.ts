import { MerkleTree } from "merkletreejs";
import { keccak256, encodePacked, type Address, type Hex } from "viem";

export type MerkleExport = {
  root: Hex;
  leafCount: number;
  leaves: { address: Address; leaf: Hex; proof: Hex[] }[];
  solidityHelper: string;
};

function leafFor(addr: Address): Buffer {
  return Buffer.from(keccak256(encodePacked(["address"], [addr])).slice(2), "hex");
}

/// Build a Merkle tree of approved addresses matching the on-chain WhitelistMint contract:
///   leaf = keccak256(abi.encodePacked(applicant))
///   tree uses sortPairs so each internal node = keccak256(min(a,b) || max(a,b))
export function buildExport(approved: Address[]): MerkleExport {
  if (approved.length === 0) {
    return { root: "0x" + "0".repeat(64) as Hex, leafCount: 0, leaves: [], solidityHelper: "" };
  }

  const leafBufs = approved.map(leafFor);
  const tree = new MerkleTree(leafBufs, (buf: Buffer) => Buffer.from(keccak256(`0x${buf.toString("hex")}` as Hex).slice(2), "hex"), { sortPairs: true });
  const rootHex = ("0x" + tree.getRoot().toString("hex")) as Hex;

  const leaves = approved.map((addr, i) => ({
    address: addr,
    leaf: ("0x" + leafBufs[i]!.toString("hex")) as Hex,
    proof: tree.getProof(leafBufs[i]!).map((p) => ("0x" + p.data.toString("hex")) as Hex),
  }));

  return { root: rootHex, leafCount: approved.length, leaves, solidityHelper: snippet(rootHex) };
}

function snippet(root: Hex): string {
  return [
    "// Drop this into your mint contract on any EVM chain (Ethereum, Base, Arbitrum, OP, 0G).",
    "// MerkleProof from openzeppelin-contracts.",
    "import { MerkleProof } from \"@openzeppelin/contracts/utils/cryptography/MerkleProof.sol\";",
    "",
    `bytes32 public constant HANAMI_ROOT = ${root};`,
    "mapping(address => bool) public minted;",
    "",
    "function mint(bytes32[] calldata proof) external {",
    "    require(!minted[msg.sender], \"already minted\");",
    "    bytes32 leaf = keccak256(abi.encodePacked(msg.sender));",
    "    require(MerkleProof.verify(proof, HANAMI_ROOT, leaf), \"not approved\");",
    "    minted[msg.sender] = true;",
    "    // ...your mint logic...",
    "}",
  ].join("\n");
}
