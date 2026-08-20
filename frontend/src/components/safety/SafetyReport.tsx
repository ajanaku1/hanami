import type { SafetyRun, SafetyScenarioResult } from "@/lib/safety";

type SafetyReportProps = {
  run: SafetyRun;
  onRetry?: () => void;
};

const CATEGORY_LABELS: Record<SafetyScenarioResult["category"], string> = {
  thoughtful: "Thoughtful",
  "low-effort": "Low effort",
  jailbreak: "Jailbreak",
  edge: "Edge case",
};

function statusLabel(result: SafetyScenarioResult): string {
  if (result.status === "passed") return "Passed";
  if (result.status === "failed") return "Failed";
  if (result.status === "interrupted") return "Interrupted";
  return "Waiting";
}

function decisionDisclosure(result: SafetyScenarioResult): string {
  if (result.status !== "failed") return "";
  return `Expected ${result.expectedDecision}, received ${result.actualDecision ?? "no-decision"}.`;
}

function evidenceLabel(result: SafetyScenarioResult): string {
  if (result.teeVerified === true) return "TEE verified";
  if (result.teeVerified === false) return "TEE unavailable";
  return "Waiting";
}

function ScenarioRow({ scenario }: { scenario: SafetyScenarioResult }) {
  const disclosure = decisionDisclosure(scenario);

  return (
    <tr data-status={scenario.status}>
      <th scope="row">
        <span>{scenario.id}</span>
        <small>{CATEGORY_LABELS[scenario.category]}</small>
      </th>
      <td>{scenario.expectedDecision}</td>
      <td>
        <span className="safety-report__status">{statusLabel(scenario)}</span>
        {disclosure && <small>{disclosure}</small>}
      </td>
      <td>{evidenceLabel(scenario)}</td>
    </tr>
  );
}

export function SafetyReport({ run, onRetry }: SafetyReportProps) {
  return (
    <section className="safety-report" aria-labelledby="safety-report-title">
      <div className="safety-report__heading">
        <div>
          <p className="eyebrow">Bouncer Safety Report</p>
          <h2 id="safety-report-title">Eight checks. Every decision must match.</h2>
        </div>
        <strong className={`safety-report__seal safety-report__seal--${run.status}`}>
          {run.status === "passed" ? "8 / 8 certified" : `${run.completedCount} / ${run.totalCount}`}
        </strong>
      </div>

      {run.error && (
        <div role="status" className="safety-report__notice">
          <span>{run.error.message}</span>
          {run.error.retryable && onRetry && (
            <button type="button" onClick={onRetry}>Resume safety test</button>
          )}
        </div>
      )}

      <div className="safety-report__table-wrap">
        <table aria-label="Eight-scenario safety matrix">
          <thead>
            <tr><th>Check</th><th>Expected</th><th>Result</th><th>Evidence</th></tr>
          </thead>
          <tbody>
            {run.scenarios.map((scenario) => <ScenarioRow key={scenario.id} scenario={scenario} />)}
          </tbody>
        </table>
      </div>

      {run.reportRoot && (
        <div className="safety-report__root">
          <span>0G Storage report root</span>
          <code>{run.reportRoot}</code>
        </div>
      )}
    </section>
  );
}
