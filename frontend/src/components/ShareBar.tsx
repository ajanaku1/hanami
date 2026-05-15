"use client";

import { useEffect, useState } from "react";

type Props = {
  /** Path on the current origin, e.g. "/c/badfrogs". The absolute URL is computed client-side. */
  path: string;
  /** Default share message — pasted into X/Telegram intents before the URL. */
  shareText?: string;
  /** Optional label shown above the link row. */
  label?: string;
};

// Reusable copy-and-share row. Native clipboard for the copy button, intent URLs for X and
// Telegram (they prefill the post / chat message with the URL + a short caption).
export function ShareBar({ path, shareText = "Apply to my Hanami bouncer", label = "Share applicant link" }: Props) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Older browsers / non-https — fall back to selection.
      const sel = window.getSelection();
      const range = document.createRange();
      const tmp = document.createElement("span");
      tmp.textContent = url;
      document.body.appendChild(tmp);
      range.selectNodeContents(tmp);
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand("copy");
      tmp.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`;

  return (
    <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-4">
      {label && (
        <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] mb-3">{label}</div>
      )}
      <div className="flex items-stretch gap-0 border border-[var(--hanami-rule)] bg-[var(--hanami-paper)]">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="applicant link"
          className="flex-1 px-3 py-2 font-mono text-[12px] bg-transparent border-none outline-none truncate"
        />
        <button
          onClick={copy}
          className="px-4 py-2 text-[11px] tracking-[0.14em] uppercase border-l border-[var(--hanami-rule)] hover:bg-[var(--hanami-paper-soft)] transition-colors min-w-[88px]"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="flex gap-3 mt-3 text-[11px] tracking-[0.14em] uppercase">
        <a
          href={xHref}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] px-3 py-1.5 transition-colors"
        >
          share on x
        </a>
        <a
          href={tgHref}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] px-3 py-1.5 transition-colors"
        >
          share on telegram
        </a>
      </div>
    </div>
  );
}
