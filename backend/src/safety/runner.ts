import type { ChatTurn } from "../og-compute.js";
import { serializePassingReport } from "./report.js";
import type { SafetyRepository } from "./repository.js";
import { SCENARIOS } from "./scenarios.js";
import type {
  SafetyActualDecision,
  SafetyDecision,
  SafetyRunView,
  SafetyScenario,
  SafetyScenarioResult,
} from "./types.js";

export type SafetyInferenceInput = {
  persona: string;
  lorebook: string;
  scenario: SafetyScenario;
  turnIndex: number;
  history: ChatTurn[];
};

export type SafetyInference = (input: SafetyInferenceInput) => Promise<{
  reply: string;
  decision: SafetyDecision | null;
  teeVerified: boolean;
}>;

type SafetyRunnerDependencies = {
  repository: SafetyRepository;
  infer: SafetyInference;
  uploadReport: (report: string) => Promise<string>;
  now?: () => number;
  pacer?: InferencePacer;
};

type SafeInterruption = {
  code: string;
  message: string;
};

const SAFE_ERRORS = {
  TEE_UNVERIFIED: "TEE verification was unavailable. Resume to retry this scenario.",
  INFERENCE_FAILED: "The inference provider was unavailable. Resume to continue.",
  REPORT_UPLOAD_FAILED: "The safety report could not be stored. Resume to retry the upload.",
} as const;

export class InferencePacer {
  private queue: Promise<void> = Promise.resolve();
  private lastStart: number | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly nowMs: () => number = Date.now,
    private readonly wait: (delayMs: number) => Promise<void> =
      (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  ) {}

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    let release = () => {};
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const elapsed = this.lastStart === null ? this.intervalMs : this.nowMs() - this.lastStart;
    if (elapsed < this.intervalMs) await this.wait(this.intervalMs - elapsed);
    this.lastStart = this.nowMs();
    try {
      const pending = task();
      release();
      return await pending;
    } catch (error) {
      release();
      throw error;
    }
  }
}

export const processInferencePacer = new InferencePacer(1_250);

class InterruptedRun extends Error {
  constructor(readonly safe: SafeInterruption) {
    super(safe.code);
  }
}

function scenarioResult(
  scenario: SafetyScenario,
  decision: SafetyActualDecision,
  teeVerified: boolean,
  turnCount: number,
): SafetyScenarioResult {
  const passed = decision === scenario.expectedDecision && teeVerified;
  return {
    id: scenario.id,
    category: scenario.category,
    expectedDecision: scenario.expectedDecision,
    actualDecision: decision,
    teeVerified,
    status: passed ? "passed" : "failed",
    turnCount,
    errorCode: null,
  };
}

export class SafetyRunner {
  private readonly now: () => number;
  private readonly pacer: InferencePacer;

  constructor(private readonly dependencies: SafetyRunnerDependencies) {
    this.now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));
    this.pacer = dependencies.pacer ?? processInferencePacer;
  }

  async execute(runId: string, persona: string, lorebook: string): Promise<SafetyRunView> {
    const initial = await this.requireRun(runId);
    if (initial.status === "passed" || initial.status === "failed") return initial;
    await this.dependencies.repository.markRunning(runId, this.now());

    const completed = new Set(
      initial.results
        .filter((result) => result.status === "passed" || result.status === "failed")
        .map((result) => result.id),
    );
    const pending = SCENARIOS.filter((scenario) => !completed.has(scenario.id));
    const interruption = await this.runPending(runId, persona, lorebook, pending);
    if (interruption) {
      await this.dependencies.repository.markInterrupted(
        runId,
        interruption.code,
        interruption.message,
        this.now(),
      );
      return this.requireRun(runId);
    }
    return this.finalize(runId);
  }

  private async runPending(
    runId: string,
    persona: string,
    lorebook: string,
    pending: readonly SafetyScenario[],
  ): Promise<SafeInterruption | null> {
    let cursor = 0;
    let interruption: SafeInterruption | null = null;
    const worker = async () => {
      while (!interruption) {
        const scenario = pending[cursor];
        cursor += 1;
        if (!scenario) return;
        try {
          const result = await this.runScenario(persona, lorebook, scenario);
          await this.dependencies.repository.saveScenario(runId, result, this.now());
        } catch (error) {
          interruption = error instanceof InterruptedRun
            ? error.safe
            : { code: "INFERENCE_FAILED", message: SAFE_ERRORS.INFERENCE_FAILED };
        }
      }
    };
    await Promise.all([worker(), worker()]);
    return interruption;
  }

  private async runScenario(
    persona: string,
    lorebook: string,
    scenario: SafetyScenario,
  ): Promise<SafetyScenarioResult> {
    const history: ChatTurn[] = [];
    let teeVerified = true;
    for (let turnIndex = 0; turnIndex < scenario.messages.length; turnIndex += 1) {
      history.push({ role: "user", content: scenario.messages[turnIndex]! });
      const response = await this.pacer.schedule(() => this.dependencies.infer({
        persona,
        lorebook,
        scenario,
        turnIndex,
        history: [...history],
      }));
      if (!response.teeVerified) {
        throw new InterruptedRun({ code: "TEE_UNVERIFIED", message: SAFE_ERRORS.TEE_UNVERIFIED });
      }
      teeVerified = teeVerified && response.teeVerified;
      history.push({ role: "assistant", content: response.reply });
      if (response.decision) return scenarioResult(scenario, response.decision, teeVerified, turnIndex + 1);
    }
    return scenarioResult(scenario, "no-decision", teeVerified, scenario.messages.length);
  }

  private async finalize(runId: string): Promise<SafetyRunView> {
    const run = await this.requireRun(runId);
    if (run.results.some((result) => result.status === "failed")) {
      await this.dependencies.repository.markFailed(runId, this.now());
      return this.requireRun(runId);
    }
    const completedAt = this.now();
    const report = serializePassingReport({ ...run, completedAt, results: run.results });
    try {
      const reportRoot = await this.dependencies.uploadReport(report);
      await this.dependencies.repository.markPassed(runId, reportRoot, completedAt);
    } catch {
      await this.dependencies.repository.markInterrupted(
        runId,
        "REPORT_UPLOAD_FAILED",
        SAFE_ERRORS.REPORT_UPLOAD_FAILED,
        completedAt,
      );
    }
    return this.requireRun(runId);
  }

  private async requireRun(runId: string): Promise<SafetyRunView> {
    const run = await this.dependencies.repository.getRun(runId);
    if (!run) throw new Error("safety run not found");
    return run;
  }
}
