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
type Random = () => number;

function stableCoordinate(value: number): number {
  return Number(value.toFixed(4));
}

function sealLine(rand: Random, index: number, spokes: number) {
  const angle = (index / spokes) * Math.PI * 2 + rand() * 0.2;
  const innerRadius = 18 + rand() * 8;
  const outerRadius = 58 + rand() * 14;
  return {
    x1: stableCoordinate(100 + Math.cos(angle) * innerRadius),
    y1: stableCoordinate(100 + Math.sin(angle) * innerRadius),
    x2: stableCoordinate(100 + Math.cos(angle) * outerRadius),
    y2: stableCoordinate(100 + Math.sin(angle) * outerRadius),
  };
}

function sealDot(rand: Random, index: number, spokes: number) {
  const angle = (index / spokes) * Math.PI * 2 + rand() * 0.2;
  const radius = 62 + rand() * 10;
  return {
    cx: stableCoordinate(100 + Math.cos(angle) * radius),
    cy: stableCoordinate(100 + Math.sin(angle) * radius),
    r: stableCoordinate(3 + rand() * 3),
    accent: rand() > 0.5,
  };
}

function sealMark(rand: Random) {
  return {
    x: stableCoordinate(86 + rand() * 28),
    y: stableCoordinate(86 + rand() * 28),
    w: stableCoordinate(4 + rand() * 12),
    h: stableCoordinate(1.5 + rand() * 1.5),
  };
}

export function Seal({ seed, className }: Props) {
  const rand = mulberry32(seed * 2654435761);
  const spokes = 6 + Math.floor(rand() * 4);
  const lines = Array.from({ length: spokes }, (_, index) => sealLine(rand, index, spokes));
  const dots = Array.from({ length: spokes }, (_, index) => sealDot(rand, index, spokes));
  const marks = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => sealMark(rand));

  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <circle cx={100} cy={100} r={88} fill="none" stroke="var(--hanami-sakura)" strokeWidth={2} />
      <circle cx={100} cy={100} r={82} fill="none" stroke="var(--hanami-sakura)" strokeWidth={0.5} />
      {lines.map((l, i) => (
        <line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="var(--hanami-ink)" strokeWidth={1.4} opacity={0.8} />
      ))}
      {dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} fill={d.accent ? "var(--hanami-sakura)" : "var(--hanami-ink)"} opacity={0.85} />
      ))}
      {marks.map((m, i) => (
        <rect key={`m${i}`} x={m.x} y={m.y} width={m.w} height={m.h} fill="var(--hanami-ink)" />
      ))}
    </svg>
  );
}
