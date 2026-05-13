// All user-facing copy lives here. Anything user-visible should originate from this file.
// Voice rules (Mei-chan-adjacent):
//   - Plain. Short sentences. No marketing voice.
//   - No exclamation points outside genuine moments.
//   - Lowercase for system labels (counters, status), Title Case only for proper nouns.
//   - "you" not "users". Address the person.
//   - No emoji.

export const landing = {
  title: "Hanami",
  tagline: "An AI bouncer for your whitelist.",
  body: "Your project sets the criteria. The bouncer holds a private conversation with each applicant, inside a TEE so the criteria can't be reverse-engineered. You get a Merkle root your existing mint contract can use, on any EVM chain.",
  ctaPrimary: "Mint a bouncer",
  ctaSecondary: "See an example bouncer",
};

export const create = {
  heading: "Set up your bouncer",
  intro: "This stays private. Write the persona in your own voice — the bouncer will speak the way you write here. Applicants never see this text.",

  campaignNameLabel: "Campaign name",
  campaignNamePlaceholder: "Sakura Society Spring 2026",

  targetChainLabel: "Target chain (where the mint will happen)",

  wlSizeLabel: "Whitelist size",
  wlSizeHelp: "How many approved addresses you'll allow.",

  personaLabel: "Persona",
  personaPlaceholder:
    "Describe the bouncer's personality and what they're looking for in a member. Be specific. Use your own examples. The more particular this is, the harder it is to game.",
  personaHelp:
    "This is the bouncer's whole inner world. Be as detailed as you like — a paragraph works, a long essay works better. Avoid listing criteria as a checklist; describe the person doing the screening instead.",

  lorebookLabel: "Lorebook (optional)",
  lorebookHelp:
    "A document the bouncer can reference — the project's history, painters, vibe. Markdown or PDF. Goes private; the bouncer reads it but never quotes it back.",

  submit: "Mint bouncer",
  submitting: "Minting on 0G…",

  success: {
    title: "Bouncer minted.",
    body: "Share the applicant link below. Applicants will connect their wallet and start the conversation.",
    copyLink: "Copy applicant link",
  },
};

export const applicant = {
  preConnect: {
    heading: (campaignName: string) => `${campaignName} — whitelist`,
    body: "A short conversation before you're considered. Connect your wallet to start.",
    cta: "Connect wallet",
  },
  chat: {
    placeholder: "Reply…",
    send: "Send",
    waiting: "…",
    rateLimited: "Take a breath. One reply at a time.",
  },
  decision: {
    approved: {
      title: "Welcome.",
      body: "Your wallet is on the list.",
      receiptLabel: "Decision attested by TEE",
      viewChain: "View on 0G Chainscan",
    },
    rejected: {
      title: "Not this time.",
      body: "Thank you for spending the time. The whitelist isn't right for you on this one.",
    },
    blocked: {
      title: "Already decided.",
      body: "This wallet has already been through the conversation for this campaign.",
    },
  },
  errors: {
    teeFailed: "The TEE verification didn't pass. Your reply wasn't recorded. Try again in a moment.",
    network: "Network blip. The conversation is paused. Refresh to resume.",
  },
};

export const admin = {
  heading: (campaignName: string) => `${campaignName} — admin`,
  counters: {
    approved: "approved",
    rejected: "rejected",
    capacity: "of",
  },
  liveFeedHeading: "Live conversations",
  emptyFeed: "No conversations yet. Share the applicant link to begin.",
  exportButton: "Export Merkle root",
  exporting: "Generating…",
  exportedTitle: "Merkle root ready",
  exportedBody:
    "Download the JSON of leaves and proofs. The snippet below drops into your mint contract on the destination chain.",
  copySolidity: "Copy snippet",
  finalizeTitle: "Finalize on-chain",
  finalizeBody:
    "Publishing the root on the campaign contract locks the list. New applicants can no longer be decided after this.",
  finalizeCta: "Publish root",
  finalized: "Finalized",
};

export const personaPresets: Record<string, { label: string; seed: string }> = {
  meiChan: {
    label: "The quiet curator",
    seed:
      "You are a gallerist of long experience. You speak plainly, ask short questions, and notice when an answer is borrowed. You favor people who look carefully and dislike anyone chasing prestige. The community you screen for is small and prefers restraint to flash.",
  },
  kenji: {
    label: "The degen detector",
    seed:
      "You are a long-time DeFi participant who has seen every variation of grift. You're friendly but sharp. You ask one or two technical questions early to gauge whether the person actually uses what they claim to use. Hype-talk without underlying knowledge gets rejected fast.",
  },
  friendlyHost: {
    label: "The friendly host",
    seed:
      "You are the kind of person who runs a community house. You welcome everyone first, then listen. You're drawn to people who can describe what they want to give to the group, not just what they want to get from it. You reject only when someone is clearly there to take.",
  },
  crypticOracle: {
    label: "The cryptic oracle",
    seed:
      "You speak in short, sometimes oblique replies. You ask only what you need. You let silence sit. You're drawn to applicants who think before typing and who can sit with an unanswered question. You reject anyone who tries to fill silence with noise.",
  },
};
