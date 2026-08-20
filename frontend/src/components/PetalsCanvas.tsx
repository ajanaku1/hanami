"use client";

import { useEffect, useRef } from "react";

type Petal = {
  x: number; y: number; r: number;
  vx: number; vy: number;
  a: number; va: number;
  hue: string; o: number;
};

const COUNT = 28;
const PINK = "#d7708f";
const PALE = "#e9b5c2";

export function PetalsCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    const resize = () => { W = c.width = window.innerWidth; H = c.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const petals: Petal[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 4 + Math.random() * 6,
      vy: 0.2 + Math.random() * 0.6,
      vx: -0.3 + Math.random() * 0.6,
      a: Math.random() * Math.PI * 2,
      va: -0.01 + Math.random() * 0.02,
      hue: Math.random() > 0.5 ? PINK : PALE,
      o: 0.25 + Math.random() * 0.4,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of petals) {
        p.x += p.vx; p.y += p.vy; p.a += p.va;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.globalAlpha = p.o; ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className="petals-canvas fixed inset-0 pointer-events-none z-0" aria-hidden />;
}
