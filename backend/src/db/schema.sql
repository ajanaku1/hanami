-- Hanami backend index/cache.
-- 0G Storage is canonical for persona, lorebook, portrait, transcripts.
-- 0G Chain is canonical for bouncer iNFT, decision log, attestation hashes.
-- This DB is a read-fast cache so /admin doesn't round-trip Storage or RPC per render.
-- Hosted on Turso (libSQL) so it survives Render free-tier container restarts.

CREATE TABLE IF NOT EXISTS campaigns (
  slug              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  bouncer_token_id  INTEGER NOT NULL,
  bouncer_address   TEXT NOT NULL,        -- BouncerRegistry contract address
  campaign_address  TEXT NOT NULL,        -- Campaign contract address (factory output)
  target_chain      TEXT NOT NULL,        -- 'ethereum' | 'base' | 'arbitrum' | 'op' | '0g'
  wl_size_cap       INTEGER NOT NULL,
  persona_uri       TEXT NOT NULL,        -- ipfs://CID (canonical)
  lorebook_uri      TEXT,                 -- ipfs://CID (nullable)
  image_uri         TEXT,                 -- 0g://rootHash for the bouncer portrait (nullable)
  owner_address     TEXT NOT NULL,        -- project wallet
  created_at        INTEGER NOT NULL,     -- unix seconds
  finalized_at      INTEGER,              -- set when Merkle root published
  merkle_root       TEXT,                 -- 0x... hex
  visibility        TEXT NOT NULL DEFAULT 'private', -- 'public' | 'private'
  rep_score         INTEGER NOT NULL DEFAULT 0       -- mirror of the bouncer iNFT's on-chain repScore (canonical = chain)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns(owner_address);

CREATE TABLE IF NOT EXISTS applicants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_slug   TEXT NOT NULL REFERENCES campaigns(slug) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  decision        TEXT,                   -- 'approved' | 'rejected' | NULL (in progress)
  decision_tx     TEXT,                   -- 0x... on 0G Chain
  reasoning_uri   TEXT,                   -- 0g://rootHash of bouncer's final reasoning
  transcript_uri  TEXT,                   -- 0g://rootHash of the full conversation transcript (pinned at decision)
  attestation_hash TEXT,                  -- bytes32 hex, mirrors on-chain value
  UNIQUE(campaign_slug, wallet_address)   -- enforces one-attempt-per-wallet at API layer
);

CREATE INDEX IF NOT EXISTS idx_applicants_campaign ON applicants(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_applicants_decision ON applicants(campaign_slug, decision);

CREATE TABLE IF NOT EXISTS turns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id    INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  turn_index      INTEGER NOT NULL,        -- 0..5 (6-turn cap from goal.md)
  role            TEXT NOT NULL,           -- 'bouncer' | 'applicant'
  content         TEXT NOT NULL,
  router_request_id TEXT,                  -- x_0g_trace.request_id (bouncer turns only)
  provider        TEXT,                    -- x_0g_trace.provider address (bouncer turns only)
  tee_verified    INTEGER,                 -- 1 | 0 | NULL (NULL = applicant turn or pre-verify_tee)
  created_at      INTEGER NOT NULL,
  UNIQUE(applicant_id, turn_index)
);

CREATE INDEX IF NOT EXISTS idx_turns_applicant ON turns(applicant_id, turn_index);

-- Durable portrait store. 0G Storage is canonical, but uploads use finalityRequired:false and the
-- holding node can drop a blob before it replicates — and the Render disk cache is ephemeral. We keep
-- a base64 copy here (Turso survives restarts) so the /api/image proxy can always serve the portrait.
-- Keyed by the 0G Storage rootHash, so the bytes here are exactly what that root addresses.
CREATE TABLE IF NOT EXISTS portraits (
  root        TEXT PRIMARY KEY,   -- 0G Storage rootHash (0x..)
  png_b64     TEXT NOT NULL,      -- the PNG bytes, base64
  created_at  INTEGER NOT NULL
);

-- Anti-replay: prevents the bouncer backend from re-submitting a decision tx if its first attempt
-- partially succeeded (paid gas, lost confirmation). On startup we replay this table to reconcile
-- with on-chain state before accepting new applicants.
CREATE TABLE IF NOT EXISTS pending_tx (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id    INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  submitted_at    INTEGER NOT NULL,
  tx_hash         TEXT,                    -- set after RPC returns; NULL means submission still in flight
  status          TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'confirmed' | 'failed'
);

CREATE INDEX IF NOT EXISTS idx_pending_tx_status ON pending_tx(status);
