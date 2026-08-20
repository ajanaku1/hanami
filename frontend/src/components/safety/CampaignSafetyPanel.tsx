import type { CampaignSafety } from "@/lib/api";
import type { SafetyRun } from "@/lib/safety";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SafetyReport } from "./SafetyReport";

type CampaignSafetyModel = {
  safety: CampaignSafety;
  isOwner: boolean;
  busy: boolean;
  onStart: () => void;
  onResume: () => void;
  run: SafetyRun | null;
};

const STATE_COPY: Record<CampaignSafety["state"], { label: string; tone: "certified" | "warning" | "error" | "active" }> = {
  certified: { label: "Certified to publish", tone: "certified" },
  legacy: { label: "Legacy public", tone: "warning" },
  required: { label: "Safety check required", tone: "warning" },
  running: { label: "Safety test running", tone: "active" },
  failed: { label: "Safety check failed", tone: "error" },
  interrupted: { label: "Safety test interrupted", tone: "error" },
};

function safetyDescription(state: CampaignSafety["state"]): string {
  if (state === "certified") {
    return "The immutable bouncer intelligence passed all eight TEE-attested checks.";
  }
  if (state === "legacy") {
    return "This campaign predates certification. Making it private permanently enables the new publication gate.";
  }
  return "Publication remains locked until all eight expected decisions match and every response is TEE verified.";
}

export function CampaignSafetyPanel({ model }: { model: CampaignSafetyModel }) {
  const copy = STATE_COPY[model.safety.state];
  if (model.run) return <SafetyReport run={model.run} onRetry={model.onResume} />;

  return (
    <section className="campaign-safety-card" aria-labelledby="campaign-safety-heading">
      <div>
        <p className="eyebrow">Publication evidence</p>
        <h2 id="campaign-safety-heading">Bouncer Safety</h2>
      </div>
      <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
      <p>{safetyDescription(model.safety.state)}</p>
      {model.safety.reportRoot && (
        <div className="campaign-safety-card__root">
          <span>0G report root</span>
          <code>{model.safety.reportRoot}</code>
        </div>
      )}
      {model.isOwner && !model.safety.publicationEligible && (
        <Button onClick={model.onStart} busy={model.busy}>Run safety test</Button>
      )}
    </section>
  );
}
