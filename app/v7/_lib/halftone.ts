import type { PlatePath } from "./plates";

// Risograph-style halftone: dots on a rotated screen whose radius follows a density field.
// Drawn once into a canvas (static), so moving the layer costs only a transform.

export type Density = (u: number, v: number) => number;

export function drawHalftone(cv: HTMLCanvasElement, dens: Density, color: string, cell: number, angleDeg: number, maxR = 0.62, res = 1) {
  const w = cv.offsetWidth;
  const h = cv.offsetHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * res;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  const a = (angleDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const diag = Math.hypot(w, h);
  ctx.beginPath();
  for (let gy = -diag; gy < diag; gy += cell) {
    for (let gx = -diag; gx < diag; gx += cell) {
      const x = w / 2 + gx * ca - gy * sa;
      const y = h / 2 + gx * sa + gy * ca;
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
      const d = dens(x / w, y / h);
      if (d <= 0.02) continue;
      const r = Math.sqrt(Math.min(1, d)) * cell * maxR;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

/** Density field from engraved plate paths: rasterise thick + blurred, then sample. */
export function plateDensity(paths: PlatePath[], vw: number, vh: number): Density {
  const W = 170;
  const H = Math.round((W * vh) / vw);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.filter = "blur(3px)";
  ctx.scale(W / vw, H / vh);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  for (const p of paths) {
    ctx.lineWidth = (p.w ?? 0.8) * 9;
    const path = new Path2D(p.d);
    ctx.stroke(path);
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  return (u, v) => {
    const x = Math.max(0, Math.min(W - 1, Math.floor(u * W)));
    const y = Math.max(0, Math.min(H - 1, Math.floor(v * H)));
    return (data[(y * W + x) * 4 + 3] / 255) * 1.5;
  };
}
