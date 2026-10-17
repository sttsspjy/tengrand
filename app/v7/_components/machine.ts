import { capabilities } from "@/content/profile";

// Act II: a wireframe "machine room" drawn on one Canvas 2D with a hand-written 3D camera.
// World units: y is up, the pipeline runs along +x (one unit every U). Geometry is rebuilt each frame
// (explode amounts change), projected with perspective, near-clipped, fog-bucketed and stroked in
// a few batched paths. DOM labels are positioned at projected anchor points by the owner.

export type V3 = [number, number, number];
export type Cam = { tx: number; ty: number; tz: number; yaw: number; pitch: number; dist: number; ex: number; ux: number; sx: number; sy: number };

export const U = 1250;
const NEAR = 30;

type Style = { rgb: string; a: number; w: number; dash?: number[] };
const WHITE = "236,243,255";
const RED = "255,104,64";
const STYLES: Style[] = [
  { rgb: WHITE, a: 0.13, w: 0.6 }, // 0 grid
  { rgb: WHITE, a: 0.95, w: 1.15 }, // 1 main
  { rgb: WHITE, a: 0.55, w: 0.75 }, // 2 secondary
  { rgb: WHITE, a: 0.38, w: 0.6, dash: [3, 5] }, // 3 construction
  { rgb: RED, a: 1, w: 1.6 }, // 4 hit
  { rgb: RED, a: 0.55, w: 1 }, // 5 hit faint
  { rgb: WHITE, a: 1, w: 2.2 }, // 6 pulse
  { rgb: WHITE, a: 0.28, w: 0.6 }, // 7 grid major
];
const FOG = [1, 0.66, 0.4, 0.18];

type Txt = { x: number; y: number; z: number; text: string; size: number; a: number; align: CanvasTextAlign };

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export type Anchor = { unit: number; k: number; x: number; y: number; vis: boolean };

export class Machine {
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private F = 1;
  private cx = 0;
  private cy = 0;
  private eye: V3 = [0, 0, 0];
  private r: V3 = [1, 0, 0];
  private u: V3 = [0, 1, 0];
  private f: V3 = [0, 0, -1];
  private buckets: number[][][] = STYLES.map(() => FOG.map(() => []));
  private texts: Txt[] = [];
  private fogStart = 2000;
  private fogLen = 4000;
  /** projected label anchors for the current frame */
  anchors: Anchor[] = [];
  /** item hits: key `${gi}:${k}` */
  hits = new Set<string>();
  hitUnits = new Set<number>();
  hover: string | null = null;
  flash = new Float32Array(6);
  pulse: { t0: number; to: number } | null = null;
  private font = "monospace";
  private plan = false;
  /** suppress unit captions (mobile intro title sits over them) */
  quiet = false;

  constructor(private canvas: HTMLCanvasElement, font: string) {
    this.ctx = canvas.getContext("2d")!;
    this.font = font;
  }

  resize(w: number, h: number, dprCap: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.F = Math.min(w * 1.25, h * 1.37);
  }

  // ---- camera ------------------------------------------------------------------------

  private setCam(c: Cam) {
    const cp = Math.cos(c.pitch);
    this.eye = [c.tx + c.dist * cp * Math.sin(c.yaw), c.ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * cp * Math.cos(c.yaw)];
    const fx = c.tx - this.eye[0];
    const fy = c.ty - this.eye[1];
    const fz = c.tz - this.eye[2];
    const fl = Math.hypot(fx, fy, fz);
    this.f = [fx / fl, fy / fl, fz / fl];
    const rl = Math.hypot(this.f[2], this.f[0]) || 1;
    this.r = [-this.f[2] / rl, 0, this.f[0] / rl];
    const [r0, r1, r2] = this.r;
    const [f0, f1, f2] = this.f;
    this.u = [r1 * f2 - r2 * f1, r2 * f0 - r0 * f2, r0 * f1 - r1 * f0];
    this.cx = this.w * c.sx;
    this.cy = this.h * c.sy;
    this.fogStart = c.dist * 0.9;
    this.fogLen = c.dist * 2.2 + 1500;
  }

  /** camera-space coordinates */
  private cam(p: V3): V3 {
    const vx = p[0] - this.eye[0];
    const vy = p[1] - this.eye[1];
    const vz = p[2] - this.eye[2];
    return [vx * this.r[0] + vy * this.r[1] + vz * this.r[2], vx * this.u[0] + vy * this.u[1] + vz * this.u[2], vx * this.f[0] + vy * this.f[1] + vz * this.f[2]];
  }

  project(p: V3) {
    const c = this.cam(p);
    if (c[2] < NEAR) return null;
    return { x: this.cx + (c[0] * this.F) / c[2], y: this.cy - (c[1] * this.F) / c[2], z: c[2] };
  }

  // ---- geometry buffer ---------------------------------------------------------------

  private line(a: V3, b: V3, st: number) {
    let ca = this.cam(a);
    let cb = this.cam(b);
    if (ca[2] < NEAR && cb[2] < NEAR) return;
    if (ca[2] < NEAR || cb[2] < NEAR) {
      const t = (NEAR - ca[2]) / (cb[2] - ca[2]);
      const m: V3 = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, NEAR];
      if (ca[2] < NEAR) ca = m;
      else cb = m;
    }
    const zm = (ca[2] + cb[2]) / 2;
    const fog = Math.max(0, Math.min(3, Math.floor(((zm - this.fogStart) / this.fogLen) * 4)));
    const B = this.buckets[st][zm < this.fogStart ? 0 : fog];
    B.push(this.cx + (ca[0] * this.F) / ca[2], this.cy - (ca[1] * this.F) / ca[2], this.cx + (cb[0] * this.F) / cb[2], this.cy - (cb[1] * this.F) / cb[2]);
  }

  private poly(pts: V3[], st: number, close = false) {
    for (let i = 1; i < pts.length; i++) this.line(pts[i - 1], pts[i], st);
    if (close) this.line(pts[pts.length - 1], pts[0], st);
  }

  private box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number) {
    this.rectY(x0, z0, x1, z1, y0, st);
    this.rectY(x0, z0, x1, z1, y1, st);
    for (const [x, z] of [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ])
      this.line([x, y0, z], [x, y1, z], st);
  }

  private rectY(x0: number, z0: number, x1: number, z1: number, y: number, st: number) {
    this.poly(
      [
        [x0, y, z0],
        [x1, y, z0],
        [x1, y, z1],
        [x0, y, z1],
      ],
      st,
      true
    );
  }

  private circleY(x: number, y: number, z: number, r: number, st: number, n = 28) {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
    }
    this.poly(pts, st);
  }

  /** World-anchored label; `dy` is a screen-space line offset in px. */
  private text(p: V3, text: string, size: number, a: number, align: CanvasTextAlign = "left", dy = 0) {
    const q = this.project(p);
    if (!q) return;
    const fog = q.z < this.fogStart ? 1 : Math.max(0, 1 - (q.z - this.fogStart) / this.fogLen);
    if (fog < 0.05) return;
    this.texts.push({ x: q.x, y: q.y + dy, z: q.z, text, size, a: a * fog, align });
  }

  // ---- world -------------------------------------------------------------------------

  private grid() {
    const x0 = -2.2 * U;
    const x1 = 7.4 * U;
    const z0 = -2600;
    const z1 = 2600;
    const step = 250;
    const seg = 500;
    for (let z = z0; z <= z1; z += step) {
      const st = z % 1000 === 0 ? 7 : 0;
      for (let x = x0; x < x1; x += seg) this.line([x, -2, z], [Math.min(x + seg, x1), -2, z], st);
    }
    for (let x = x0; x <= x1; x += step) {
      const st = Math.round(x) % 1000 === 0 ? 7 : 0;
      for (let z = z0; z < z1; z += seg) this.line([x, -2, z], [x, -2, Math.min(z + seg, z1)], st);
    }
  }

  private docs() {
    const x = -0.8 * U;
    for (let k = 0; k < 7; k++) {
      const a = (k - 3) * 0.05;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const y = 6 + k * 9;
      const pts: V3[] = [
        [-130, y, -170],
        [130, y, -170],
        [130, y, 170],
        [-130, y, 170],
      ].map(([px, py, pz]) => [x + px * ca - pz * sa, py, pz * ca + px * sa] as V3);
      this.poly(pts, k === 6 ? 1 : 2, true);
      if (k === 6)
        for (let l = 0; l < 9; l++) {
          const zz = -130 + l * 30;
          const len = l % 3 === 2 ? 120 : 200;
          this.line([x - 100, y, zz], [x - 100 + len, y, zz], 3);
        }
    }
    this.pipe(x + 140, -360);
  }

  /** Conduit between two x positions along the floor, with flanges. */
  private pipe(xa: number, xb: number) {
    if (xb <= xa) return;
    const y = 18;
    this.line([xa, y, -14], [xb, y, -14], 2);
    this.line([xa, y, 14], [xb, y, 14], 2);
    for (let x = xa + 60; x < xb - 30; x += 150) {
      this.poly(
        [
          [x, y - 18, -20],
          [x, y + 18, -20],
          [x, y + 18, 20],
          [x, y - 18, 20],
        ],
        3,
        true
      );
    }
  }

  private unit(i: number, e: number) {
    const g = capabilities[i];
    const X = i * U;
    const hitU = this.hitUnits.has(i);
    const fl = this.flash[i];
    const main = hitU || fl > 0.5 ? 4 : 1;
    // plinth
    this.box(X - 360, 0, -240, X + 360, 32, 240, main);
    // ping rings on the floor when the query pulse passes a matched unit
    if (fl > 0) {
      const r = 420 + (1 - fl) * 1100;
      this.circleY(X, 1, 0, r, fl > 0.5 ? 4 : 5, 48);
      this.circleY(X, 1, 0, r * 0.72, 5, 40);
    }
    this.line([X - 360, 16, 240], [X + 360, 16, 240], 3);
    if (this.plan) {
      // top-down plan: short captions, alternately above and below the line so neighbours never touch
      const short = g.title.split(/[\s&]+/)[0].toUpperCase();
      this.text([X - 350, 0, i % 2 ? -300 : 300], `0${i + 1} · ${short}`, 11, 0.85, "left", i % 2 ? -6 : 6);
    } else if (!this.quiet) {
      this.text([X - 350, 0, 300], `0${i + 1} · ${g.title.toUpperCase()}`, 11, 0.85);
    }
    // footprint dimension
    this.line([X - 360, 0, 270], [X + 360, 0, 270], 3);
    this.line([X - 360, 0, 255], [X - 360, 0, 285], 2);
    this.line([X + 360, 0, 255], [X + 360, 0, 285], 2);

    // item plates, exploded upward
    const n = g.items.length;
    const gap = 30 + 118 * e;
    let top = 32;
    for (let k = 0; k < n; k++) {
      const y = 70 + k * gap;
      top = y;
      const w = 300 - k * 9;
      const d = 200 - k * 6;
      const dx = Math.sin(k * 1.3 + i) * 26 * e;
      const key = `${i}:${k}`;
      const isHit = this.hits.has(key);
      const isHover = this.hover === key;
      const st = isHit || isHover ? 4 : 1;
      this.rectY(X - w + dx, -d, X + w + dx, d, y, st);
      this.pattern(g.items[k], X + dx, y, w, d, isHit || isHover ? 5 : 2);
      // assembly guides between plates
      if (e > 0.05 && k > 0) {
        this.line([X - w + dx, y, -d], [X - w + 9 + Math.sin((k - 1) * 1.3 + i) * 26 * e, y - gap, -d - 6], 3);
        this.line([X + w + dx, y, d], [X + w + 9 + Math.sin((k - 1) * 1.3 + i) * 26 * e, y - gap, d + 6], 3);
      }
      // leader stub from the plate's right edge
      const ax = X + w + dx;
      const lead: V3 = [ax + 70, y, -d];
      this.line([ax, y, -d], lead, isHit || isHover ? 4 : 2);
      const q = this.project(lead);
      if (q) this.anchors.push({ unit: i, k, x: q.x, y: q.y, vis: true });
    }
    // vertical dimension along the stack
    if (e > 0.05) {
      const xd = X - 420;
      this.line([xd, 32, 240], [xd, top, 240], 3);
      this.line([xd - 14, 32, 240], [xd + 14, 32, 240], 2);
      this.line([xd - 14, top, 240], [xd + 14, top, 240], 2);
    }
    this.hero(i, X, top + 60 + 70 * e, hitU || fl > 0.5);
    // conduit to the next unit
    if (i < 5) this.pipe(X + 360, X + U - 360);
    else this.ship(X + 360);
  }

  /** Seeded plate pattern: a different drawing for every item. */
  private pattern(name: string, X: number, y: number, w: number, d: number, st: number) {
    const h = hash(name);
    const kind = h % 4;
    if (kind === 0) {
      const cols = 3 + (h % 4);
      for (let c = 1; c < cols; c++) {
        const x = X - w + (2 * w * c) / cols;
        this.line([x, y, -d + 20], [x, y, d - 20], st);
      }
    } else if (kind === 1) {
      const r = Math.min(w, d) * 0.6;
      this.circleY(X, y, 0, r, st, 32);
      this.circleY(X, y, 0, r * 0.55, st, 24);
      this.line([X - r, y, 0], [X + r, y, 0], st);
    } else if (kind === 2) {
      const rows = 3 + ((h >> 3) % 4);
      for (let r = 1; r < rows; r++) {
        const z = -d + (2 * d * r) / rows;
        this.line([X - w + 24, y, z], [X - w + 24 + (2 * w - 48) * (0.4 + ((h >> (r + 2)) % 6) / 10), y, z], st);
      }
    } else {
      this.line([X - w + 20, y, -d + 20], [X + w - 20, y, d - 20], st);
      this.line([X - w + 20, y, d - 20], [X + w - 20, y, -d + 20], st);
      this.rectY(X - w * 0.3, -d * 0.3, X + w * 0.3, d * 0.3, y, st);
    }
  }

  /** The signature object that crowns each unit. */
  private hero(i: number, X: number, y0: number, hit: boolean) {
    const st = hit ? 4 : 1;
    const s2 = hit ? 5 : 2;
    if (i === 0) {
      // index lattice: a 4×3×3 graph, with a few cross-links
      const P = (a: number, b: number, c: number): V3 => [X - 150 + a * 100, y0 + b * 80, -100 + c * 100];
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 3; b++)
          for (let c = 0; c < 3; c++) {
            if (a < 3) this.line(P(a, b, c), P(a + 1, b, c), s2);
            if (b < 2) this.line(P(a, b, c), P(a, b + 1, c), s2);
            if (c < 2) this.line(P(a, b, c), P(a, b, c + 1), s2);
            const p = P(a, b, c);
            this.line([p[0] - 6, p[1], p[2]], [p[0] + 6, p[1], p[2]], st);
            this.line([p[0], p[1] - 6, p[2]], [p[0], p[1] + 6, p[2]], st);
          }
      this.line(P(0, 0, 0), P(3, 2, 2), st);
      this.line(P(0, 2, 2), P(3, 0, 1), st);
      this.line(P(1, 1, 0), P(2, 2, 2), st);
    } else if (i === 1) {
      // chip with pins and a die grid
      this.box(X - 140, y0, -140, X + 140, y0 + 36, 140, st);
      for (let k = -5; k <= 5; k++) {
        const t = k * 24;
        this.line([X + t, y0 + 18, -140], [X + t, y0 + 18, -176], s2);
        this.line([X + t, y0 + 18, 140], [X + t, y0 + 18, 176], s2);
        this.line([X - 140, y0 + 18, t], [X - 176, y0 + 18, t], s2);
        this.line([X + 140, y0 + 18, t], [X + 176, y0 + 18, t], s2);
      }
      for (let k = 0; k <= 4; k++) {
        const t = -80 + k * 40;
        this.line([X + t, y0 + 36, -80], [X + t, y0 + 36, 80], s2);
        this.line([X - 80, y0 + 36, t], [X + 80, y0 + 36, t], s2);
      }
    } else if (i === 2) {
      // the crew: three agents around an orchestrator
      const hub: V3 = [X, y0 + 120, 0];
      this.octa(hub, 34, st);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        const p: V3 = [X + Math.cos(a) * 190, y0 + 60, Math.sin(a) * 190];
        this.octa(p, 46, st);
        this.line(p, hub, s2);
        const q: V3 = [X + Math.cos(a + 2.094) * 190, y0 + 60, Math.sin(a + 2.094) * 190];
        this.line(p, q, 3);
      }
    } else if (i === 3) {
      // interface: a standing screen with a layout drawn on it
      const z = 0;
      const sw = 230;
      const sh = 280;
      const yb = y0 + 40;
      const S = (x: number, y: number): V3 => [X + x, yb + y, z];
      this.poly([S(-sw, 0), S(sw, 0), S(sw, sh), S(-sw, sh)], st, true);
      this.poly([S(-sw + 16, 16), S(sw - 16, 16), S(sw - 16, sh - 16), S(-sw + 16, sh - 16)], s2, true);
      this.line(S(-sw + 16, sh - 56), S(sw - 16, sh - 56), s2);
      this.line(S(-sw + 140, 16), S(-sw + 140, sh - 56), s2);
      for (let r = 0; r < 4; r++) this.line(S(-sw + 170, sh - 90 - r * 36), S(sw - 40 - r * 30, sh - 90 - r * 36), 3);
      this.line([X, yb, 0], [X, y0, 0], st);
      this.rectY(X - 90, -60, X + 90, 60, y0, s2);
    } else if (i === 4) {
      // three stacked data cylinders
      for (let k = 0; k < 3; k++) {
        const yb = y0 + k * 92;
        this.circleY(X, yb, 0, 150, st);
        this.circleY(X, yb + 70, 0, 150, st);
        for (let a = 0; a < 8; a++) {
          const t = (a / 8) * Math.PI * 2;
          this.line([X + Math.cos(t) * 150, yb, Math.sin(t) * 150], [X + Math.cos(t) * 150, yb + 70, Math.sin(t) * 150], a % 2 ? 3 : s2);
        }
      }
    } else {
      // stepped tower with an upload mast
      this.box(X - 170, y0, -170, X + 170, y0 + 70, 170, st);
      this.box(X - 115, y0 + 70, -115, X + 115, y0 + 150, 115, st);
      this.box(X - 60, y0 + 150, -60, X + 60, y0 + 220, 60, st);
      const tip = y0 + 420;
      this.line([X, y0 + 220, 0], [X, tip, 0], st);
      this.line([X, tip, 0], [X - 34, tip - 50, 0], st);
      this.line([X, tip, 0], [X + 34, tip - 50, 0], st);
      this.circleY(X, tip - 110, 0, 50, s2);
      this.circleY(X, tip - 150, 0, 30, 3);
    }
  }

  private octa(c: V3, r: number, st: number) {
    const [x, y, z] = c;
    const v: V3[] = [
      [x + r, y, z],
      [x - r, y, z],
      [x, y + r, z],
      [x, y - r, z],
      [x, y, z + r],
      [x, y, z - r],
    ];
    const E = [
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 2],
      [1, 3],
      [1, 4],
      [1, 5],
      [2, 4],
      [4, 3],
      [3, 5],
      [5, 2],
    ];
    for (const [a, b] of E) this.line(v[a], v[b], st);
  }

  private ship(x: number) {
    const y = 18;
    this.line([x, y, -14], [x + 520, y, -14], 2);
    this.line([x, y, 14], [x + 520, y, 14], 2);
    const ax = x + 520;
    this.poly(
      [
        [ax, y, -60],
        [ax + 140, y, 0],
        [ax, y, 60],
      ],
      1,
      true
    );
  }

  // ---- frame -------------------------------------------------------------------------

  /** Pipeline x position of the travelling query pulse, or null. */
  private pulseX(now: number) {
    if (!this.pulse) return null;
    const t = (now - this.pulse.t0) / 1000;
    const x0 = -0.8 * U + 140;
    const x = x0 + t * 2600;
    if (x > this.pulse.to + 400) return null;
    return x;
  }

  pulseBusy(now: number) {
    return !!this.pulse && now - this.pulse.t0 < ((this.pulse.to + 400 + 0.8 * U) / 2600) * 1000 + 900;
  }

  draw(c: Cam, now: number, dt: number) {
    const { ctx } = this;
    this.setCam(c);
    this.plan = c.pitch > 1.1;
    for (const b of this.buckets) for (const f of b) f.length = 0;
    this.texts.length = 0;
    this.anchors.length = 0;

    for (let i = 0; i < 6; i++) this.flash[i] = Math.max(0, this.flash[i] - dt * 0.9);
    const px = this.pulseX(now);
    if (px !== null) {
      for (let i = 0; i < 6; i++) if (Math.abs(px - i * U) < 380 && this.hitUnits.has(i)) this.flash[i] = 1;
    }

    this.grid();
    this.docs();
    for (let i = 0; i < 6; i++) {
      const e = c.ex * Math.max(0, 1 - Math.abs(c.ux - i) * 1.25);
      this.unit(i, e);
    }
    if (px !== null) {
      const y = 18;
      this.box(px - 36, y - 22, -22, px + 36, y + 22, 22, 6);
      this.line([px, y + 22, 0], [px, y + 260, 0], 4);
      this.circleY(px, y + 260, 0, 26, 4, 20);
      for (let k = 1; k < 8; k++) this.line([px - 36 - k * 80, y, 0], [px - 36 - k * 80 + 46, y, 0], k < 4 ? 4 : 5);
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineCap = "round";
    STYLES.forEach((st, si) => {
      FOG.forEach((fg, fi) => {
        const B = this.buckets[si][fi];
        if (!B.length) return;
        ctx.strokeStyle = `rgba(${st.rgb},${st.a * fg})`;
        ctx.lineWidth = st.w;
        ctx.setLineDash(st.dash ?? []);
        ctx.beginPath();
        for (let k = 0; k < B.length; k += 4) {
          ctx.moveTo(B[k], B[k + 1]);
          ctx.lineTo(B[k + 2], B[k + 3]);
        }
        ctx.stroke();
      });
    });
    ctx.setLineDash([]);
    ctx.textBaseline = "middle";
    for (const t of this.texts) {
      ctx.font = `${t.size}px ${this.font}`;
      ctx.letterSpacing = "0.08em";
      ctx.textAlign = t.align;
      ctx.fillStyle = `rgba(${WHITE},${t.a})`;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.letterSpacing = "0px";
  }
}
