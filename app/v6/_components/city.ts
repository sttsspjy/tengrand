// The city of Act I, mirrored from the shader: a grid of residential towers (one per CS cell) with
// procedural sizes. Used by JS for picking (pointer -> window) and to place the lantern's window.

export const CS = 24; // cell size (m)
export const FH = 3; // floor height (m)
export const BW = 2.9; // nominal window bay width (m)
export const HMAX = 152;

/** PCG hash, identical to the GLSL pcg(). */
export function pcg(v: number) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
export const hu = (v: number) => pcg(v) / 4294967296;

// Word region in cells: ALIVE in a 3x5 pixel font. Desktop: one row; mobile: two lines (ALI / VE).
export type WordRegion = { i0: number; j0: number; mode: 1 | 2 };
export const WORD_D: WordRegion = { i0: -10, j0: 6, mode: 1 };
export const WORD_M: WordRegion = { i0: 3, j0: -10, mode: 2 };

const GLYPHS = [11245, 18727, 29847, 23402, 31143]; // A L I V E, rows top->bottom, 3 bits each

/** -1 outside the word region, else 0/1 for the pixel bit. */
export function wordBit(i: number, j: number, w: WordRegion): number {
  const lx = i - w.i0;
  if (w.mode === 1) {
    const row = w.j0 + 4 - j;
    if (lx < 0 || lx > 18 || row < 0 || row > 4) return -1;
    const L = Math.floor(lx / 4),
      c = lx % 4;
    if (c === 3) return 0;
    return (GLYPHS[L] >> ((4 - row) * 3 + (2 - c))) & 1;
  }
  // two lines: ALI / VE (second line indented two cells)
  const ra = w.j0 + 10 - j;
  if (lx < 0 || lx > 10 || ra < 0 || ra > 10) return -1;
  const line = Math.floor(ra / 6),
    r = ra % 6;
  if (r === 5) return 0;
  const lx2 = lx - line * 2;
  if (lx2 < 0) return 0;
  const L = Math.floor(lx2 / 4) + line * 3,
    c = lx2 % 4;
  if (c === 3 || L > 4 || (line === 0 && L > 2)) return 0;
  return (GLYPHS[L] >> ((4 - r) * 3 + (2 - c))) & 1;
}

/** Low-rise district around the word (one cell margin plus one). */
export function wordZone(i: number, j: number, w: WordRegion) {
  const lx = i - w.i0,
    ly = j - w.j0;
  return w.mode === 1 ? lx >= -2 && lx <= 20 && ly >= -2 && ly <= 6 : lx >= -2 && lx <= 12 && ly >= -2 && ly <= 12;
}

export const inRoute = (i: number, j: number) => (i === -1 || i === 0) && j >= -3 && j <= 4;

export type Tower = { cx: number; cz: number; hx: number; hz: number; h: number; kind: number };

/** Tower in cell (i, j); h = 0 means an open plaza. Mirrors GLSL tower(). */
export function tower(i: number, j: number, w: WordRegion): Tower {
  const k = pcg((Math.imul(i + 4096, 65599) + (j + 4096)) >>> 0);
  const a = hu(k),
    b = hu((k ^ 0x9e3779b9) >>> 0),
    c = hu((k ^ 0x85ebca6b) >>> 0),
    e = hu((k ^ 0xc2b2ae35) >>> 0);
  const wb = wordBit(i, j, w);
  const route = inRoute(i, j);
  let fl = 16 + Math.floor(Math.pow(a, 1.3) * 28);
  if (route) fl = 37 + Math.floor(a * 11);
  if (wb >= 0 || wordZone(i, j, w)) fl = 8 + Math.floor(a * 3);
  let h = fl * FH + 1.5;
  let hx = 6.4 + 1.8 * b;
  const hz = 6.4 + 1.8 * c;
  let hz2 = hz;
  let ox = (e - 0.5) * 2.2,
    oz = (a - 0.5) * 2.2;
  if (route) {
    hx = 7.4 + 0.3 * b;
    hz2 = 9.6;
    ox = i === 0 ? 4 : -4;
    oz = (e - 0.5) * 1.6;
  }
  if (!route && wb < 0 && e < 0.06) h = 0;
  return { cx: (i + 0.5) * CS + ox, cz: (j + 0.5) * CS + oz, hx, hz: hz2, h, kind: wb };
}

/** Ray vs city (2D DDA over cells + per-cell box). Returns hit point or null. */
export function traceCity(o: number[], d: number[], w: WordRegion): [number, number, number] | null {
  let t = 0;
  if (o[1] > HMAX) {
    if (d[1] >= 0) return null;
    t = (o[1] - HMAX) / -d[1];
  }
  const px = o[0] + d[0] * t,
    pz = o[2] + d[2] * t;
  let ci = Math.floor(px / CS),
    cj = Math.floor(pz / CS);
  const sx = d[0] > 0 ? 1 : -1,
    sz = d[2] > 0 ? 1 : -1;
  const dx = Math.abs(d[0]) < 1e-6 ? 1e-6 : d[0],
    dz = Math.abs(d[2]) < 1e-6 ? 1e-6 : d[2];
  let tmx = ((ci + (sx > 0 ? 1 : 0)) * CS - o[0]) / dx;
  let tmz = ((cj + (sz > 0 ? 1 : 0)) * CS - o[2]) / dz;
  const tdx = CS / Math.abs(dx),
    tdz = CS / Math.abs(dz);
  for (let s = 0; s < 96; s++) {
    const T = tower(ci, cj, w);
    if (T.h > 0) {
      const mn = [T.cx - T.hx, 0, T.cz - T.hz],
        mx = [T.cx + T.hx, T.h, T.cz + T.hz];
      let tn = -Infinity,
        tf = Infinity;
      for (let k = 0; k < 3; k++) {
        const dd = Math.abs(d[k]) < 1e-9 ? 1e-9 : d[k];
        const t1 = (mn[k] - o[k]) / dd,
          t2 = (mx[k] - o[k]) / dd;
        tn = Math.max(tn, Math.min(t1, t2));
        tf = Math.min(tf, Math.max(t1, t2));
      }
      if (tn <= tf && tf > 0 && tn > 0) return [o[0] + d[0] * tn, o[1] + d[1] * tn, o[2] + d[2] * tn];
    }
    const tex = Math.min(tmx, tmz);
    if (d[1] < 0) {
      const tg = -o[1] / d[1];
      if (tg < tex) return [o[0] + d[0] * tg, 0, o[2] + d[2] * tg];
    } else if (o[1] + d[1] * tex > HMAX) return null;
    if (tmx < tmz) {
      tmx += tdx;
      ci += sx;
    } else {
      tmz += tdz;
      cj += sz;
    }
  }
  return null;
}

/** Centre of the window the lantern starts in: tower (0, 0), west face, fourth floor. */
export function lanternWindow(w: WordRegion): [number, number, number] {
  const T = tower(0, 0, w);
  const L = T.hz;
  const nb = Math.max(1, Math.floor((2 * L) / BW));
  const bw = (2 * L) / nb;
  const want = 18.5;
  const bi = Math.max(0, Math.min(nb - 1, Math.floor((want - (T.cz - L)) / bw)));
  const z = T.cz - L + (bi + 0.5) * bw;
  return [T.cx - T.hx, 4 * FH + FH * 0.58, z];
}
