"use client";

import { useEffect, useRef, useState } from "react";
import { IDKitRequestWidget, deviceLegacy, orbLegacy, selfieCheckLegacy } from "@worldcoin/idkit";
import { AsyncNotice } from "@/components/ui/AsyncNotice";
import { Button } from "@/components/ui/Button";

/// The Door. It stands in front of the interview and answers one question: is there a person here,
/// and are they a person this campaign has not already spoken to.
///
/// The panel shows the outcome in words rather than in colour alone, and never renders proof
/// material — not the proof, not the merkle root, not the nullifier. What the applicant sees is
/// which credential was asked for and whether they are through.

export type Credential = "selfie" | "orb" | "device";

export type DoorState =
  | "none"
  | "pending"
  | "verified"
  | "rejected"
  | "used"
  | "unavailable"
  | "closed"
  | "full";

/// The signed request context World requires. The RP signs a nonce server-side; the browser only
/// carries it.
export type RpContext = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

export type IdkitResult = {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
};

export type DoorModel = {
  state: DoorState;
  requiredCredential: Credential;
  method: string | null;
  wallet: string | null;
  appId: string;
  action: string;
  rpContext: RpContext | null;
  onProof: (result: IdkitResult) => void;
  onRetry: () => void;
};

const CREDENTIAL_NAME: Record<Credential, string> = {
  selfie: "Selfie Check",
  orb: "Orb",
  device: "Device",
};

function presetFor(credential: Credential, signal: string) {
  if (credential === "selfie") return selfieCheckLegacy({ signal });
  if (credential === "device") return deviceLegacy({ signal });
  return orbLegacy({ signal });
}

/// What the applicant is told, and whether it is a refusal they can do something about.
function message(model: DoorModel): { text: string; tone: "info" | "success" | "error"; retry: boolean } | null {
  switch (model.state) {
    case "pending":
      return { text: "Checking your proof with World…", tone: "info", retry: false };
    case "verified":
      return {
        text: `Verified with ${CREDENTIAL_NAME[(model.method as Credential) ?? model.requiredCredential]}. The door is open.`,
        tone: "success",
        retry: false,
      };
    case "rejected":
      return { text: "That proof could not be verified. You can try again.", tone: "error", retry: true };
    case "used":
      return {
        text: "This person has already applied to this campaign. One person, one attempt.",
        tone: "error",
        retry: false,
      };
    case "unavailable":
      return {
        text: "World could not be reached, so your proof was not checked. Nothing was refused — try again in a moment.",
        tone: "error",
        retry: true,
      };
    case "closed":
      return { text: "This campaign has closed. The door is no longer open.", tone: "info", retry: false };
    case "full":
      return { text: "This campaign is full. Every place has been taken.", tone: "info", retry: false };
    default:
      return null;
  }
}

export function DoorPanel({ model }: { model: DoorModel }) {
  const noticeRef = useRef<HTMLDivElement>(null);
  // IDKitRequestWidget is a controlled modal: it renders nothing until it is opened, so the panel
  // owns the button that opens it.
  const [open, setOpen] = useState(false);
  const outcome = message(model);
  const settled = model.state !== "none" && model.state !== "pending";

  // Moving focus to the outcome is what makes the Door usable without sight: the panel is the only
  // thing that changed, and it is off-screen from wherever the widget left the cursor.
  useEffect(() => {
    if (settled) noticeRef.current?.focus();
  }, [settled, model.state]);

  const canVerify =
    (model.state === "none" || model.state === "rejected" || model.state === "unavailable") &&
    model.wallet !== null &&
    model.rpContext !== null;

  return (
    <section className="door-panel" aria-labelledby="door-heading">
      <h2 id="door-heading">The Door</h2>
      <p>
        This campaign asks for a <strong>{CREDENTIAL_NAME[model.requiredCredential]}</strong> proof
        before the interview starts. One person, one attempt.
      </p>

      {/* The outcome carries the live region itself rather than nesting one, because the element
          that announces the change has to be the element that takes focus. */}
      {outcome ? (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className="ui-notice"
          data-tone={outcome.tone}
          role={outcome.tone === "error" ? "alert" : "status"}
        >
          {outcome.text}
        </div>
      ) : null}

      {model.wallet === null ? (
        <AsyncNotice tone="info">Connect a wallet to open the door.</AsyncNotice>
      ) : null}

      {canVerify && model.wallet && model.rpContext ? (
        <>
          <Button type="button" onClick={() => setOpen(true)}>
            Verify with World ID
          </Button>
          <IDKitRequestWidget
            app_id={model.appId as `app_${string}`}
            action={model.action}
            rp_context={model.rpContext}
            allow_legacy_proofs
            preset={presetFor(model.requiredCredential, model.wallet)}
            open={open}
            onOpenChange={setOpen}
            onSuccess={(result) => {
              setOpen(false);
              model.onProof(result as unknown as IdkitResult);
            }}
          />
        </>
      ) : null}

      {outcome?.retry ? (
        <Button type="button" onClick={model.onRetry}>
          Try again
        </Button>
      ) : null}
    </section>
  );
}
