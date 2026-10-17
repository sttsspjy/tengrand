import { profile } from "@/content/profile";

// Codex ink seal (rings, arc text, "J", worn-ink specks), drawable in any ink colour.
// Used for the envelope postmark and as the click-to-stamp image in Act III.

export function drawSeal(c: HTMLCanvasElement, size: number, color: string, fonts: { text: string; display: string }, seed = 7, text?: string) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr);
  const ctx = c.getContext("2d")!;
  ctx.setTransform((size * dpr) / 200, 0, 0, (size * dpr) / 200, 0, 0);
  ctx.clearRect(0, 0, 200, 200);
  ctx.strokeStyle = ctx.fillStyle = color;
  const ring = (r: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(100, 100, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(92, 3.2);
  ring(84, 1);
  ring(58, 1.5);
  const t = text ?? `${profile.name} · Codex · ${profile.handle} · ${profile.year} · `.toUpperCase();
  ctx.font = `600 14px ${fonts.text}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const R = 71;
  const total = [...t].reduce((a, ch) => a + ctx.measureText(ch).width, 0);
  const k = (Math.PI * 2 * R) / total;
  let a = Math.PI;
  for (const ch of t) {
    const w = ctx.measureText(ch).width * k;
    const mid = a + w / 2 / R;
    ctx.save();
    ctx.translate(100 + Math.cos(mid) * R, 100 + Math.sin(mid) * R);
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += w / R;
  }
  ctx.font = `italic 300 78px ${fonts.display}`;
  ctx.fillText("J", 98, 104);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 1500; i++) {
    ctx.globalAlpha = 0.25 + rnd() * 0.75;
    ctx.beginPath();
    ctx.arc(rnd() * 200, rnd() * 200, 0.3 + rnd() * rnd() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export const fontsOf = (el: Element) => {
  const cs = getComputedStyle(el);
  return { text: cs.getPropertyValue("--f-text").trim() || "serif", display: cs.getPropertyValue("--f-display").trim() || "serif" };
};
