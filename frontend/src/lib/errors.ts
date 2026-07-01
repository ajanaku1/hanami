// Translate raw API/network errors into copy a human can read.
// The Router occasionally rate-limits or has TLS hiccups; show a calm message.

export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (/429|rate.limit|too.many.requests/i.test(raw)) {
    return "Take a breath — the bouncer is at its rate limit. Try again in a few seconds.";
  }
  if (/^timeout |took too long/i.test(raw)) {
    return "The bouncer is waking up (the venue's been quiet). Give it a few seconds and send that again.";
  }
  // 503 = backend classified this as transient (cold start, upstream 5xx, or a 0G blob still
  // replicating). Distinct from a hard network failure so we can tell the applicant to just retry.
  if (/^503\b|No locations found/i.test(raw)) {
    return "The bouncer is just getting to their feet. Give it a moment and try again.";
  }
  if (/fetch failed|Failed to fetch|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(raw)) {
    return "Network blip. Try sending that again.";
  }
  if (/tee_verified|TEE verification failed/i.test(raw)) {
    return "The TEE check didn't pass on that reply. Your message wasn't recorded. Try again.";
  }
  if (/already decided/i.test(raw)) {
    return "This wallet has already been through the conversation for this campaign.";
  }
  if (/not approved|signature did not verify/i.test(raw)) {
    return "Signature couldn't be verified. Reconnect your wallet and try again.";
  }
  // last resort — keep it short
  return raw.length > 180 ? raw.slice(0, 180) + "…" : raw;
}
