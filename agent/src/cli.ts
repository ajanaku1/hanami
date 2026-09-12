#!/usr/bin/env node
/**
 * hanami-agent — applies to a Hanami campaign on a human's behalf.
 *
 * Contract: specs/002-human-door-tickets/contracts/agent-cli.md
 * Commands: register <agentWallet> | status <agentWallet> | apply <campaignUrl> --wallet <recipient>
 *
 * This file is wiring only: argument parsing, the AgentKit-signing fetch, the model client, and the
 * exit code. The walk itself is in apply.ts, where it is tested without a network.
 */

import { privateKeyToAccount } from "viem/accounts";
import { createAgentkitClient } from "@worldcoin/agentkit";
import { apply, type ApplyDeps } from "./apply.js";
import { configFromEnv, createApplicant } from "./applicant-model.js";
import { register, status } from "./register.js";

const USAGE = `hanami-agent

  register <agentWallet>                       register the agent in AgentBook
  status   <agentWallet>                       print AgentBook registration and human id
  apply    <campaignUrl> --wallet <recipient>  apply to the campaign and print the receipt
           [--max-turns 8] [--json] [--api <url>]

Environment: AGENT_PRIVATE_KEY, OG_ROUTER_URL, OG_ROUTER_KEY, optional HANAMI_API.
Exit codes for apply: 0 decided, 2 the Door refused, 3 network or provider error.
`;

function flag(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
}

/// A fetch that signs AgentKit's challenge with the agent's own key. World Chain is the chain the
/// signature is made on; AgentBook is read there regardless of where the campaign lives.
function agentkitFetch(privateKey: string): { fetch: ApplyDeps["fetchImpl"]; address: string } {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createAgentkitClient({
    signer: {
      address: account.address,
      chainId: "eip155:480",
      type: "eip191",
      signMessage: (message: string) => account.signMessage({ message }),
    },
  });
  return { fetch: client.fetch as unknown as ApplyDeps["fetchImpl"], address: account.address };
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }

  if (command === "register" || command === "status") {
    const wallet = rest[0];
    if (!wallet) {
      process.stderr.write(`hanami-agent: ${command} needs an agent wallet\n`);
      return 1;
    }
    return command === "register" ? register(wallet) : status(wallet);
  }

  if (command !== "apply") {
    process.stderr.write(`hanami-agent: '${command}' is not a command\n${USAGE}`);
    return 1;
  }

  return runApply(rest);
}

async function runApply(rest: string[]): Promise<number> {
  const campaignUrl = rest[0];
  const wallet = flag(rest, "wallet");
  if (!campaignUrl || !wallet) {
    process.stderr.write("hanami-agent: apply needs a campaign url and --wallet <recipient>\n");
    return 1;
  }

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    process.stderr.write("hanami-agent: AGENT_PRIVATE_KEY is not set\n");
    return 3;
  }

  const model = configFromEnv();
  if (!model) {
    process.stderr.write("hanami-agent: OG_ROUTER_URL and OG_ROUTER_KEY are not set\n");
    return 3;
  }

  const signing = agentkitFetch(privateKey);
  const result = await apply(
    {
      campaignUrl,
      wallet,
      agent: signing.address,
      maxTurns: Number(flag(rest, "max-turns") ?? 8),
      json: rest.includes("--json"),
      api: flag(rest, "api") ?? process.env.HANAMI_API,
    },
    {
      fetchImpl: signing.fetch,
      reply: createApplicant(model),
      log: (line) => process.stdout.write(`${line}\n`),
    },
  );

  return result.code;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
