import type { ReactNode } from "react";

export function AsyncNotice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "success" | "error";
}) {
  return (
    <div className="ui-notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
