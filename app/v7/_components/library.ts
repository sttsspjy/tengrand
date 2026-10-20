// The Infinite Library: a hexagonal atrium well of book galleries, rendered in WebGL2 as a risograph print.
// Pass 1 draws one merged static mesh into two RGBA8 targets: (light, warm, material, ink lines) and
// (normal.xy, linear depth hi/lo). Pass 2 prints it: paper ground, teal + orange halftone screens at their
// own angles (slightly out of register), black keyline from depth/normal edges, paper grain.

export type LibCam = { cy: number; ca: number; cr: number; yaw: number; pitch: number; roll: number; fov: number };
export type Rect = { x: number; y: number; w: number; h: number; ok: boolean };

export const H = 6; // level height
const SL = 0.7; // slab thickness
export const A0 = 6.5; // void edge apothem
export const A1 = 11.5; // bookcase wall apothem
const TOP = -6;
export const BOT = 6; // the floor of the well is level BOT (y = -BOT*H)
const T30 = Math.tan(Math.PI / 6);
const SHELF0 = 0.12;
const SHELF_GAP = 1.0;
export const EYE = 2.4;
/** stair helix height at angle 0; chosen so stations facing wall k at level L (θ = 180L) see it ±6 off eye height */
const STAIR_Y0 = EYE + 6;

// material classes (pass 1 writes cls/15)
const C = { stone: 0, teal: 1, orange: 2, black: 3, paper: 4, lamp: 5, floor: 6, wood: 7, back: 8, feature: 9, title: 10, rail: 11 };

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

/** Seeded PRNG. */
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Growable interleaved vertex buffer: pos3 nrm3 cls var u v (10 floats). */
class Mesh {
  v: Float32Array = new Float32Array(1 << 16);
  i: Uint32Array = new Uint32Array(1 << 15);
  nv = 0;
  ni = 0;
  private grow(nv: number, ni: number) {
    if ((this.nv + nv) * 10 > this.v.length) {
      const n = new Float32Array(Math.max(this.v.length * 2, (this.nv + nv) * 10));
      n.set(this.v);
      this.v = n;
    }
    if (this.ni + ni > this.i.length) {
      const n = new Uint32Array(Math.max(this.i.length * 2, this.ni + ni));
      n.set(this.i);
      this.i = n;
    }
  }
  /** quad p0 p1 p2 p3 (counter-clockwise seen from the normal side); uv per corner (0,0)(1,0)(1,1)(0,1) or none (-1) */
  quad(p0: V3, p1: V3, p2: V3, p3: V3, n: V3, cls: number, vr: number, uv = true) {
    this.grow(4, 6);
    const b = this.nv;
    const pts = [p0, p1, p2, p3];
    const uvs = uv ? [0, 0, 1, 0, 1, 1, 0, 1] : [-1, -1, -1, -1, -1, -1, -1, -1];
    for (let k = 0; k < 4; k++) {
      const o = (b + k) * 10;
      this.v[o] = pts[k][0];
      this.v[o + 1] = pts[k][1];
      this.v[o + 2] = pts[k][2];
      this.v[o + 3] = n[0];
      this.v[o + 4] = n[1];
      this.v[o + 5] = n[2];
      this.v[o + 6] = cls;
      this.v[o + 7] = vr;
      this.v[o + 8] = uvs[k * 2];
      this.v[o + 9] = uvs[k * 2 + 1];
    }
    this.i.set([b, b + 1, b + 2, b, b + 2, b + 3], this.ni);
    this.nv += 4;
    this.ni += 6;
  }
  /**
   * Oriented box. c = centre; ax/ay/az = unit axes (az points toward the viewer side, the "front");
   * sx/sy/sz = full sizes. faces: bit 1 front, 2 back, 4 top, 8 bottom, 16 left, 32 right.
   * uvFront: give the front face a 0..1 uv (spines, step treads).
   */
  box(c: V3, ax: V3, ay: V3, az: V3, sx: number, sy: number, sz: number, cls: number, vr: number, faces = 63, uvFront = false, clsSide = cls) {
    const hx = mul(ax, sx / 2);
    const hy = mul(ay, sy / 2);
    const hz = mul(az, sz / 2);
    const P = (i: number, j: number, k: number) => add(add(add(c, mul(hx, i)), mul(hy, j)), mul(hz, k));
    const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];
    if (faces & 1) this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), az, cls, vr, uvFront);
    if (faces & 2) this.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), neg(az), clsSide, vr, false);
    if (faces & 4) this.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), ay, clsSide, vr, false);
    if (faces & 8) this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), neg(ay), clsSide, vr, false);
    if (faces & 16) this.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), neg(ax), clsSide, vr, false);
    if (faces & 32) this.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), ax, clsSide, vr, false);
  }
}

const UP: V3 = [0, 1, 0];
/** wall frame k: n = outward normal, t = tangent (left→right seen from the void) */
const wallFrame = (theta: number) => {
  const n: V3 = [Math.cos(theta), 0, Math.sin(theta)];
  const t: V3 = [Math.sin(theta), 0, -Math.cos(theta)];
  return { n, t, inward: mul(n, -1) as V3 };
};
/** point on wall frame: apothem a, tangential u, height y */
const wp = (f: ReturnType<typeof wallFrame>, a: number, u: number, y: number): V3 => [f.n[0] * a + f.t[0] * u, y, f.n[2] * a + f.t[2] * u];

export type Slot = { level: number; wall: number; u: number; shelf: number; w: number; h: number; d: number };

export type LibSpec = {
  /** title book: standing, spine out; dims in world units */
  title: Slot;
  /** one featured book per project */
  feature: Slot[];
};

function build(spec: LibSpec) {
  const m = new Mesh();
  const feat = new Mesh();
  const title = new Mesh();
  const r = rng(20260);
  const slotKey = (s: Slot) => `${s.level}|${s.wall}|${s.shelf}`;
  // the shelf runs leave a gap where the reserved books go
  const reserved = new Map<string, Slot[]>();
  for (const s of [spec.title, ...spec.feature]) {
    const k = slotKey(s);
    reserved.set(k, [...(reserved.get(k) ?? []), s]);
  }

  for (let L = TOP; L <= BOT; L++) {
    const fy = -L * H;
    const ceil = fy + H - SL;
    for (let k = 0; k < 6; k++) {
      const th = (k * Math.PI) / 3;
      const f = wallFrame(th);
      const h0 = A0 * T30;
      const h1 = A1 * T30;
      // floor slab ring (or the solid floor of the well)
      if (L === BOT) {
        m.quad([0, fy, 0], wp(f, A1, -h1, fy), wp(f, A1, h1, fy), [0, fy, 0], UP, C.floor, 0, false);
      } else {
        m.quad(wp(f, A0, h0, fy), wp(f, A0, -h0, fy), wp(f, A1, -h1, fy), wp(f, A1, h1, fy), UP, C.stone, 0.15, false);
        m.quad(wp(f, A0, -h0, fy - SL), wp(f, A0, h0, fy - SL), wp(f, A1, h1, fy - SL), wp(f, A1, -h1, fy - SL), [0, -1, 0], C.stone, 0.4, false);
        m.quad(wp(f, A0, -h0, fy - SL), wp(f, A0, -h0, fy), wp(f, A0, h0, fy), wp(f, A0, h0, fy - SL), f.inward, C.stone, 0.05, false);
        // railing: top + bottom rail and balusters
        const ra = A0 + 0.1;
        const rl = ra * T30 * 2 - 0.25;
        m.box(wp(f, ra, 0, fy + 1.08), f.t, UP, f.inward, rl, 0.09, 0.12, C.rail, 0, 1 | 4 | 8);
        m.box(wp(f, ra, 0, fy + 0.14), f.t, UP, f.inward, rl, 0.07, 0.1, C.rail, 0, 1 | 4);
        const nb = Math.floor(rl / 0.42);
        for (let b = 0; b <= nb; b++) {
          const u = -rl / 2 + (b * rl) / nb;
          m.box(wp(f, ra, u, fy + 0.61), f.t, UP, f.inward, 0.045, 0.86, 0.045, C.rail, 0, 1 | 16 | 32);
        }
      }
      if (L === TOP) continue;
      // back panel of the bookcase wall
      m.quad(wp(f, A1, h1, fy), wp(f, A1, -h1, fy), wp(f, A1, -h1, ceil), wp(f, A1, h1, ceil), f.inward, C.back, 0, true);
      // corner pilaster at the vertex between wall k and k+1
      const vf = wallFrame(th + Math.PI / 6);
      const va = A1 / Math.cos(Math.PI / 6) - 0.55;
      m.box(wp(vf, va, 0, (fy + ceil) / 2), vf.t, UP, vf.inward, 1.1, ceil - fy, 1.1, C.stone, 0.25, 1 | 16 | 32);
      // shelves, uprights, books
      const span = (A1 - 0.4) * T30 * 2 - 1.3;
      const secs = 4;
      const secW = span / secs;
      for (let q = 0; q <= secs; q++) {
        const u = -span / 2 + q * secW;
        m.box(wp(f, A1 - 0.42, u, (fy + ceil) / 2), f.t, UP, f.inward, 0.12, ceil - fy, 0.84, C.stone, 0.1, 1 | 16 | 32);
      }
      for (let j = 0; j < 5; j++) {
        const by = fy + SHELF0 + j * SHELF_GAP;
        m.box(wp(f, A1 - 0.42, 0, by), f.t, UP, f.inward, span, 0.06, 0.84, C.stone, 0.05, 1 | 4 | 8);
        const res = reserved.get(`${L}|${k}|${j}`) ?? [];
        for (let q = 0; q < secs; q++) {
          const ua = -span / 2 + q * secW + 0.08;
          const ub = ua + secW - 0.16;
          let u = ua + r() * 0.12;
          // a short horizontal stack now and then
          if (r() < 0.12) {
            const sh = 2 + Math.floor(r() * 3);
            const w = 0.55 + r() * 0.2;
            for (let z = 0; z < sh; z++) {
              const t = 0.07 + r() * 0.05;
              const cls = pickCls(r);
              m.box(wp(f, A1 - 0.42, u + w / 2 + (r() - 0.5) * 0.06, by + 0.03 + t / 2 + z * t * 1.02), f.t, UP, f.inward, w, t, 0.6, cls, r(), 1 | 4 | 32 | 16, true);
            }
            u += w + 0.06;
          }
          while (u < ub - 0.12) {
            const w = 0.13 + r() * r() * 0.22;
            if (u + w > ub) break;
            const hit = res.find((s) => u + w > s.u - s.w / 2 - 0.02 && u < s.u + s.w / 2 + 0.02);
            if (hit) {
              u = hit.u + hit.w / 2 + 0.03;
              continue;
            }
            const hgt = 0.6 + r() * 0.3;
            const d = 0.5 + r() * 0.2;
            const set = r() * 0.07;
            const cls = pickCls(r);
            m.box(wp(f, A1 - 0.84 + d / 2 + set, u + w / 2, by + 0.03 + hgt / 2), f.t, UP, f.inward, w, hgt, d, cls, r(), 1 | 4 | 16 | 32, true);
            u += w + (r() < 0.06 ? 0.15 + r() * 0.2 : 0.004);
          }
          // a leaning book closes some runs
          if (r() < 0.35 && ub - u > 0.3) {
            const lean = 0.32 + r() * 0.2;
            const hgt = 0.7 + r() * 0.15;
            const w = 0.12 + r() * 0.06;
            const ay: V3 = [f.t[0] * Math.sin(lean), Math.cos(lean), f.t[2] * Math.sin(lean)];
            const ax: V3 = [f.t[0] * Math.cos(lean), -Math.sin(lean), f.t[2] * Math.cos(lean)];
            const base = wp(f, A1 - 0.5, u + w / 2 + (hgt / 2) * Math.sin(lean), by + 0.03 + (hgt / 2) * Math.cos(lean) + (w / 2) * Math.sin(lean));
            m.box(base, ax, ay, f.inward, w, hgt, 0.6, pickCls(r), r(), 1 | 4 | 16 | 32, true);
          }
        }
      }
      // pendant lamp over the gallery, mid-wall
      const lp = wp(f, (A0 + A1) / 2, 0, fy + 3.9);
      m.box(add(lp, [0, (ceil - fy - 3.9) / 2 + 0.2, 0]), f.t, UP, f.inward, 0.03, ceil - fy - 3.9, 0.03, C.rail, 0, 1 | 16 | 32);
      lampShade(m, lp, 0.18, 0.55, 0.45);
    }
  }

  // featured + title books, in spec order (the renderer draws/hides them by index)
  const emit = (into: Mesh, s: Slot, cls: number, vr: number) => {
    const f = wallFrame((s.wall * Math.PI) / 3);
    const by = -s.level * H + SHELF0 + s.shelf * SHELF_GAP;
    into.box(wp(f, A1 - 0.88 + s.d / 2, s.u, by + 0.03 + s.h / 2), f.t, UP, f.inward, s.w, s.h, s.d, cls, vr, 1 | 4 | 16 | 32, true);
  };
  spec.feature.forEach((s, i) => emit(feat, s, C.feature, i / 8 + 0.07));
  emit(title, spec.title, C.title, 0.5);

  // helical stair in the void; phase keeps y(angle) = STAIR_Y0 - 12·turns
  const yStart = STAIR_Y0 + 12 * Math.ceil((-TOP * H + H - STAIR_Y0) / 12);
  for (let sIdx = 0; ; sIdx++) {
    const a = (sIdx / 40) * Math.PI * 2;
    const y = yStart - sIdx * 0.3;
    if (y < -BOT * H + 0.2) break;
    const n: V3 = [Math.cos(a), 0, Math.sin(a)];
    const t: V3 = [-Math.sin(a), 0, Math.cos(a)];
    m.box(add(mul(n, 5.0), [0, y, 0]), n, UP, t, 2.2, 0.1, 0.82, C.wood, 0.3, 63);
    m.box(add(mul(n, 3.86), [0, y - 0.22, 0]), t, UP, mul(n, -1) as V3, 0.84, 0.4, 0.08, C.rail, 0, 1 | 2 | 8);
    if (sIdx % 2 === 0) m.box(add(mul(n, 3.9), [0, y + 0.55, 0]), t, UP, mul(n, -1) as V3, 0.04, 1.0, 0.04, C.rail, 0, 1 | 16 | 32);
    m.box(add(mul(n, 3.9), [0, y + 1.06, 0]), t, [0, Math.cos(0.36), 0], mul(n, -1) as V3, 0.84, 0.06, 0.07, C.rail, 0, 1 | 4);
  }

  // the reading desk at the bottom of the well
  const fy = -BOT * H;
  const dx: V3 = [1, 0, 0];
  const dz: V3 = [0, 0, 1];
  m.box([0, fy + 0.92, 0], dx, UP, dz, 5.6, 0.1, 3.3, C.wood, 0.2, 63);
  for (const [lx, lz] of [
    [-2.6, -1.45],
    [2.6, -1.45],
    [-2.6, 1.45],
    [2.6, 1.45],
  ])
    m.box([lx, fy + 0.45, lz], dx, UP, dz, 0.12, 0.9, 0.12, C.wood, 0.4, 1 | 2 | 16 | 32);
  // desk lamp: base, arm, shade
  m.box([2.25, fy + 1.0, -1.15], dx, UP, dz, 0.4, 0.06, 0.4, C.black, 0.1, 63);
  m.box([2.25, fy + 1.55, -1.15], dx, UP, dz, 0.05, 1.1, 0.05, C.rail, 0, 63);
  lampShade(m, [2.0, fy + 2.05, -1.0], 0.12, 0.42, 0.36);
  // a stack of books and an open folio on the desk
  for (let z = 0; z < 4; z++) m.box([-2.05 + z * 0.03, fy + 1.03 + z * 0.13, -0.9], [Math.cos(z * 0.3), 0, Math.sin(z * 0.3)], UP, [-Math.sin(z * 0.3), 0, Math.cos(z * 0.3)], 0.95, 0.12, 0.7, [C.teal, C.orange, C.black, C.paper][z], 0.5, 63);
  // floor rug under the desk
  m.quad([-4.2, fy + 0.01, 2.9], [4.2, fy + 0.01, 2.9], [4.2, fy + 0.01, -2.9], [-4.2, fy + 0.01, -2.9], UP, C.back, 0.6, false);
  return { m, feat, title };
}

function pickCls(r: () => number) {
  const x = r();
  return x < 0.3 ? C.teal : x < 0.43 ? C.orange : x < 0.58 ? C.black : C.paper;
}

/** 8-sided lamp shade (frustum) with a glowing underside disc */
function lampShade(m: Mesh, c: V3, rt: number, rb: number, h: number) {
  const N = 10;
  for (let s = 0; s < N; s++) {
    const a0 = (s / N) * Math.PI * 2;
    const a1 = ((s + 1) / N) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const P = (a: number, rr: number, y: number): V3 => [c[0] + Math.cos(a) * rr, c[1] + y, c[2] + Math.sin(a) * rr];
    const slope = (rb - rt) / h;
    const n: V3 = [Math.cos(am), slope, Math.sin(am)];
    const l = Math.hypot(n[0], n[1], n[2]);
    m.quad(P(a1, rb, 0), P(a0, rb, 0), P(a0, rt, h), P(a1, rt, h), [n[0] / l, n[1] / l, n[2] / l], C.orange, 0.2, false);
    m.quad(P(a0, rb * 0.96, 0.02), P(a1, rb * 0.96, 0.02), [c[0], c[1] + 0.1, c[2]], [c[0], c[1] + 0.1, c[2]], [0, -1, 0], C.lamp, 0, false);
  }
}

// ---- GL -------------------------------------------------------------------------------------------

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aAttr;
uniform mat4 uVP;
uniform mat4 uV;
out vec3 vW;
out vec3 vN;
out vec4 vA;
out float vZ;
void main(){
  vW = aPos; vN = aNrm; vA = aAttr;
  vec4 v = uV * vec4(aPos, 1.0);
  vZ = -v.z;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec4 vA; in float vZ;
uniform mat4 uV;
uniform vec3 uCam;
uniform float uH;
layout(location=0) out vec4 o0;
layout(location=1) out vec4 o1;
const float PI = 3.14159265;
float lampAt(vec3 P, vec3 n, vec3 L, float k){
  vec3 d = L - P; float dd = dot(d,d); float dist = sqrt(dd);
  float lam = max(0.0, dot(n, d/dist))*0.7 + 0.3;
  return k * lam / (1.0 + dd*0.16);
}
void main(){
  vec3 n = normalize(vN);
  float cls = vA.x; float vr = vA.y; vec2 uv = vA.zw;
  float L = 0.46 + 0.26*n.y + 0.14*max(0.0, dot(n, normalize(vec3(-0.5, 0.35, 0.55)))) + (vr-0.5)*0.12;
  // nearest pendant lamps: level by height, sector by angle
  float lamp = 0.0;
  float li = floor((3.9 - vW.y)/uH + 0.5);
  float ang = atan(vW.z, vW.x);
  float sk = floor(ang/(PI/3.0) + 0.5);
  float s2 = sk + (ang/(PI/3.0) > sk ? 1.0 : -1.0);
  for (int a=-1; a<=1; a++){
    float ly = -(li+float(a))*uH + 3.9;
    for (int b=0; b<2; b++){
      float ka = (b==0 ? sk : s2) * PI/3.0;
      vec3 lp = vec3(cos(ka)*9.0, ly - 0.2, sin(ka)*9.0);
      lamp += lampAt(vW, n, lp, 1.0);
    }
  }
  // desk lamp at the bottom of the well
  lamp += lampAt(vW, n, vec3(2.0, -6.0*uH + 1.8, -1.0), 2.2);
  L += lamp*0.75;
  float warm = smoothstep(0.45, 1.4, lamp);
  // the shaft darkens with depth below the eye; the upper galleries bleach toward the paper
  float below = uCam.y - vW.y;
  L *= mix(1.0, 0.42, smoothstep(4.0, 40.0, below));
  L = mix(L, 1.15, smoothstep(14.0, 44.0, -below));
  warm *= 1.0 - smoothstep(10.0, 50.0, abs(below)) * 0.5;
  float lines = 0.0;
  if (uv.x >= 0.0) {
    vec2 fw = fwidth(uv);
    if (cls < 4.5 || cls > 8.5 && cls < 10.5) {
      // book spine: keyline at both long edges, two head/tail bands
      float e = min(uv.x, 1.0 - uv.x) / max(fw.x, 1e-4);
      lines = 1.0 - smoothstep(0.6, 1.4, e);
      float b1 = abs(uv.y - 0.86) / max(fw.y, 1e-4);
      float b2 = abs(uv.y - 0.14) / max(fw.y, 1e-4);
      float band = (1.0 - smoothstep(0.5, 1.3, b1)) + (1.0 - smoothstep(0.5, 1.3, b2));
      lines = max(lines, band * step(0.5, fract(vr*7.0)));
    } else if (cls > 7.5 && cls < 8.5) {
      // back panel: vertical boards
      float bx = abs(fract(uv.x*28.0) - 0.5) / max(fw.x*28.0, 1e-4);
      lines = (1.0 - smoothstep(0.4, 1.2, bx)) * 0.6;
    }
  }
  if (cls > 5.5 && cls < 6.5) {
    // hexagonal floor tiles (Borges) in world xz
    vec2 p = vW.xz / 1.3;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r*0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 g = dot(a,a) < dot(b,b) ? a : b;
    vec2 q = abs(g);
    float dEdge = 0.5 - max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
    float w = fwidth(dEdge);
    lines = 1.0 - smoothstep(w*0.6, w*1.6, dEdge);
  }
  if (cls > 4.5 && cls < 5.5) { L = 1.0; warm = 1.0; }
  vec3 vn = normalize(mat3(uV) * n);
  float d = clamp(vZ / 160.0, 0.0, 0.99998);
  float dh = floor(d * 255.0) / 255.0;
  float dl = (d - dh) * 255.0;
  o0 = vec4(clamp(L, 0.0, 1.0), warm, cls/15.0, lines);
  o1 = vec4(vn.xy*0.5+0.5, dh, dl);
}`;

const QVS = `#version 300 es
layout(location=0) in vec2 aP;
out vec2 vUv;
void main(){ vUv = aP*0.5+0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;

const QFS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D tA;
uniform sampler2D tB;
uniform vec2 uRes;
uniform float uDpr;
uniform float uSeed;
out vec4 o;
const vec3 PAPER = vec3(0.953, 0.933, 0.890);
const vec3 TEAL = vec3(0.043, 0.541, 0.549);
const vec3 ORANGE = vec3(1.0, 0.365, 0.122);
const vec3 BLACK = vec3(0.110, 0.102, 0.098);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float depthAt(vec2 uv){ vec4 b = texture(tB, uv); return (b.z + b.w/255.0) * 160.0; }
vec3 nrmAt(vec2 uv){ vec2 xy = texture(tB, uv).xy*2.0-1.0; return vec3(xy, sqrt(max(0.0, 1.0-dot(xy,xy)))); }
float screen(vec2 px, float ang, float cell, float dens){
  float c = cos(ang), s = sin(ang);
  vec2 q = mat2(c, -s, s, c) * px / cell;
  vec2 f = fract(q) - 0.5;
  float d = length(f);
  float r = sqrt(clamp(dens, 0.0, 1.0)) * 0.74;
  float aa = 0.7 / cell;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}
void inks(vec4 a, out float teal, out float orange, out float black){
  float L = a.x, warm = a.y, cls = floor(a.z*15.0 + 0.5);
  float t = 1.0 - L;
  teal = smoothstep(0.18, 0.95, t) * 0.9;
  orange = 0.0;
  black = smoothstep(0.72, 1.0, t) * 0.55;
  if (cls == 1.0) { teal = 0.42 + t*0.55; }
  else if (cls == 2.0) { orange = 0.58 + t*0.2; teal = smoothstep(0.35, 1.0, t)*0.7; }
  else if (cls == 3.0) { black = 0.48 + t*0.4; teal *= 0.4; }
  else if (cls == 4.0) { teal = smoothstep(0.25, 1.0, t)*0.75; }
  else if (cls == 5.0) { orange = 1.0; teal = 0.0; black = 0.0; }
  else if (cls == 7.0) { orange = 0.28; teal = 0.1 + t*0.6; }
  else if (cls == 8.0) { teal = 0.62 + t*0.3; black = 0.1 + smoothstep(0.5, 1.0, t)*0.45; }
  else if (cls == 9.0) { orange = 0.95; black = smoothstep(0.6, 1.0, t)*0.3; teal = 0.0; }
  else if (cls == 10.0) { black = 0.9 * (1.0 - a.w); orange = a.w; teal = 0.0; }
  else if (cls == 11.0) { black = 0.35 + t*0.4; teal *= 0.5; }
  if (cls != 5.0) { orange = max(orange, warm*0.6); teal *= 1.0 - warm*0.45; }
}
void main(){
  vec2 px = vUv * uRes;
  vec2 e = 1.0 / uRes;
  vec4 a = texture(tA, vUv);
  float dC = depthAt(vUv);
  bool sky = dC < 0.001;
  // misregistered samples for the two colour plates
  vec4 aT = texture(tA, vUv + vec2(1.4, -0.9)*uDpr*e);
  vec4 aO = texture(tA, vUv + vec2(-1.1, 1.2)*uDpr*e);
  float tT, oT, bT, tO, oO, bO, tK, oK, bK;
  inks(aT, tT, oT, bT);
  inks(aO, tO, oO, bO);
  inks(a, tK, oK, bK);
  // keyline: depth + normal discontinuities, slightly wobbled
  float w = 0.95 * uDpr;
  vec2 jit = (vec2(hash(floor(px/7.0)), hash(floor(px/7.0)+3.1)) - 0.5) * 0.6 * uDpr;
  float edge = 0.0;
  vec3 nC = nrmAt(vUv);
  for (int i=0; i<4; i++){
    vec2 o2 = (i==0 ? vec2(w,0.0) : i==1 ? vec2(-w,0.0) : i==2 ? vec2(0.0,w) : vec2(0.0,-w)) + jit;
    vec2 u2 = vUv + o2*e;
    float dN = depthAt(u2);
    edge = max(edge, smoothstep(0.012, 0.03, abs(dN - dC) / max(dC, 0.5)));
    edge = max(edge, smoothstep(0.22, 0.45, 1.0 - dot(nrmAt(u2), nC)));
  }
  float fog = smoothstep(60.0, 150.0, dC);
  if (sky) fog = 1.0;
  edge *= 1.0 - fog;
  float lines = a.w * (1.0 - smoothstep(30.0, 90.0, dC));
  if (floor(a.z*15.0 + 0.5) == 10.0) lines = 0.0;
  float cell = 5.2 * uDpr;
  float grain = hash(floor(px / max(1.0, uDpr)) + uSeed);
  // ink starvation: a coarse mottle thins the screens unevenly
  float mott = 0.86 + 0.14 * hash(floor(px / (38.0*uDpr)));
  float teal = screen(px, 0.2618, cell, tT * (1.0 - fog) * mott);
  float orange = screen(px, 1.309, cell, oO * (1.0 - fog) * mott);
  float black = screen(px, 0.7854, cell * 0.8, bK * (1.0 - fog));
  black = max(black, max(edge, lines));
  vec3 col = PAPER * (0.965 + 0.05 * grain);
  col *= mix(vec3(1.0), TEAL, teal * 0.92);
  col *= mix(vec3(1.0), ORANGE, orange * 0.95);
  col *= mix(vec3(1.0), BLACK, black * 0.94);
  // print margin vignette
  vec2 q = vUv - 0.5;
  col *= 1.0 - smoothstep(0.42, 0.75, length(q * vec2(uRes.x/uRes.y, 1.0) * 0.8)) * 0.08;
  o = vec4(col, 1.0);
}`;

/** Starts compiling + linking without querying status, so a driver with parallel compile can work off-thread. */
function startProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  const sh: WebGLShader[] = [];
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(p, s);
    sh.push(s);
  }
  gl.linkProgram(p);
  return { p, sh };
}

function checkProgram(gl: WebGL2RenderingContext, prog: { p: WebGLProgram; sh: WebGLShader[] }) {
  if (gl.getProgramParameter(prog.p, gl.LINK_STATUS)) return prog.p;
  throw new Error(prog.sh.map((s) => gl.getShaderInfoLog(s)).join(" | ") + (gl.getProgramInfoLog(prog.p) ?? ""));
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Creates the library over a few frames: shaders compile in parallel while the mesh is built. */
export async function createLibrary(canvas: HTMLCanvasElement, spec: LibSpec) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("no webgl2");
  const ext = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
  const geo = startProgram(gl, VS, FS);
  const out = startProgram(gl, QVS, QFS);
  await nextFrame();
  const meshes = build(spec);
  if (ext) {
    const t0 = performance.now();
    while (!(gl.getProgramParameter(geo.p, ext.COMPLETION_STATUS_KHR) && gl.getProgramParameter(out.p, ext.COMPLETION_STATUS_KHR)) && performance.now() - t0 < 4000) await nextFrame();
  }
  await nextFrame();
  return new Library(canvas, gl, checkProgram(gl, geo), checkProgram(gl, out), meshes, spec.feature.length);
}

type Buf = { vao: WebGLVertexArrayObject; n: number };

/** Camera basis from heading (yaw), pitch and roll, in degrees. */
export function camBasis(c: LibCam) {
  const D = Math.PI / 180;
  const ph = c.yaw * D;
  const ps = c.pitch * D;
  const ro = c.roll * D;
  const f0: V3 = [Math.cos(ph), 0, Math.sin(ph)];
  const r0: V3 = [-Math.sin(ph), 0, Math.cos(ph)];
  const u0: V3 = [0, 1, 0];
  const f1: V3 = add(mul(f0, Math.cos(ps)), mul(u0, Math.sin(ps)));
  const u1: V3 = add(mul(u0, Math.cos(ps)), mul(f0, -Math.sin(ps)));
  const r2: V3 = add(mul(r0, Math.cos(ro)), mul(u1, Math.sin(ro)));
  const u2: V3 = add(mul(u1, Math.cos(ro)), mul(r0, -Math.sin(ro)));
  const pos: V3 = [Math.cos(c.ca * D) * c.cr, c.cy, Math.sin(c.ca * D) * c.cr];
  return { f: f1, r: r2, u: u2, pos };
}

export class Library {
  private gl: WebGL2RenderingContext;
  private geo: Buf;
  private feat: Buf;
  private title: Buf;
  private quad: WebGLVertexArrayObject;
  private pGeo: WebGLProgram;
  private pOut: WebGLProgram;
  private fb: WebGLFramebuffer | null = null;
  private texA: WebGLTexture | null = null;
  private texB: WebGLTexture | null = null;
  private rb: WebGLRenderbuffer | null = null;
  private w = 0;
  private h = 0;
  dpr = 1;
  private V = new Float32Array(16);
  private VP = new Float32Array(16);
  private u: Record<string, WebGLUniformLocation | null> = {};
  private uo: Record<string, WebGLUniformLocation | null> = {};
  private featIdx: Int32Array;
  hide = new Set<number>();
  titleOn = false;
  lost = false;

  constructor(
    private canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    pGeo: WebGLProgram,
    pOut: WebGLProgram,
    meshes: ReturnType<typeof build>,
    nFeature: number
  ) {
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });
    const { m, feat, title } = meshes;
    this.geo = this.upload(m);
    this.feat = this.upload(feat);
    this.title = this.upload(title);
    // each featured book is 4 quads = 24 indices
    this.featIdx = new Int32Array(nFeature).map((_, i) => i * 24);
    this.pGeo = pGeo;
    this.pOut = pOut;
    for (const k of ["uVP", "uV", "uCam", "uH"]) this.u[k] = gl.getUniformLocation(this.pGeo, k);
    for (const k of ["tA", "tB", "uRes", "uDpr", "uSeed"]) this.uo[k] = gl.getUniformLocation(this.pOut, k);
    const qb = gl.createBuffer();
    this.quad = gl.createVertexArray()!;
    gl.bindVertexArray(this.quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Rebuilds the static mesh for new slot sizes (viewport aspect changed). */
  setSpec(spec: LibSpec) {
    const gl = this.gl;
    for (const b of [this.geo, this.feat, this.title]) gl.deleteVertexArray(b.vao);
    const { m, feat, title } = build(spec);
    this.geo = this.upload(m);
    this.feat = this.upload(feat);
    this.title = this.upload(title);
  }

  private upload(m: Mesh): Buf {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, m.v.subarray(0, m.nv * 10), gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i.subarray(0, m.ni), gl.STATIC_DRAW);
    const st = 40;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 24);
    gl.bindVertexArray(null);
    return { vao, n: m.ni };
  }

  resize(cssW: number, cssH: number, dpr: number) {
    const gl = this.gl;
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(2, Math.round(cssH * dpr));
    this.dpr = dpr;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.fb) {
      gl.deleteFramebuffer(this.fb);
      gl.deleteTexture(this.texA);
      gl.deleteTexture(this.texB);
      gl.deleteRenderbuffer(this.rb);
    }
    const tex = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.texA = tex();
    this.texB = tex();
    this.rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texA, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.texB, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.rb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Writes view and view-projection matrices for the camera (column-major). */
  private matrices(c: LibCam, aspect: number) {
    const { f, r, u, pos } = camBasis(c);
    const V = this.V;
    V[0] = r[0];
    V[4] = r[1];
    V[8] = r[2];
    V[1] = u[0];
    V[5] = u[1];
    V[9] = u[2];
    V[2] = -f[0];
    V[6] = -f[1];
    V[10] = -f[2];
    V[3] = V[7] = V[11] = 0;
    V[12] = -(r[0] * pos[0] + r[1] * pos[1] + r[2] * pos[2]);
    V[13] = -(u[0] * pos[0] + u[1] * pos[1] + u[2] * pos[2]);
    V[14] = f[0] * pos[0] + f[1] * pos[1] + f[2] * pos[2];
    V[15] = 1;
    const near = 0.12;
    const far = 260;
    const t = 1 / Math.tan((c.fov * Math.PI) / 360);
    const P = new Float32Array(16);
    P[0] = t / aspect;
    P[5] = t;
    P[10] = (far + near) / (near - far);
    P[11] = -1;
    P[14] = (2 * far * near) / (near - far);
    // VP = P * V
    const VP = this.VP;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += P[k * 4 + j] * V[i * 4 + k];
        VP[i * 4 + j] = s;
      }
    return pos;
  }

  render(c: LibCam, cssW: number, cssH: number, seed = 0) {
    if (this.lost) return;
    const gl = this.gl;
    const pos = this.matrices(c, cssW / cssH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 1, [0.5, 0.5, 0, 0]);
    gl.clearBufferfv(gl.DEPTH, 0, [1]);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.pGeo);
    gl.uniformMatrix4fv(this.u.uVP, false, this.VP);
    gl.uniformMatrix4fv(this.u.uV, false, this.V);
    gl.uniform3f(this.u.uCam, pos[0], pos[1], pos[2]);
    gl.uniform1f(this.u.uH, H);
    gl.bindVertexArray(this.geo.vao);
    gl.drawElements(gl.TRIANGLES, this.geo.n, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(this.feat.vao);
    for (let i = 0; i < this.featIdx.length; i++) if (!this.hide.has(i)) gl.drawElements(gl.TRIANGLES, 24, gl.UNSIGNED_INT, this.featIdx[i] * 4);
    if (this.titleOn) {
      gl.bindVertexArray(this.title.vao);
      gl.drawElements(gl.TRIANGLES, this.title.n, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.pOut);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.uniform1i(this.uo.tA, 0);
    gl.uniform1i(this.uo.tB, 1);
    gl.uniform2f(this.uo.uRes, this.w, this.h);
    gl.uniform1f(this.uo.uDpr, this.dpr);
    gl.uniform1f(this.uo.uSeed, seed);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Screen rect (CSS px) of a slot's spine face for the camera; ok=false when behind the camera. */
  spineRect(s: Slot, c: LibCam, cssW: number, cssH: number): Rect {
    this.matrices(c, cssW / cssH);
    const f = wallFrame((s.wall * Math.PI) / 3);
    const fy = -s.level * H;
    const by = fy + SHELF0 + s.shelf * SHELF_GAP + 0.03;
    const a = A1 - 0.84 - 0.04;
    const pts: V3[] = [wp(f, a, s.u - s.w / 2, by), wp(f, a, s.u + s.w / 2, by), wp(f, a, s.u + s.w / 2, by + s.h), wp(f, a, s.u - s.w / 2, by + s.h)];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let ok = true;
    const M = this.VP;
    for (const p of pts) {
      const cx = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12];
      const cyy = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13];
      const cw = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
      if (cw <= 0.01) ok = false;
      const sx = ((cx / cw) * 0.5 + 0.5) * cssW;
      const sy = (1 - ((cyy / cw) * 0.5 + 0.5)) * cssH;
      x0 = Math.min(x0, sx);
      x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy);
      y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, ok };
  }

  destroy() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/** Camera pose that faces wall `wall` of `level` from across the void, `back` units from the axis. */
export const facing = (level: number, wall: number, back = 2.2, eye = EYE): LibCam => ({
  cy: -level * H + eye,
  ca: wall * 60 + 180,
  cr: back,
  yaw: wall * 60,
  pitch: -2,
  roll: 0,
  fov: 50,
});

/** Camera pose standing on the gallery, `dist` units in front of wall `wall`. */
export const atShelf = (level: number, wall: number, u: number, dist: number, eye: number): LibCam => {
  const th = (wall * Math.PI) / 3;
  const a = A1 - 0.84 - dist;
  // position on the wall frame, expressed in the polar (ca, cr) the camera uses
  const x = Math.cos(th) * a + Math.sin(th) * u;
  const z = Math.sin(th) * a - Math.cos(th) * u;
  return { cy: -level * H + eye, ca: (Math.atan2(z, x) * 180) / Math.PI, cr: Math.hypot(x, z), yaw: wall * 60, pitch: -3, roll: 0, fov: 50 };
};
