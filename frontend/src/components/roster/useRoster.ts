"use client";

import { useCallback, useEffect, useState } from "react";
import { useSendTransaction } from "wagmi";
import { api, type AdminAuth, type RosterRow } from "@/lib/api";
import type { RevokeState } from "./RevokeButton";

/// The owner's roster and the one action they can take on it.
///
/// Revoking is the owner's authority on chain, so the backend only prepares the transaction and
/// this sends it from the owner's own wallet. The roster is reloaded afterwards rather than
/// patched in memory, because the chain is what decides whether a ticket is still live.

export function useRoster(slug: string, auth: AdminAuth | null) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ ticketId: string; state: RevokeState; error?: string }>();
  const { sendTransactionAsync } = useSendTransaction();

  const load = useCallback(async () => {
    if (!auth) return;
    try {
      setRows(await api.getRoster(slug, auth));
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [slug, auth]);

  useEffect(() => {
    if (!auth) return;
    let live = true;
    api
      .getRoster(slug, auth)
      .then((next) => {
        if (live) setRows(next);
      })
      .catch((caught: Error) => {
        if (live) setError(caught.message);
      });
    return () => {
      live = false;
    };
  }, [slug, auth]);

  const revoke = useCallback(
    async (ticketId: string) => {
      if (!auth) return;
      setRevoking({ ticketId, state: "pending" });
      try {
        const prepared = await api.prepareRevoke(slug, ticketId, auth);
        await sendTransactionAsync({
          to: prepared.to as `0x${string}`,
          data: prepared.data as `0x${string}`,
        });
        setRevoking({ ticketId, state: "success" });
        await load();
      } catch (caught) {
        setRevoking({ ticketId, state: "error", error: (caught as Error).message });
      }
    },
    [slug, auth, sendTransactionAsync, load],
  );

  return { rows, error, revoke, revoking, reload: load };
}
