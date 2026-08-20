export function InkDivider() {
  return (
    <div className="flex justify-center py-10" aria-hidden>
      <svg viewBox="0 0 240 80" width="240" height="80">
        <defs>
          <linearGradient id="ink-wash" x1="0" x2="1" y1="0.5" y2="0.5">
            <stop offset="0%" stopColor="var(--hanami-ink)" stopOpacity="0" />
            <stop offset="15%" stopColor="var(--hanami-ink)" stopOpacity="0.55" />
            <stop offset="55%" stopColor="var(--hanami-ink)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--hanami-ink)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M10,42 C50,28 90,56 120,40 C160,20 200,52 230,38"
              stroke="url(#ink-wash)" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M40,46 C90,38 140,50 200,44"
              stroke="var(--hanami-ink)" strokeWidth="1.5" fill="none" opacity="0.25" />
        <circle cx="208" cy="42" r="3" fill="var(--hanami-sakura)" opacity="0.85" />
      </svg>
    </div>
  );
}
