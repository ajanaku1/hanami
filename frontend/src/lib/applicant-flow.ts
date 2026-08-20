export type ApplicantMessage = {
  role: "applicant" | "bouncer";
  content: string;
};

export type ApplicantChatState = {
  history: ApplicantMessage[];
  failedMessage: string | null;
};

export function startApplicantTurn(state: ApplicantChatState, message: string): ApplicantChatState {
  return {
    history: [...state.history, { role: "applicant", content: message }],
    failedMessage: null,
  };
}

export function failApplicantTurn(state: ApplicantChatState, message: string): ApplicantChatState {
  return { ...state, failedMessage: message };
}

export function retryApplicantTurn(state: ApplicantChatState): {
  state: ApplicantChatState;
  message: string;
} {
  if (!state.failedMessage) throw new Error("There is no failed applicant message to retry.");
  return { state, message: state.failedMessage };
}

export function completeApplicantTurn(state: ApplicantChatState, reply: string): ApplicantChatState {
  return {
    history: [...state.history, { role: "bouncer", content: reply }],
    failedMessage: null,
  };
}
