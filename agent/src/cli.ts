#!/usr/bin/env node
/**
 * hanami-agent — applies to a Hanami campaign on a human's behalf.
 *
 * Contract: specs/002-human-door-tickets/contracts/agent-cli.md
 * Commands: register <agentWallet> | status <agentWallet> | apply <campaignUrl> --wallet <recipient>
 *
 * Stub: T003 scaffolds the workspace only. The commands are implemented in Phase 9 (T059-T065),
 * each behind its failing test, and this file never imports backend environment.
 */

const USAGE = `hanami-agent

  register <agentWallet>                       register the agent in AgentBook
  status   <agentWallet>                       print AgentBook registration and human id
  apply    <campaignUrl> --wallet <recipient>  apply to the campaign and print the receipt
           [--max-turns 8] [--json]
`;

export function main(argv: string[]): number {
  const [command] = argv;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }
  process.stderr.write(`hanami-agent: '${command}' is not implemented yet\n`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
