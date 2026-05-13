// Procedural seal: deterministic SVG from a numeric seed (tokenId).
// Same seed → same seal, forever. Mirrors the algorithm in /proposals/b3.html.

function mulberry32(a: number) {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Props = { seed: number; className?: string };

export function Seal({ seed, className }: Props) {
  const rand = mulberry32(seed * 2654435761);
  const cx = 100, cy = 100;
  const spokes = 6 + Math.floor(rand() * 4);

  const lines = Array.from({ length: spokes }, (_, i) => {
    const ang = (i / spokes) * Math.PI * 2 + rand() * 0.2;
    const r1 = 18 + rand() * 8;
    const r2 = 58 + rand() * 14;
    return {
      x1: cx + Math.cos(ang) * r1, y1: cy + Math.sin(ang) * r1,
      x2: cx + Math.cos(ang) * r2, y2: cy + Math.sin(ang) * r2,
    };
  });

  const dots = Array.from({ length: spokes }, (_, i) => {
    const ang = (i / spokes) * Math.PI * 2 + rand() * 0.2;
    const r = 62 + rand() * 10;
    return {
      cx: cx + Math.cos(ang) * r, cy: cy + Math.sin(ang) * r,
      r: 3 + rand() * 3, fill: rand() > 0.5 ? "#c64a6c" : "#1a1714",
    };
  });

  const marks = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({
    x: cx - 14 + rand() * 28, y: cy - 14 + rand() * 28,
    w: 4 + rand() * 12, h: 1.5 + rand() * 1.5,
  }));

  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <circle cx={cx} cy={cy} r={88} fill="none" stroke="#c64a6c" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={82} fill="none" stroke="#c64a6c" strokeWidth={0.5} />
      {lines.map((l, i) => (
        <line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="#1a1714" strokeWidth={1.4} opacity={0.8} />
      ))}
      {dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} opacity={0.85} />
      ))}
      {marks.map((m, i) => (
        <rect key={`m${i}`} x={m.x} y={m.y} width={m.w} height={m.h} fill="#1a1714" />
      ))}
    </svg>
  );
}
