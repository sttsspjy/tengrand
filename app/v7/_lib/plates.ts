// Deterministic engraved line-art per project, seeded from the project name.
// Each generator returns paths in a 680×400 viewBox. Output is identical on server and client.

export type PlatePath = { d: string; accent?: boolean; fill?: boolean; w?: number; dash?: boolean };
export type PlateArt = { paths: PlatePath[]; caption: string };

export const W = 680;
export const H = 400;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const poly = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("");

/** Smooth 2D pseudo-noise from a few seeded sine octaves. Range ≈ [-1, 1]. */
const noise2 = (r: () => number) => {
  const o = Array.from({ length: 5 }, (_, i) => ({
    fx: (0.004 + r() * 0.006) * (i + 1),
    fy: (0.004 + r() * 0.006) * (i + 1),
    p: r() * 6.28,
    q: r() * 6.28,
    a: 1 / (i + 1),
  }));
  const norm = o.reduce((s, x) => s + x.a, 0);
  return (x: number, y: number) => o.reduce((s, k) => s + k.a * Math.sin(x * k.fx + k.p + Math.sin(y * k.fy + k.q) * 1.7), 0) / norm;
};

// ---- Fig. 1: stacked waveforms with hidden-line removal -------------------
const waveforms = (name: string): PlateArt => {
  const r = rng(hash(name));
  const lines: PlatePath[] = [];
  const N = 30;
  const bursts = Array.from({ length: 3 }, (_, i) => ({ c: 170 + i * 170 + (r() - 0.5) * 80, s: 34 + r() * 40, a: 0.55 + r() * 0.45 }));
  const rows: [number, number][][] = [];
  for (let i = 0; i < N; i++) {
    const y0 = 84 + i * 9.8;
    const ph = r() * 6.28;
    const ph2 = r() * 6.28;
    const gain = 0.25 + 0.75 * Math.sin((i / (N - 1)) * Math.PI) ** 1.6;
    const local = bursts.map((b) => ({ ...b, c: b.c + (r() - 0.5) * 50, a: b.a * (0.4 + r() * 0.8) }));
    const pts: [number, number][] = [];
    for (let x = 0; x <= W; x += 4) {
      const env = local.reduce((s, b) => s + b.a * Math.exp(-((x - b.c) ** 2) / (2 * b.s * b.s)), 0);
      const wave = 0.55 + 0.3 * Math.sin(x * 0.052 + ph) + 0.15 * Math.sin(x * 0.131 + ph2);
      pts.push([x, y0 - wave * env * 70 * gain]);
    }
    rows.push(pts);
  }
  // hidden-line removal: walk front (bottom) to back, keep points above the running horizon
  const horizon = rows[0].map(() => Infinity);
  for (let i = N - 1; i >= 0; i--) {
    const segs: string[] = [];
    let seg: [number, number][] = [];
    rows[i].forEach(([x, y], k) => {
      if (y < horizon[k] - 0.6) seg.push([x, y]);
      else {
        if (seg.length > 1) segs.push(poly(seg));
        seg = [];
      }
      horizon[k] = Math.min(horizon[k], y);
    });
    if (seg.length > 1) segs.push(poly(seg));
    lines.unshift({ d: segs.join(""), w: 0.9 });
  }
  const px = Math.round(bursts[1].c + 40);
  lines.push({ d: `M${px} 40L${px} 388`, accent: true, w: 1 });
  lines.push({ d: `M${px - 5} 32L${px + 5} 32L${px} 40Z`, accent: true, w: 1 });
  return { paths: lines, caption: "Thirty stacked waveforms, hidden lines removed; the playhead in red." };
};

// ---- hatching helper: parallel lines clipped to a circle, kept where `keep` is true
const hatchCircle = (cx: number, cy: number, R: number, angle: number, gap: number, keep: (x: number, y: number, k: number) => boolean) => {
  const out: string[] = [];
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  let k = 0;
  for (let o = -R; o <= R; o += gap, k++) {
    const half = Math.sqrt(Math.max(0, R * R - o * o));
    let seg: [number, number][] = [];
    for (let t = -half; t <= half; t += 3) {
      const x = cx + nx * o + dx * t;
      const y = cy + ny * o + dy * t;
      if (keep(x, y, k)) seg.push([x, y]);
      else {
        if (seg.length > 1) out.push(poly(seg));
        seg = [];
      }
    }
    if (seg.length > 1) out.push(poly(seg));
  }
  return out;
};

// ---- Fig. 2: a single hatched sphere in an empty room ----------------------
const sphere = (name: string): PlateArt => {
  const r = rng(hash(name));
  const cx = 300 + r() * 80;
  const cy = 200;
  const R = 96;
  const L = [-0.55, -0.62, 0.56];
  const shade = (x: number, y: number) => {
    const nx = (x - cx) / R;
    const ny = (y - cy) / R;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return 1 - Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  };
  const paths: PlatePath[] = [];
  const h1 = hatchCircle(cx, cy, R - 0.5, 0, 3.6, (x, y, k) => shade(x, y) > 0.14 + (k % 4) * 0.13);
  const h2 = hatchCircle(cx, cy, R - 0.5, -Math.PI / 4, 5, (x, y) => shade(x, y) > 0.78);
  paths.push({ d: h1.join(""), w: 0.7 }, { d: h2.join(""), w: 0.6 });
  const outline: [number, number][] = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) outline.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  paths.push({ d: poly(outline), w: 0.9 });
  // floor + cast shadow
  const fy = cy + R + 14;
  paths.push({ d: `M30 ${fy}L${W - 30} ${fy}`, w: 0.6 });
  const sh: string[] = [];
  const sx = cx + 46;
  const srx = 130;
  const sry = 16;
  for (let x = sx - srx; x <= sx + srx; x += 5) {
    const t = (x - sx) / srx;
    const hh = sry * Math.sqrt(Math.max(0, 1 - t * t));
    if (hh > 1.2) sh.push(`M${f(x)} ${f(fy - hh * 0.25)}L${f(x + hh * 0.8)} ${f(fy + hh)}`);
  }
  paths.push({ d: sh.join(""), w: 0.6 });
  // the light: a small red source with three rays toward the sphere
  const lx = cx - 230;
  const ly = 58;
  const rays: string[] = [];
  for (const t of [-0.5, 0, 0.5]) {
    const tx = cx + Math.cos(-2.2 + t) * R * 1.12;
    const ty = cy + Math.sin(-2.2 + t) * R * 1.12;
    const dx = tx - lx;
    const dy = ty - ly;
    rays.push(`M${f(lx + dx * 0.12)} ${f(ly + dy * 0.12)}L${f(lx + dx * 0.62)} ${f(ly + dy * 0.62)}`);
  }
  paths.push({ d: rays.join(""), accent: true, w: 0.7 });
  paths.push({ d: `M${lx - 5} ${ly}a5 5 0 1 0 10 0a5 5 0 1 0-10 0M${lx - 10} ${ly}h-5M${lx + 10} ${ly}h5M${lx} ${ly - 10}v-5M${lx} ${ly + 10}v5`, accent: true, w: 1 });
  return { paths, caption: "One hatched sphere, one light, nothing else in the room." };
};

// ---- Fig. 3: tangled threads combed into ordered lanes --------------------
const flow = (name: string): PlateArt => {
  const r = rng(hash(name));
  const lanes = 7;
  const laneY = (i: number) => 96 + i * 34;
  const paths: PlatePath[] = [];
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < 56; i++) {
    const lane = laneY(i % lanes);
    const y0 = 90 + r() * 220;
    const w = Array.from({ length: 3 }, (_, k) => ({ f: 0.01 + r() * 0.011 * (k + 1), p: r() * 6.28, a: (40 - k * 12) * (0.4 + r()) }));
    const x0 = 34 + r() * 30;
    const ms = 180 + r() * 70;
    const pts: [number, number][] = [];
    for (let x = x0; x <= 592; x += 5) {
      const m = smooth(ms, 480, x);
      const tangle = w.reduce((s, k) => s + k.a * Math.sin(x * k.f + k.p), 0);
      const y = (y0 + tangle) * (1 - m) + lane * m;
      pts.push([x, Math.min(H - 20, Math.max(20, y))]);
    }
    paths.push({ d: poly(pts), w: 0.55 });
  }
  const ticked = Math.floor(r() * lanes);
  for (let i = 0; i < lanes; i++) {
    const y = laneY(i);
    paths.push({ d: `M604 ${y - 6}h12v12h-12Z`, w: 0.9 });
    paths.push({ d: `M626 ${y}h${f(14 + r() * 22)}`, w: 0.7 });
    if (i === ticked) paths.push({ d: `M606 ${y}l4 4l8 -11`, accent: true, w: 1.6 });
  }
  return { paths, caption: "Fifty-six tangled threads, combed into seven lanes; one task ticked in red." };
};

// ---- Fig. 4: an orthographic globe of meridians ----------------------------
const globe = (name: string): PlateArt => {
  const r = rng(hash(name));
  const cx = 300;
  const cy = 190;
  const R = 138;
  const tilt = 0.32 + r() * 0.2;
  const spin = r() * 6.28;
  const proj = (lat: number, lon: number): [number, number, number] => {
    const x = Math.cos(lat) * Math.sin(lon + spin);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(lon + spin);
    const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
    const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
    return [cx + x * R, cy - y2 * R, z2];
  };
  const front: string[] = [];
  const back: string[] = [];
  const trace = (fn: (t: number) => [number, number, number], steps: number) => {
    let seg: [number, number][] = [];
    let side = 0;
    for (let i = 0; i <= steps; i++) {
      const [x, y, z] = fn(i / steps);
      const s = z >= 0 ? 1 : -1;
      if (side && s !== side) {
        seg.push([x, y]);
        if (seg.length > 1) (side > 0 ? front : back).push(poly(seg));
        seg = [];
      }
      side = s;
      seg.push([x, y]);
    }
    if (seg.length > 1) (side > 0 ? front : back).push(poly(seg));
  };
  const hl = Math.floor(r() * 12);
  let accent = "";
  for (let m = 0; m < 12; m++) {
    const lon = (m / 12) * Math.PI;
    const before = front.length;
    trace((t) => proj(-Math.PI / 2 + t * Math.PI * 2, lon), 120);
    if (m === hl) accent = front.splice(before).join("");
  }
  for (let p = -5; p <= 5; p++) {
    const lat = (p / 6) * (Math.PI / 2);
    trace((t) => proj(lat, t * Math.PI * 2), 90);
  }
  const outline: [number, number][] = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) outline.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  const shadeSide = hatchCircle(cx, cy, R - 0.5, Math.PI / 3, 5, (x, y) => {
    const nx = (x - cx) / R;
    const ny = (y - cy) / R;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return nx * 0.7 + ny * -0.2 + nz * 0.25 < -0.12;
  });
  // strip chart of a live stream along the base
  const sc: [number, number][] = [];
  let v = 0;
  for (let x = 40; x <= W - 40; x += 6) {
    v = v * 0.82 + (r() - 0.5) * 9;
    sc.push([x, 368 + v]);
  }
  const arcs: string[] = [];
  for (let i = 0; i < 3; i++) {
    const a1 = r() * 6.28;
    const a2 = a1 + 0.8 + r() * 1.2;
    const pts: [number, number][] = [];
    for (let t = 0; t <= 1.0001; t += 0.04) {
      const a = a1 + (a2 - a1) * t;
      const lift = 1 + 0.18 * Math.sin(t * Math.PI);
      pts.push([cx + Math.cos(a) * R * lift, cy + Math.sin(a) * R * 0.42 * lift - Math.sin(t * Math.PI) * 30]);
    }
    arcs.push(poly(pts));
  }
  return {
    paths: [
      { d: back.join(""), w: 0.4, dash: true },
      { d: shadeSide.join(""), w: 0.5 },
      { d: front.join(""), w: 0.7 },
      { d: poly(outline), w: 1 },
      { d: arcs.join(""), w: 0.6, dash: true },
      { d: `M40 368L${W - 40} 368`, w: 0.4, dash: true },
      { d: poly(sc), w: 0.7 },
      { d: accent, accent: true, w: 1.2 },
    ],
    caption: "Twelve meridians and eleven parallels on a tilted globe; a stream chart below.",
  };
};

const GENERATORS: Record<string, (n: string) => PlateArt> = {
  mirae: waveforms,
  home: sphere,
  flowstate: flow,
  meridian: globe,
};

export const plateFor = (id: string, name: string): PlateArt => (GENERATORS[id] ?? waveforms)(name);
