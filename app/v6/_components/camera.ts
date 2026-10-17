// Camera math shared by the shader, the CSS 3D rig and pointer picking.
// World: y up, z forward. yaw turns toward +x, pitch looks up, roll banks the image clockwise.
// Screen uv: (frag - 0.5 * res) / res.y, ray = normalize(f * F + r * uv.x + u * uv.y).

export type Pose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; F: number };

export const mkPose = (): Pose => ({ x: 0, y: 1, z: 0, yaw: 0, pitch: 0, roll: 0, F: 1.5 });

export function copyPose(a: Pose, b: Pose) {
  b.x = a.x;
  b.y = a.y;
  b.z = a.z;
  b.yaw = a.yaw;
  b.pitch = a.pitch;
  b.roll = a.roll;
  b.F = a.F;
}

export type Basis = { f: number[]; r: number[]; u: number[]; r0: number[]; u0: number[] };
export const mkBasis = (): Basis => ({ f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], r0: [1, 0, 0], u0: [0, 1, 0] });

/** Fills forward / right / up (rolled) and unrolled right0 / up0. */
export function basis(p: Pose, b: Basis) {
  const cy = Math.cos(p.yaw),
    sy = Math.sin(p.yaw),
    cp = Math.cos(p.pitch),
    sp = Math.sin(p.pitch);
  const f = b.f,
    r0 = b.r0,
    u0 = b.u0;
  f[0] = sy * cp;
  f[1] = sp;
  f[2] = cy * cp;
  r0[0] = cy;
  r0[1] = 0;
  r0[2] = -sy;
  // u0 = f x r0
  u0[0] = f[1] * r0[2] - f[2] * r0[1];
  u0[1] = f[2] * r0[0] - f[0] * r0[2];
  u0[2] = f[0] * r0[1] - f[1] * r0[0];
  const cr = Math.cos(p.roll),
    sr = Math.sin(p.roll);
  for (let i = 0; i < 3; i++) {
    b.r[i] = r0[i] * cr + u0[i] * sr;
    b.u[i] = u0[i] * cr - r0[i] * sr;
  }
}

const tmpB = mkBasis();

/** Projects a world point to screen px. Returns depth (<=0 means behind). */
export function project(p: Pose, wx: number, wy: number, wz: number, vw: number, vh: number, out: { x: number; y: number; d: number }) {
  basis(p, tmpB);
  const dx = wx - p.x,
    dy = wy - p.y,
    dz = wz - p.z;
  const d = dx * tmpB.f[0] + dy * tmpB.f[1] + dz * tmpB.f[2];
  out.d = d;
  if (d <= 0.01) return out;
  const x = ((dx * tmpB.r[0] + dy * tmpB.r[1] + dz * tmpB.r[2]) / d) * p.F;
  const y = ((dx * tmpB.u[0] + dy * tmpB.u[1] + dz * tmpB.u[2]) / d) * p.F;
  out.x = vw / 2 + x * vh;
  out.y = vh / 2 - y * vh;
  return out;
}

/** World ray direction through a screen px. */
export function rayAt(p: Pose, sx: number, sy: number, vw: number, vh: number, out: number[]) {
  basis(p, tmpB);
  const ux = (sx - vw / 2) / vh,
    uy = (vh / 2 - sy) / vh;
  let l = 0;
  for (let i = 0; i < 3; i++) {
    out[i] = tmpB.f[i] * p.F + tmpB.r[i] * ux + tmpB.u[i] * uy;
    l += out[i] * out[i];
  }
  l = Math.sqrt(l);
  for (let i = 0; i < 3; i++) out[i] /= l;
  return out;
}

/** Ray vs y=0 plane. Returns [x, z] or null. */
export function hitGround(p: Pose, d: number[]): [number, number] | null {
  if (d[1] >= -1e-4) return null;
  const t = -p.y / d[1];
  return [p.x + d[0] * t, p.z + d[2] * t];
}

/** Ray vs a y-rotated box standing on y=0 (x, z, rot, H; proportions 4:9:1). Returns t or -1. */
export function hitSlab(o: number[], d: number[], s: number[]): number {
  const c = Math.cos(s[2]),
    sn = Math.sin(s[2]);
  const H = s[3];
  const ox = o[0] - s[0],
    oy = o[1] - H * 0.5,
    oz = o[2] - s[1];
  const lo = [c * ox - sn * oz, oy, sn * ox + c * oz];
  const ld = [c * d[0] - sn * d[2], d[1], sn * d[0] + c * d[2]];
  const hs = [H * 0.2222, H * 0.5, H * 0.0556];
  let tn = -Infinity,
    tf = Infinity;
  for (let i = 0; i < 3; i++) {
    const dd = Math.abs(ld[i]) < 1e-6 ? 1e-6 : ld[i];
    const t1 = (-hs[i] - lo[i]) / dd,
      t2 = (hs[i] - lo[i]) / dd;
    tn = Math.max(tn, Math.min(t1, t2));
    tf = Math.min(tf, Math.max(t1, t2));
  }
  if (tn > tf || tf < 0) return -1;
  return tn;
}

/* ---------- keyframe tracks: monotone cubic Hermite (no overshoot, dwell at extrema) ---------- */

export type Track = { g: number[]; v: number[][]; m: number[][]; n: number };

/** keys: [g, v0, v1, ...] sorted by g. */
export function mkTrack(keys: number[][]): Track {
  const n = keys[0].length - 1;
  const g = keys.map((k) => k[0]);
  const v = keys.map((k) => k.slice(1));
  const m = v.map(() => new Array<number>(n).fill(0));
  const K = keys.length;
  for (let c = 0; c < n; c++) {
    const del: number[] = [];
    for (let i = 0; i < K - 1; i++) del.push((v[i + 1][c] - v[i][c]) / Math.max(1e-6, g[i + 1] - g[i]));
    for (let i = 1; i < K - 1; i++) {
      const a = del[i - 1],
        b = del[i];
      if (a * b <= 0) m[i][c] = 0;
      else {
        // Fritsch–Carlson harmonic-mean tangent
        const w1 = 2 * (g[i + 1] - g[i]) + (g[i] - g[i - 1]);
        const w2 = (g[i + 1] - g[i]) + 2 * (g[i] - g[i - 1]);
        m[i][c] = (w1 + w2) / (w1 / a + w2 / b);
      }
    }
  }
  return { g, v, m, n };
}

export function sample(t: Track, x: number, out: number[]) {
  const { g, v, m, n } = t;
  const K = g.length;
  if (x <= g[0]) {
    for (let c = 0; c < n; c++) out[c] = v[0][c];
    return out;
  }
  if (x >= g[K - 1]) {
    for (let c = 0; c < n; c++) out[c] = v[K - 1][c];
    return out;
  }
  let i = 0;
  while (i < K - 2 && x > g[i + 1]) i++;
  const h = g[i + 1] - g[i];
  const s = (x - g[i]) / h;
  const s2 = s * s,
    s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1,
    h10 = s3 - 2 * s2 + s,
    h01 = -2 * s3 + 3 * s2,
    h11 = s3 - s2;
  for (let c = 0; c < n; c++) out[c] = h00 * v[i][c] + h10 * h * m[i][c] + h01 * v[i + 1][c] + h11 * h * m[i + 1][c];
  return out;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lin = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));
/** Shortest-arc angle lerp. */
export function lerpAng(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
