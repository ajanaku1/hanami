"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type DoorRpContext, type DoorState, type DoorStatus } from "@/lib/api";
import type { IdkitResult } from "./DoorPanel";

/// Holds the Door for one campaign and one wallet.
///
/// The Door's state lives on the server, so this refetches whenever the wallet changes. That is
/// what makes a reconnect resume rather than restart: a wallet that verified an hour ago comes
/// back verified, without touching World again.

const NONE: DoorStatus = { state: "none", requiredCredential: "orb", method: null };

export function useDoor(slug: string, wallet: string | null) {
  const [status, setStatus] = useState<DoorStatus>(NONE);
  const [pending, setPending] = useState(false);
  const [rpContext, setRpContext] = useState<DoorRpContext | null>(null);

  useEffect(() => {
    let live = true;
    api
      .getDoorContext(slug)
      .then((response) => {
        if (live) setRpContext(response.rpContext);
      })
      .catch(() => {
        // No signed request context means no widget; the panel says so rather than half-opening.
        if (live) setRpContext(null);
      });
    return () => {
      live = false;
    };
  }, [slug]);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setStatus(await api.getDoorStatus(slug, wallet));
  }, [slug, wallet]);

  useEffect(() => {
    if (!wallet) return;
    let live = true;
    api
      .getDoorStatus(slug, wallet)
      .then((next) => {
        if (live) setStatus(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug, wallet]);

  const submitProof = useCallback(
    async (result: IdkitResult) => {
      if (!wallet) return;
      setPending(true);
      try {
        setStatus(await api.verifyDoor(slug, wallet, result));
      } finally {
        setPending(false);
      }
    },
    [slug, wallet],
  );

  /// After a rejection or an unreachable verifier, the applicant may try again. A person who has
  /// already applied cannot, so this deliberately does not reset a "used" or "closed" Door.
  const retry = useCallback(() => {
    if (status.state === "rejected" || status.state === "unavailable") {
      setStatus({ ...status, state: "none" });
    }
  }, [status]);

  const effective = wallet ? status : NONE;
  const state: DoorState = pending ? "pending" : effective.state;
  return {
    state,
    status: effective,
    rpContext,
    submitProof,
    retry,
    refresh,
    verified: effective.state === "verified",
  };
}
