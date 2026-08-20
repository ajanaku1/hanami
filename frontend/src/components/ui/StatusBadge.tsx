import type { ReactNode } from "react";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "certified" | "warning" | "error" | "neutral" | "active";
}) {
  return <span className="ui-status" data-tone={tone}>{children}</span>;
}
