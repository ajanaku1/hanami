"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/// Revoking a ticket is one confirmed wallet action, and it cannot be taken back. So the button
/// asks first, names the network it is about to send to, and says what failed when it fails.

export type RevokeState = "idle" | "pending" | "success" | "error";

export function RevokeButton({
  ticketId,
  onRevoke,
  state = "idle",
  error,
}: {
  ticketId: string;
  onRevoke: (ticketId: string) => void;
  state?: RevokeState;
  error?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (state === "pending") {
    return (
      <div role="status" className="ui-notice" data-tone="info">
        Waiting for you to confirm in your wallet, on 0G.
      </div>
    );
  }

  if (state === "success") {
    return (
      <div role="status" className="ui-notice" data-tone="success">
        Ticket #{ticketId} revoked.
      </div>
    );
  }

  if (state === "error") {
    return (
      <div>
        <div role="alert" className="ui-notice" data-tone="error">
          {error ?? "The revoke did not go through."}
        </div>
        <Button type="button" onClick={() => onRevoke(ticketId)}>
          Try again
        </Button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div>
        <p>Revoke ticket #{ticketId}? This cannot be undone.</p>
        <Button type="button" onClick={() => onRevoke(ticketId)}>
          Confirm revoke
        </Button>
        <Button type="button" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" onClick={() => setConfirming(true)}>
      Revoke
    </Button>
  );
}
