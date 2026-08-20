import type { ReactNode } from "react";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { AppHeader } from "./AppHeader";

export function PageShell({
  children,
  actions,
  width = "wide",
}: {
  children: ReactNode;
  actions?: ReactNode;
  width?: "narrow" | "wide" | "full";
}) {
  return (
    <>
      <PetalsCanvas />
      <AppHeader actions={actions} />
      <main className="page-shell" data-width={width}>{children}</main>
    </>
  );
}
