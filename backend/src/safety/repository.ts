import { randomUUID } from "node:crypto";
import type { Client, InValue, Row } from "@libsql/client";
import { SCENARIOS } from "./scenarios.js";
import type {
  SafetyRunIdentity,
  SafetyRunStatus,
  SafetyRunView,
  SafetyScenarioResult,
} from "./types.js";

type RunRow = Row & {
  id: string;
  scope: string;
  slug: string;
  owner_address: string;
  content_hash: string;
  persona_uri: string;
  lorebook_uri: string | null;
  status: SafetyRunStatus;
  current_scenario: number;
  report_root: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

type ResultRow = Row & {
  scenario_id: string;
  category: SafetyScenarioResult["category"];
  expected_decision: SafetyScenarioResult["expectedDecision"];
  actual_decision: SafetyScenarioResult["actualDecision"];
  tee_verified: number | null;
  status: SafetyScenarioResult["status"];
  turn_count: number;
  error_code: string | null;
};

function mapResult(row: ResultRow): SafetyScenarioResult {
  return {
    id: row.scenario_id,
    category: row.category,
    expectedDecision: row.expected_decision,
    actualDecision: row.actual_decision,
    teeVerified: row.tee_verified === null ? null : row.tee_verified === 1,
    status: row.status,
    turnCount: Number(row.turn_count),
    errorCode: row.error_code,
  };
}

function mapRun(row: RunRow, results: SafetyScenarioResult[]): SafetyRunView {
  return {
    id: row.id,
    scope: row.scope as SafetyRunIdentity["scope"],
    slug: row.slug,
    ownerAddress: row.owner_address,
    contentHash: row.content_hash,
    personaUri: row.persona_uri,
    lorebookUri: row.lorebook_uri,
    status: row.status,
    completedCount: Number(row.current_scenario),
    reportRoot: row.report_root,
    error: row.error_code
      ? { code: row.error_code, message: row.error_message ?? "Safety run interrupted", retryable: true }
      : null,
    results,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    completedAt: row.completed_at === null ? null : Number(row.completed_at),
  };
}

export class SafetyRepository {
  constructor(
    private readonly client: Client,
    private readonly makeId: () => string = randomUUID,
  ) {}

  async createOrGetRun(identity: SafetyRunIdentity, now: number): Promise<SafetyRunView> {
    const id = this.makeId();
    await this.client.execute({
      sql: `INSERT INTO safety_runs
        (id, scope, slug, owner_address, content_hash, persona_uri, lorebook_uri, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope, slug, owner_address, content_hash) DO NOTHING`,
      args: [id, identity.scope, identity.slug, identity.ownerAddress.toLowerCase(), identity.contentHash,
        identity.personaUri, identity.lorebookUri, now, now],
    });
    const stored = await this.findByIdentity(identity);
    if (!stored) throw new Error("failed to create safety run");
    return stored;
  }

  async getRun(id: string): Promise<SafetyRunView | null> {
    const run = await this.first<RunRow>("SELECT * FROM safety_runs WHERE id = ?", [id]);
    if (!run) return null;
    const rows = await this.rows<ResultRow>(
      "SELECT * FROM safety_scenario_results WHERE run_id = ?",
      [id],
    );
    const order = new Map(SCENARIOS.map((scenario, index) => [scenario.id, index]));
    const results = rows.map(mapResult).sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    return mapRun(run, results);
  }

  async saveScenario(runId: string, result: SafetyScenarioResult, now: number): Promise<void> {
    await this.client.execute({
      sql: `INSERT OR REPLACE INTO safety_scenario_results
        (run_id, scenario_id, category, expected_decision, actual_decision, tee_verified, status, turn_count, error_code, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [runId, result.id, result.category, result.expectedDecision, result.actualDecision,
        result.teeVerified === null ? null : result.teeVerified ? 1 : 0, result.status,
        result.turnCount, result.errorCode, now],
    });
    await this.updateProgress(runId, now);
  }

  async findPassingRun(identity: SafetyRunIdentity): Promise<SafetyRunView | null> {
    const run = await this.findByIdentity(identity);
    return run?.status === "passed" && run.reportRoot ? run : null;
  }

  async findExactRun(
    identity: Pick<SafetyRunIdentity, "scope" | "slug" | "ownerAddress" | "contentHash">,
  ): Promise<SafetyRunView | null> {
    const row = await this.first<RunRow>(
      `SELECT * FROM safety_runs WHERE scope = ? AND slug = ?
       AND owner_address = ? AND content_hash = ?`,
      [identity.scope, identity.slug, identity.ownerAddress.toLowerCase(), identity.contentHash],
    );
    return row ? this.getRun(row.id) : null;
  }

  async findLatestCampaignRun(source: {
    slug: string;
    ownerAddress: string;
    personaUri: string;
    lorebookUri: string | null;
  }): Promise<SafetyRunView | null> {
    const row = await this.first<RunRow>(
      `SELECT * FROM safety_runs WHERE scope = 'campaign' AND slug = ?
       AND owner_address = ? AND persona_uri = ?
       AND COALESCE(lorebook_uri, '') = COALESCE(?, '')
       ORDER BY updated_at DESC LIMIT 1`,
      [source.slug, source.ownerAddress.toLowerCase(), source.personaUri, source.lorebookUri],
    );
    return row ? this.getRun(row.id) : null;
  }

  async markPassed(runId: string, reportRoot: string, now: number): Promise<void> {
    await this.client.execute({
      sql: `UPDATE safety_runs SET status = 'passed', current_scenario = 8, report_root = ?,
        error_code = NULL, error_message = NULL, updated_at = ?, completed_at = ? WHERE id = ?`,
      args: [reportRoot, now, now, runId],
    });
  }

  async markRunning(runId: string, now: number): Promise<void> {
    await this.client.execute({
      sql: `UPDATE safety_runs SET status = 'running', error_code = NULL, error_message = NULL,
        updated_at = ?, completed_at = NULL WHERE id = ?`,
      args: [now, runId],
    });
  }

  async markFailed(runId: string, now: number): Promise<void> {
    await this.client.execute({
      sql: `UPDATE safety_runs SET status = 'failed', error_code = NULL, error_message = NULL,
        updated_at = ?, completed_at = ? WHERE id = ?`,
      args: [now, now, runId],
    });
  }

  async restartFailedRun(runId: string, now: number): Promise<void> {
    await this.client.batch([
      {
        sql: `DELETE FROM safety_scenario_results WHERE run_id = ?
          AND EXISTS (SELECT 1 FROM safety_runs WHERE id = ? AND status = 'failed')`,
        args: [runId, runId],
      },
      {
        sql: `UPDATE safety_runs SET status = 'running', current_scenario = 0, report_root = NULL,
          error_code = NULL, error_message = NULL, updated_at = ?, completed_at = NULL
          WHERE id = ? AND status = 'failed'`,
        args: [now, runId],
      },
    ], "write");
  }

  async markInterrupted(
    runId: string,
    code: string,
    message: string,
    now: number,
  ): Promise<void> {
    await this.client.execute({
      sql: `UPDATE safety_runs SET status = 'interrupted', error_code = ?, error_message = ?,
        updated_at = ?, completed_at = NULL WHERE id = ?`,
      args: [code, message, now, runId],
    });
  }

  async promoteDraftToCampaign(runId: string, now: number): Promise<void> {
    await this.client.execute({
      sql: "UPDATE safety_runs SET scope = 'campaign', updated_at = ? WHERE id = ? AND scope = 'draft' AND status = 'passed'",
      args: [now, runId],
    });
  }

  async interruptStaleRuns(now: number, staleBefore: number): Promise<number> {
    const result = await this.client.execute({
      sql: `UPDATE safety_runs SET status = 'interrupted', error_code = 'PROCESS_RESTARTED',
        error_message = 'The worker restarted. Resume to continue.', updated_at = ?
        WHERE status = 'running' AND updated_at < ?`,
      args: [now, staleBefore],
    });
    return Number(result.rowsAffected);
  }

  private async findByIdentity(identity: SafetyRunIdentity): Promise<SafetyRunView | null> {
    const row = await this.first<RunRow>(
      `SELECT * FROM safety_runs WHERE scope = ? AND slug = ?
       AND owner_address = ? AND content_hash = ?`,
      [identity.scope, identity.slug, identity.ownerAddress.toLowerCase(), identity.contentHash],
    );
    return row ? this.getRun(row.id) : null;
  }

  private async updateProgress(runId: string, now: number): Promise<void> {
    await this.client.execute({
      sql: `UPDATE safety_runs SET current_scenario = (
        SELECT COUNT(*) FROM safety_scenario_results
        WHERE run_id = ? AND status IN ('passed', 'failed')
      ), updated_at = ? WHERE id = ?`,
      args: [runId, now, runId],
    });
  }

  private async first<T extends Row>(sql: string, args: InValue[]): Promise<T | null> {
    const result = await this.client.execute({ sql, args });
    return (result.rows[0] as T | undefined) ?? null;
  }

  private async rows<T extends Row>(sql: string, args: InValue[]): Promise<T[]> {
    const result = await this.client.execute({ sql, args });
    return result.rows as T[];
  }
}
