"use client";

import { useCallback, useEffect, useState } from "react";
import { useSendTransaction, useSignMessage } from "wagmi";
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
  const { signMessageAsync } = useSignMessage();

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
        // Revoking names a ticket, so it is authorized by its own signature rather than the one
        // that unlocked Admin — the owner is signing this revoke, not a session.
        const nonce = Date.now();
        const sig = await signMessageAsync({ message: `Hanami: revoke ${ticketId} on ${slug} at ${nonce}` });
        const prepared = await api.prepareRevoke(slug, ticketId, { caller: auth.caller, nonce, sig });
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
    [slug, auth, sendTransactionAsync, signMessageAsync, load],
  );

  return { rows, error, revoke, revoking, reload: load };
}
