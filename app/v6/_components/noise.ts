// Shared value-noise texture: 256^2 RGBA8, G random, R = G shifted by (37, 17) so the shader can do a
// 3D lookup with one fetch. JS mirrors the shader's n2() and cloudH() for camera clearance.

export const NOISE_N = 256;
let tex: Uint8Array | null = null;

/** RGBA bytes of the noise texture (deterministic). */
export function noiseData(): Uint8Array {
  if (tex) return tex;
  const N = NOISE_N;
  const g = new Uint8Array(N * N);
  let s = 0x2f6b9a1d;
  for (let i = 0; i < N * N; i++) {
    // mulberry32
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    g[i] = ((t ^ (t >>> 14)) >>> 0) & 255;
  }
  const out = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      out[o] = g[((y + 17) & 255) * N + ((x + 37) & 255)];
      out[o + 1] = g[y * N + x];
      out[o + 2] = 0;
      out[o + 3] = 255;
    }
  tex = out;
  return out;
}

const r = (x: number, y: number) => noiseData()[(((y & 255) * NOISE_N + (x & 255)) << 2)] / 255;

/** Mirrors GLSL n2(). */
export function n2(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let fx = x - ix,
    fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = r(ix, iy),
    b = r(ix + 1, iy),
    c = r(ix, iy + 1),
    d = r(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

const TEAR = [1150, 450, 70, 230];
const canyonZ = (x: number) => -30 + 15 * Math.sin(x * 0.004);
const ss = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** Mirrors GLSL cloudH() (time in shader seconds). */
export function cloudH(px: number, pz: number, time: number, oct = 3) {
  let qx = px * 0.011 + time * 0.004,
    qy = pz * 0.011;
  let h = 0,
    a = 1,
    s = 0;
  for (let i = 0; i < oct; i++) {
    const nn = n2(qx, qy);
    h += a * (Math.abs(2 * nn - 1) * 0.6 + nn * 0.4);
    s += a;
    const nx = 0.8 * qx + 0.6 * qy,
      ny = -0.6 * qx + 0.8 * qy;
    qx = nx * 2.07 + 1.7;
    qy = ny * 2.07 + 1.7;
    a *= 0.5;
  }
  h /= s;
  let y = 14 * (1 - Math.exp(-h * 1.6)) - 5 + 5 * (n2(px * 0.0011 + 3, pz * 0.0011 + 3) - 0.5);
  const dz = Math.abs(pz - canyonZ(px)) - 58;
  const wall = Math.exp((-dz * dz) / 700) * ss(-120, 0, px) * (1 - ss(560, 720, px));
  if (wall > 0.01) {
    const hb = Math.abs(2 * n2(px * 0.035 + 2, pz * 0.035 + 2) - 1) * 0.6 + Math.abs(2 * n2(px * 0.08 + 5, pz * 0.08 + 5) - 1) * 0.4;
    y += wall * 22 * (0.45 + 0.4 * h + 0.45 * hb);
  }
  let tx = (px - TEAR[0]) / TEAR[2];
  const tz = (pz - TEAR[1]) / TEAR[3];
  tx += 0.3 * Math.sin(tz * 2.6);
  const tr = (tx * tx + tz * tz) * (0.75 + 0.55 * n2(px * 0.02 + 9, pz * 0.02 + 9));
  if (tr < 4) y -= 95 * Math.exp(-tr * tr * 1.4);
  return y;
}
