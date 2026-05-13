// Stylized SVG portrait. The full version is Mei-chan; variants tint hair/skin/robe
// from the persona seed so different bouncers visually differ. When the AI image-gen
// stretch lands on Day 3, this becomes the fallback for any persona without a generated
// portrait yet.

type Variant = {
  bg: string;
  bgTo: string;
  skin: string;
  skinTo: string;
  hair: string;
  hairTo: string;
  robe: string;
  robeTo: string;
  accent: string;
  mouth: string;
};

const VARIANTS: Record<string, Variant> = {
  meiChan: {
    bg: "#c6b89a", bgTo: "#a08e6c",
    skin: "#efd7be", skinTo: "#c89a78",
    hair: "#1c1612", hairTo: "#3b2a20",
    robe: "#2a3653", robeTo: "#0e1530",
    accent: "#c64a6c", mouth: "#8a3a48",
  },
  kenji: {
    bg: "#9a8260", bgTo: "#6c5942",
    skin: "#e8c79b", skinTo: "#b88a64",
    hair: "#221814", hairTo: "#3a261c",
    robe: "#4a2e26", robeTo: "#1f1410",
    accent: "#a06040", mouth: "#6b3a3a",
  },
  aiko: {
    bg: "#caa692", bgTo: "#9a7b6c",
    skin: "#f3dec5", skinTo: "#d4a787",
    hair: "#3a2820", hairTo: "#5a3e30",
    robe: "#3a4a5e", robeTo: "#1e2a3a",
    accent: "#d7708f", mouth: "#9a4858",
  },
};

export function pickVariant(seed: number): keyof typeof VARIANTS {
  const keys = Object.keys(VARIANTS) as (keyof typeof VARIANTS)[];
  return keys[seed % keys.length] ?? "meiChan";
}

type Props = { variant?: keyof typeof VARIANTS; className?: string };

export function Portrait({ variant = "meiChan", className }: Props) {
  const v = VARIANTS[variant];
  const id = `p${variant}`;
  return (
    <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={v.bg} />
          <stop offset="100%" stopColor={v.bgTo} />
        </linearGradient>
        <linearGradient id={`${id}-skin`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={v.skin} />
          <stop offset="100%" stopColor={v.skinTo} />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={v.hair} />
          <stop offset="100%" stopColor={v.hairTo} />
        </linearGradient>
        <linearGradient id={`${id}-robe`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={v.robe} />
          <stop offset="100%" stopColor={v.robeTo} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={400} height={600} fill={`url(#${id}-bg)`} />
      <path d="M0,600 L0,500 C40,460 110,440 160,440 L240,440 C290,440 360,460 400,500 L400,600 Z" fill={`url(#${id}-robe)`} />
      <rect x={180} y={380} width={40} height={80} fill={`url(#${id}-skin)`} />
      <path d="M150,440 L250,440 L240,470 L160,470 Z" fill={v.accent} opacity={0.85} />
      <ellipse cx={200} cy={320} rx={78} ry={98} fill={`url(#${id}-skin)`} />
      <path d="M122,280 C122,200 168,170 200,170 C232,170 278,200 278,280 L278,310 C266,300 254,294 240,292 C228,275 218,268 200,268 C182,268 172,275 160,292 C146,294 134,300 122,310 Z" fill={`url(#${id}-hair)`} />
      <path d="M122,310 C118,360 120,400 130,440 L116,430 C100,395 100,355 110,310 Z" fill={`url(#${id}-hair)`} />
      <path d="M150,265 C170,255 200,260 220,254 C232,256 246,260 256,272 C242,288 226,294 216,290 L200,288 L184,290 C172,294 156,288 142,272 Z" fill={`url(#${id}-hair)`} />
      <path d="M168,322 C176,326 184,326 190,322" stroke="#1c1612" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <path d="M210,322 C216,326 224,326 232,322" stroke="#1c1612" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <path d="M198,338 C198,350 196,358 194,362 C198,366 202,366 206,362 C204,358 202,350 202,338" stroke="#a87a5a" strokeWidth={1} fill="none" />
      <path d="M188,378 C196,381 204,381 212,378" stroke={v.mouth} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <circle cx={124} cy={345} r={5} fill={v.accent} />
    </svg>
  );
}
