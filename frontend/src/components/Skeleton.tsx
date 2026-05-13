export function Skeleton({ className = "", w, h }: { className?: string; w?: string; h?: string }) {
  return (
    <div
      className={`bg-[var(--hanami-rule)]/40 animate-pulse rounded-sm ${className}`}
      style={{ width: w, height: h ?? "1em" }}
      aria-hidden
    />
  );
}

export function MarketCardSkeleton() {
  return (
    <div className="bg-[var(--hanami-paper-soft)] border border-[var(--hanami-rule)] flex flex-col"
         style={{ boxShadow: "0 16px 48px -32px rgba(26,23,20,0.25)" }}>
      <Skeleton h="100%" className="aspect-square !rounded-none" />
      <div className="px-5 pt-5 pb-3 space-y-2">
        <Skeleton w="60%" h="20px" />
        <Skeleton w="40%" h="12px" />
      </div>
      <div className="px-5 pb-3 space-y-2">
        <Skeleton w="100%" h="3px" />
      </div>
      <div className="grid grid-cols-2 gap-px bg-[var(--hanami-rule)] mt-3 border-t border-[var(--hanami-rule)]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--hanami-paper-soft)] px-5 py-3 space-y-1">
            <Skeleton w="50%" h="10px" />
            <Skeleton w="70%" h="14px" />
          </div>
        ))}
      </div>
      <div className="px-5 py-4 border-t border-[var(--hanami-rule)]">
        <Skeleton w="100%" h="36px" />
      </div>
    </div>
  );
}

export function MarketGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
      {Array.from({ length: count }).map((_, i) => <MarketCardSkeleton key={i} />)}
    </div>
  );
}
