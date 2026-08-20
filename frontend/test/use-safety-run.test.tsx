import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSafetyRun } from "@/hooks/useSafetyRun";
import type { SafetyClient, SafetyRun } from "@/lib/safety";
import { hashBouncerContent } from "@/lib/content-hash";

const ownerAddress = "0x0000000000000000000000000000000000000001";
const persona = "A private bouncer persona with enough exact content to be certified safely.";

function run(status: SafetyRun["status"], contentHash = hashBouncerContent(persona, "")): SafetyRun {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    scope: "draft",
    slug: "sakura-society",
    ownerAddress,
    contentHash,
    status,
    completedCount: status === "passed" ? 8 : 0,
    totalCount: 8,
    reportRoot: status === "passed" ? `0x${"b".repeat(64)}` : null,
    error: status === "interrupted"
      ? { code: "INFERENCE_FAILED", message: "Provider unavailable. Resume to continue.", retryable: true }
      : null,
    scenarios: [],
    createdAt: 100,
    updatedAt: 100,
    completedAt: status === "passed" ? 110 : null,
  };
}

function client(overrides: Partial<SafetyClient> = {}): SafetyClient {
  return {
    start: vi.fn(async () => run("running")),
    get: vi.fn(async () => run("passed")),
    resume: vi.fn(async () => run("running")),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("useSafetyRun", () => {
  it("moves through owner signature, polling, and a passing report", async () => {
    vi.useFakeTimers();
    const safetyClient = client();
    const signMessage = vi.fn(async () => `0x${"a".repeat(130)}`);
    const { result } = renderHook(() => useSafetyRun({
      scope: "draft",
      slug: "sakura-society",
      persona,
      lorebook: "",
      ownerAddress,
      signMessage,
      client: safetyClient,
      pollIntervalMs: 20,
    }));

    await act(async () => result.current.start());
    expect(signMessage).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe("running");

    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(result.current.phase).toBe("passed");
    expect(result.current.run?.reportRoot).toMatch(/^0x/);
  });

  it("surfaces failure and resumes a technical interruption with a new signature", async () => {
    const failedClient = client({ start: vi.fn(async () => run("failed")) });
    const signMessage = vi.fn(async () => `0x${"a".repeat(130)}`);
    const failedHook = renderHook(() => useSafetyRun({
      scope: "draft",
      slug: "sakura-society",
      persona,
      lorebook: "",
      ownerAddress,
      signMessage,
      client: failedClient,
    }));
    await act(async () => failedHook.result.current.start());
    expect(failedHook.result.current.phase).toBe("failed");

    const interruptedClient = client({
      start: vi.fn(async () => run("interrupted")),
      resume: vi.fn(async () => run("running")),
    });
    const interruptedHook = renderHook(() => useSafetyRun({
      scope: "draft",
      slug: "sakura-society",
      persona,
      lorebook: "",
      ownerAddress,
      signMessage,
      client: interruptedClient,
    }));
    await act(async () => interruptedHook.result.current.start());
    await act(async () => interruptedHook.result.current.resume());

    expect(interruptedClient.resume).toHaveBeenCalledOnce();
    expect(signMessage).toHaveBeenCalledTimes(3);
    expect(interruptedHook.result.current.phase).toBe("running");
  });

  it("invalidates a report as soon as exact private content changes", async () => {
    const passingClient = client({ start: vi.fn(async () => run("passed")) });
    const signMessage = vi.fn(async () => `0x${"a".repeat(130)}`);
    const { result, rerender } = renderHook(
      ({ currentPersona }) => useSafetyRun({
        scope: "draft",
        slug: "sakura-society",
        persona: currentPersona,
        lorebook: "",
        ownerAddress,
        signMessage,
        client: passingClient,
      }),
      { initialProps: { currentPersona: persona } },
    );
    await act(async () => result.current.start());
    expect(result.current.phase).toBe("passed");

    rerender({ currentPersona: `${persona} edited` });
    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(result.current.run).toBeNull();
  });

  it("restores a known exact-content run after remount without another signature", async () => {
    const started = run("running");
    const startClient = client({ start: vi.fn(async () => started) });
    const signMessage = vi.fn(async () => `0x${"a".repeat(130)}`);
    const first = renderHook(() => useSafetyRun({
      scope: "draft",
      slug: "sakura-society",
      persona,
      lorebook: "",
      ownerAddress,
      signMessage,
      client: startClient,
    }));

    await act(async () => first.result.current.start());
    first.unmount();

    const restoredClient = client({ get: vi.fn(async () => run("passed")) });
    const restored = renderHook(() => useSafetyRun({
      scope: "draft",
      slug: "sakura-society",
      persona,
      lorebook: "",
      ownerAddress,
      signMessage,
      client: restoredClient,
    }));

    await waitFor(() => expect(restored.result.current.phase).toBe("passed"));
    expect(restoredClient.get).toHaveBeenCalledWith(started.id);
    expect(signMessage).toHaveBeenCalledOnce();
  });
});
