"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const THEME_EVENT = "hanami-theme-change";

function activeTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, activeTheme, () => "light");

  function toggleTheme(): void {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    window.localStorage.setItem("hanami-theme", next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      aria-pressed={dark}
      onClick={toggleTheme}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        {dark ? (
          <>
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
          </>
        ) : (
          <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
        )}
      </svg>
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
