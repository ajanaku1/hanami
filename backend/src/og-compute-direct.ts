import "dotenv/config";
import { createRequire } from "node:module";
import { Wallet, JsonRpcProvider } from "ethers";
import type { ZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import type { ChatTurn, TeeSignatureAttestation } from "./og-compute.js";

// The 0G Compute SDK is loaded lazily via CommonJS require, never as a static ESM import, for two
// reasons: (1) the backend runs under tsx, whose ESM loader chokes on the SDK's bundled .mjs (a
// circular-export bug), and (2) we never want a missing or broken SDK to crash server boot — the
// Direct path is optional. require() resolves the package's CommonJS build, which loads cleanly; any
// failure throws inside chatDirectSigned and the caller (bouncer.infer) falls back to the Router.
const require = createRequire(import.meta.url);

type Sdk = {
  createZGComputeNetworkBroker: (signer: Wallet) => Promise<ZGComputeNetworkBroker>;
  InferenceVerifier: {
    fetchSignatureByChatID: (providerBrokerURL: string, chatId: string, model: string) => Promise<{ text: string; signature: string }>;
    verifySignature: (message: string, signature: string, expectedAddress: string) => boolean;
  };
};

let sdk: Sdk | null = null;
function loadSdk(): Sdk {
  if (!sdk) sdk = require("@0gfoundation/0g-compute-ts-sdk") as Sdk;
  return sdk;
}

// Direct-broker path for the DECISION turn only. Unlike the Router (which verifies TEE server-side
// and hands back a boolean), the Direct broker returns the provider's raw signature over the
// response. We publish that signature so anyone can recover it to the provider's on-chain
// teeSignerAddress — removing the Router from the trust base for the one inference that lands on
// chain. Every other turn stays on the fast Router (see og-compute.ts).
//
// Disabled by default. Requires OG_DIRECT_ENABLED=true, a provider address (OG_DIRECT_PROVIDER), and
// a DEPLOYER_PRIVATE_KEY whose 0G Compute ledger is funded. When anything is missing or the call
// fails, callers fall back to the Router path, so a deployment without funding behaves exactly as
// before.

const ENABLED = process.env.OG_DIRECT_ENABLED === "true";
const PROVIDER = process.env.OG_DIRECT_PROVIDER ?? "";
const RPC_URL = process.env.OG_RPC_URL ?? "https://evmrpc.0g.ai";
const ATTEMPT_TIMEOUT_MS = 30_000;

export function directEnabled(): boolean {
  return ENABLED && PROVIDER.length > 0 && !!process.env.DEPLOYER_PRIVATE_KEY;
}

let brokerPromise: Promise<ZGComputeNetworkBroker> | null = null;
let acknowledged = false;

function getBroker(): Promise<ZGComputeNetworkBroker> {
  if (!brokerPromise) {
    const wallet = new Wallet(process.env.DEPLOYER_PRIVATE_KEY as string, new JsonRpcProvider(RPC_URL));
    brokerPromise = loadSdk().createZGComputeNetworkBroker(wallet);
  }
  return brokerPromise;
}

// The contract owner must acknowledge the provider's TEE signer once before signed inference works.
// Idempotent and cached for the process; a re-ack when already acknowledged is a cheap no-op.
async function ensureAcknowledged(broker: ZGComputeNetworkBroker): Promise<void> {
  if (acknowledged) return;
  const status = await broker.inference.checkProviderSignerStatus(PROVIDER);
  if (!status.isAcknowledged) await broker.inference.acknowledgeProviderSigner(PROVIDER);
  acknowledged = true;
}

type OpenAiCompletion = { id: string; choices: Array<{ message: { content: string } }>; usage?: unknown };

async function callProvider(
  endpoint: string,
  model: string,
  messages: ChatTurn[],
  headers: Record<string, string>,
): Promise<{ content: string; chatId: string; usage: unknown }> {
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ model, messages, max_tokens: 400, chat_template_kwargs: { enable_thinking: false } }),
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`direct provider ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as OpenAiCompletion;
  const content = body.choices[0]?.message?.content;
  if (!content) throw new Error("direct provider returned no message content");
  const chatId = res.headers.get("ZG-Res-Key") || body.id;
  if (!chatId) throw new Error("direct provider returned no chat id");
  return { content, chatId, usage: body.usage ?? "" };
}

/// One TEE-signed inference through the Direct broker. Returns the reply plus a signature attestation
/// whose `signature` recovers to `signingAddress` (the provider's on-chain teeSignerAddress). Throws
/// on any failure — the caller is expected to fall back to the Router path.
export async function chatDirectSigned(
  messages: ChatTurn[],
): Promise<{ content: string; attestation: TeeSignatureAttestation }> {
  const broker = await getBroker();
  await ensureAcknowledged(broker);

  const { endpoint, model } = await broker.inference.getServiceMetadata(PROVIDER);
  const billed = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const headers = await broker.inference.getRequestHeaders(PROVIDER, billed);

  const { content, chatId, usage } = await callProvider(endpoint, model, messages, headers as unknown as Record<string, string>);
  // Caches the fee for settlement (best-effort). A hiccup here must not discard an otherwise-valid
  // signature — the authoritative check is the offline recovery below.
  try {
    await broker.inference.processResponse(PROVIDER, chatId, typeof usage === "string" ? usage : JSON.stringify(usage));
  } catch (err) {
    console.error("processResponse failed (non-fatal):", (err as Error).message);
  }

  const { InferenceVerifier } = loadSdk();
  const { text, signature } = await InferenceVerifier.fetchSignatureByChatID(endpoint, chatId, model);
  const { teeSignerAddress } = await broker.inference.checkProviderSignerStatus(PROVIDER);
  if (!InferenceVerifier.verifySignature(text, signature, teeSignerAddress)) {
    throw new Error("direct signature did not recover to the provider's TEE signer");
  }

  return {
    content,
    attestation: {
      kind: "tee-signature",
      text,
      signature,
      signingAddress: teeSignerAddress,
      provider: PROVIDER,
      chatId,
      model,
    },
  };
}
