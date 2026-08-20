import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="app-header">
      <Link href="/" className="app-wordmark" aria-label="Hanami home">
        <Logo size={30} />
        <span className="app-wordmark__name">Hanami</span>
        <span className="app-wordmark__jp">花見</span>
      </Link>
      <div className="app-header__right">
        <nav className="app-nav" aria-label="Primary navigation">
          <Link href="/create">Create</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/mine">Mine</Link>
        </nav>
        {actions}
      </div>
    </header>
  );
}
