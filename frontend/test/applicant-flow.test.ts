import { describe, expect, it } from "vitest";
import {
  completeApplicantTurn,
  failApplicantTurn,
  retryApplicantTurn,
  startApplicantTurn,
  type ApplicantChatState,
} from "@/lib/applicant-flow";

describe("applicant retry flow", () => {
  it("retries only the failed message without duplicating chat history", () => {
    const initial: ApplicantChatState = {
      history: [{ role: "bouncer", content: "Tell me what you have built." }],
      failedMessage: null,
    };
    const started = startApplicantTurn(initial, "I shipped a privacy-preserving mint.");
    const failed = failApplicantTurn(started, "I shipped a privacy-preserving mint.");

    const retry = retryApplicantTurn(failed);
    expect(retry.message).toBe("I shipped a privacy-preserving mint.");
    expect(retry.state.history.filter((message) => message.role === "applicant")).toHaveLength(1);

    const recovered = completeApplicantTurn(retry.state, "Show me the contract evidence.");
    expect(recovered.failedMessage).toBeNull();
    expect(recovered.history).toHaveLength(3);
  });
});
