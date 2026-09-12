/// `register` and `status` — thin wrappers over World's own AgentKit CLI.
///
/// Registration binds an agent wallet to a person in AgentBook, and only that person can approve it
/// from World App. There is nothing for this CLI to add to that, and plenty it could get wrong, so
/// it shells out to the tool World ships and passes the output through unchanged.

import { spawn } from "node:child_process";

export type Runner = (command: string, args: string[]) => Promise<number>;

export const runCommand: Runner = (command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });

export async function register(agentWallet: string, run: Runner = runCommand): Promise<number> {
  return run("npx", ["@worldcoin/agentkit-cli", "register", agentWallet]);
}

export async function status(agentWallet: string, run: Runner = runCommand): Promise<number> {
  return run("npx", ["@worldcoin/agentkit-cli", "status", agentWallet]);
}
