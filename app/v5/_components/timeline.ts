// Story timeline: camera keyframes, sculpture poses and act parameters as pure functions of the story position u.

export type V3 = [number, number, number];

export const PAPER = "#eceae4";
export const BLACK = "#080808";
export const ACID = "#e2ff1f";
export const RED = "#ff2a00";

// World anchors: Act I sits around the origin, Act II far below (the camera reaches it through the helix core).
export const O2: V3 = [0, -50, 0];
export const E: V3 = [O2[0] + 11.2, O2[1], O2[2]]; // shatter centre on the blade wall
export const O3: V3 = [E[0], E[1] + 0.4, E[2] - 1.2]; // ring centre
const at = (o: V3, x: number, y: number, z: number): V3 => [o[0] + x, o[1] + y, o[2] + z];

export type Key = {
  u: number;
  p: V3; // camera position
  t: V3; // look-at target
  up?: V3;
  roll?: number; // tilt around the view axis (radians)
  spin?: number; // barrel roll added after orientation blending (radians, may exceed π)
  fogN: number;
  fogF: number;
};

const DOWN: V3 = [0, 0, -1];

export const KEYS: Key[] = [
  { u: 0, p: [0.4, -0.5, 10.6], t: [0.4, 0.05, 0], fogN: 9, fogF: 19 },
  { u: 0.55, p: [-1.6, 1.4, 10.2], t: [1.0, 0, 0], roll: -0.035, fogN: 9, fogF: 20 },
  { u: 1, p: [-2.8, 0.7, 9.6], t: [1.3, 0, 0], roll: -0.05, fogN: 9, fogF: 20 },
  { u: 1.65, p: [-1.4, 1.2, 11.2], t: [0.6, -0.4, 0], roll: -0.02, fogN: 9, fogF: 21 },
  { u: 2.0, p: [0, 1.6, 12.4], t: [0, -0.6, 0], fogN: 9, fogF: 22 },
  { u: 2.18, p: [0, 8.8, 6.4], t: [0, -1.6, 0], fogN: 7, fogF: 22 },
  { u: 2.33, p: [0, 7.6, 0.5], t: [0, -8, 0], up: DOWN, fogN: 5, fogF: 26 },
  { u: 2.43, p: [0, 3.2, 0], t: [0, -20, 0], up: DOWN, spin: 0, fogN: 3, fogF: 24 },
  { u: 2.69, p: [0, -24, 0], t: [0, -60, 0], up: DOWN, spin: 4.4, fogN: 4, fogF: 50 },
  { u: 2.77, p: [0.6, -33, 15.5], t: [0, -29, 0], spin: Math.PI * 2, fogN: 9, fogF: 40 },
  { u: 2.87, p: at(O2, -3, 5.2, 17.5), t: at(O2, 0, -0.6, 0), roll: 0.1, spin: Math.PI * 2, fogN: 10, fogF: 36 },
  { u: 3.0, p: at(O2, -7, 1.5, 9.6), t: at(O2, -2.4, -0.2, 0), spin: Math.PI * 2, fogN: 7, fogF: 25 },
  // Capabilities: the wall drops to the lower right, behind the red detail slab, clear of the index.
  { u: 3.22, p: at(O2, -9.5, 4.6, 10.5), t: at(O2, -8.2, 2.9, 0), roll: -0.03, spin: Math.PI * 2, fogN: 7, fogF: 22 },
  { u: 3.82, p: at(O2, -6.5, 4.4, 10.5), t: at(O2, -5.2, 2.8, 0), roll: -0.02, spin: Math.PI * 2, fogN: 7, fogF: 22 },
  { u: 4.0, p: at(O2, -3.2, 0.7, 8.6), t: at(O2, 1, -0.3, 0), roll: 0.02, spin: Math.PI * 2, fogN: 7, fogF: 24 },
  { u: 5.0, p: at(O2, 7.8, 1.0, 8.6), t: at(O2, 12, -0.3, 0), roll: -0.02, spin: Math.PI * 2, fogN: 7, fogF: 24 },
  { u: 5.15, p: at(O2, 8.4, 1.4, 9.8), t: at(E, 0.3, 0, 0), spin: Math.PI * 2, fogN: 8, fogF: 26 },
  { u: 5.5, p: at(O3, -3, 3.6, 17), t: O3, roll: 0.14, spin: Math.PI * 2, fogN: 12, fogF: 34 },
  { u: 6.0, p: at(O3, -7.6, 0.4, 11.2), t: at(O3, -3.5, -0.6, 0), roll: 0, spin: Math.PI * 2, fogN: 9, fogF: 26 },
  { u: 7.0, p: at(O3, -1.0, -2.4, 13.4), t: at(O3, -3.6, -1.9, 0), roll: -0.06, spin: Math.PI * 2, fogN: 9, fogF: 28 },
];

export type Pose = {
  R: number; // helix radius
  T: number; // turns
  H: number; // spine height
  tw: number; // slat twist across the spine
  L: number; // slat length
  off: number; // slat offset from spine, fraction of L
  w: number; // slat width scale
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
  s: number;
};

const P_HERO: Pose = { R: 3.0, T: 0.7, H: 7, tw: 0.5, L: 2.8, off: 0.1, w: 1, x: -1.0, y: 0, z: 0, rx: 0.85, rz: -0.3, s: 1 };
const P_ABOUT: Pose = { R: 1.15, T: 1.7, H: 10, tw: 4.2, L: 1.9, off: 0.22, w: 1, x: 4.4, y: 0, z: -1, rx: 0.15, rz: 0.3, s: 0.92 };
const P_DRIFT: Pose = { R: 1.4, T: 2.0, H: 9.5, tw: 2.6, L: 1.7, off: 0.05, w: 1.1, x: 2.2, y: -0.6, z: -0.6, rx: 0.1, rz: 0.14, s: 1 };
const P_GATE: Pose = { R: 1.75, T: 2.6, H: 9, tw: 0.5, L: 1.5, off: -0.25, w: 1.4, x: 0, y: -1, z: 0, rx: 0, rz: 0, s: 1 };
const P_TUNNEL: Pose = { R: 2.4, T: 13, H: 46, tw: 0, L: 1.35, off: -0.5, w: 2.2, x: 0, y: -21, z: 0, rx: 0, rz: 0, s: 1 };
// The tunnel blooms open around the camera so it can back out between the fins.
const P_OPEN: Pose = { R: 6.8, T: 11, H: 44, tw: 0.3, L: 1.9, off: -0.5, w: 1.9, x: 0, y: -22, z: 0, rx: 0, rz: 0, s: 1 };
// The tunnel lies down along X at the Act II anchor before unrolling into the blade wall.
const P_TUBE: Pose = { R: 1.8, T: 10, H: 44, tw: 0, L: 1.3, off: -0.5, w: 1.7, x: O2[0], y: O2[1] + 0.2, z: O2[2], rx: 0.18, rz: -Math.PI / 2, s: 1 };

export const POSE_KEYS: { u: number; p: Pose }[] = [
  { u: 0, p: P_HERO },
  { u: 1, p: P_ABOUT },
  { u: 1.7, p: P_DRIFT },
  { u: 2.0, p: P_GATE },
  { u: 2.36, p: P_TUNNEL },
  { u: 2.63, p: P_TUNNEL },
  { u: 2.73, p: P_OPEN },
  { u: 2.77, p: P_OPEN },
  { u: 2.87, p: P_TUBE },
];
export const POSE_FIELDS = Object.keys(P_HERO) as (keyof Pose)[];

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
export const ramp = (u: number, a: number, b: number) => smooth((u - a) / (b - a));
export const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const cubicOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

// Act-level parameters (uniform targets) at story position u.
export function actParams(u: number) {
  const flood1 = ramp(u, 2.46, 2.64);
  const flood2 = ramp(u, 5.2, 5.52);
  const edge = ramp(u, 2.5, 2.72) * (1 - ramp(u, 5.32, 5.62)) + 0.9 * ramp(u, 4.96, 5.12) * (1 - ramp(u, 5.18, 5.36));
  return {
    flood1,
    flood2,
    edge,
    acid: ramp(u, 5.3, 5.62),
    peel: clamp01((u - 2.86) / 0.15), // tunnel → wall (staggered per slat)
    tremble: ramp(u, 4.98, 5.13) * (1 - ramp(u, 5.15, 5.3)),
    scatter: cubicOut((u - 5.12) / 0.3) * (1 - ramp(u, 5.58, 6.0)),
    form: clamp01((u - 5.42) / 0.58), // wall → ring (staggered per slat)
  };
}

export function actOf(u: number) {
  return u < 2.6 ? 1 : u < 5.48 ? 2 : 3;
}

// ───────────── Craft chapter ─────────────
// Story position s (scroll): 0 hero · 1 about · 2→5 craft (k = s − 2: A alive · B motion · C louder) ·
// 5→6 core transit · 6 capabilities · 7→8 work · 8→9 shatter · 9→10 contact.
// Everything outside the craft runs on the legacy position u = legacyU(s); the craft scenes run on k.
export const CRAFT_S0 = 2;
export const CRAFT_LEN = 3;
export const STORY_END = 10;
export const CRAFT_IN = 1.65; // legacy u the craft leaves from
export const CRAFT_OUT = 2.0; // legacy u the craft hands back to (core transit start)

export function legacyU(s: number) {
  if (s <= 1) return s;
  if (s <= CRAFT_S0) return 1 + (CRAFT_IN - 1) * (s - 1);
  if (s < CRAFT_S0 + CRAFT_LEN) return CRAFT_IN + (CRAFT_OUT - CRAFT_IN) * clamp01((s - CRAFT_S0 - 2.8) / 0.2);
  return s - CRAFT_LEN;
}

// Slide windows on k (settled text holds inside [in, out]).
export const SLIDES = [
  { id: "alive", k0: 0, in: 0.3, out: 0.97, k1: 1 },
  { id: "motion", k0: 1, in: 1.6, out: 1.97, k1: 2 },
  { id: "louder", k0: 2, in: 2.5, out: 2.78, k1: 3 },
] as const;

// Form morphs on k: legacy helix → A field → B ring → C horn → legacy helix.
export const MORPH = { inA: [0.02, 0.3], AB: [0.99, 1.24], BC: [1.99, 2.2], out: [2.76, 3.0] } as const;

// Background scenes: 0 paper (legacy) · 1 white field · 2 black ring · 3 red horn · 4 paper (legacy); floods between them.
export const CRAFT_FLOODS: [number, number, number][] = [
  [0.1, 0.28, 1],
  [1.04, 1.2, 2],
  [2.02, 2.17, 3],
  [2.8, 2.95, 4],
];
export function craftFlood(k: number) {
  let i = -1;
  for (let j = 0; j < CRAFT_FLOODS.length; j++) if (k >= CRAFT_FLOODS[j][0]) i = j;
  if (i < 0) return { from: 0, to: 1, p: 0, i: 0 };
  const [a, b, to] = CRAFT_FLOODS[i];
  return { from: to - 1, to, p: ramp(k, a, b), i };
}

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// A: the flip field lies flat for the top-down view, then hinges up into a standing facade.
export const facadeRise = (k: number) => smooth((k - 0.5) / 0.3);

// Ring breath 0 (exhale) → 1 (inhale) on a ~4 s cycle, shared by the B ring and its type.
export const breath01 = (now: number) => 0.5 - 0.5 * Math.cos((now / 4000) * Math.PI * 2);

// Camera roll along a key list at u, eased like the camera orientation blend.
export function rollAt(keys: Key[], u: number) {
  let k = 0;
  while (k < keys.length - 2 && u >= keys[k + 1].u) k++;
  const a = keys[k];
  const b = keys[k + 1];
  const t = clamp01((u - a.u) / (b.u - a.u));
  const te = 0.5 * (t + smooth(t));
  return (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * te;
}

export type Craft = ReturnType<typeof buildCraft>;

// Scene anchors, form sizes and the craft camera path (k keys). First and last keys equal the legacy keys at
// CRAFT_IN / CRAFT_OUT so the hand-over is seamless.
export function buildCraft(narrow: boolean) {
  const cols = narrow ? 32 : 44;
  const rows = narrow ? 20 : 22;
  const pitchX = narrow ? 0.5 : 0.56;
  const pitchZ = 0.46;
  const W = cols * pitchX;
  const D = rows * pitchZ;
  const CA: V3 = [0, -5, -3];
  const H = narrow ? 22 : 25;

  // The field hinges up on its front edge into a facade (see facadeRise); the grazing camera sits near its foot.
  const frontZ = CA[2] + D / 2;
  const gP = add(CA, narrow ? [-9, 0.7, D / 2 + 9] : [-14, 0.6, D / 2 + 9.5]);
  const gT = add(CA, narrow ? [1.5, 3.4, D / 2 + 0.5] : [3, 3.2, D / 2 + 0.5]);
  const aB = norm([gT[0] - gP[0], 0, gT[2] - gP[2]]); // ring axis: horizontal, along the grazing view
  const upW: V3 = [0, 1, 0];
  const rB = norm(cross(aB, upW));
  const CB: V3 = add(add(gP, aB, 8), upW, -0.2);
  const ringR = narrow ? 3.6 : 4.2;

  const aC: V3 = [-rB[0], -rB[1], -rB[2]]; // horn axis (throat → mouth) points back across the ring
  const CC: V3 = add(add(CB, aB, 2), rB, 18);
  const rC = norm(cross([-aC[0], -aC[1], -aC[2]], upW)); // screen-right when looking down the horn
  const hornL = 9;

  // C settle: the bell sits upper right, clear of the type block, seen three-quarter so it reads as a horn.
  const hornT = narrow ? add(add(add(CC, aC, 8), rC, -2.5), upW, -3) : add(add(add(CC, aC, 8), rC, -10.5), upW, -3.7);
  const hornCam = (drift: number) =>
    narrow
      ? add(add(add(CC, aC, 27 + 1.5 * drift), rC, -6 - 0.5 * drift), upW, 2.2 + 0.3 * drift)
      : add(add(add(CC, aC, 34 + 1.6 * drift), rC, -14 - 0.6 * drift), upW, 3.8 + 0.3 * drift);
  const keys: Key[] = [
    { u: 0, p: [-1.4, 1.2, 11.2], t: [0.6, -0.4, 0], roll: -0.02, fogN: 9, fogF: 21 },
    { u: 0.14, p: [-3.2, 7.5, 10.5], t: add(CA, [0, 0, 1]), roll: -0.04, fogN: 10, fogF: 34 },
    { u: 0.3, p: add(CA, [0, H, -1.4]), t: add(CA, [0, 0, -2.8]), up: [0, 0, -1], fogN: H - 4, fogF: H + 18 },
    { u: 0.5, p: add(CA, [0.4, H * 0.95, -1.4]), t: add(CA, [0.4, 0, -2.75]), up: [0, 0, -1], roll: 0.025, fogN: H - 4, fogF: H + 18 },
    { u: 0.68, p: add(CA, [-8, 7.5, D / 2 + 13]), t: add(CA, [0.5, 1.5, D / 2 - 1]), roll: 0.12, fogN: 12, fogF: 42 },
    { u: 0.86, p: gP, t: gT, roll: -0.02, fogN: 8, fogF: 38 },
    { u: 0.99, p: add(gP, aB, 1.2), t: add(gT, aB, 1.2), roll: -0.04, fogN: 8, fogF: 38 },
    // B: into the ring, along its axis, then out and rolled to the side.
    { u: 1.14, p: add(CB, aB, -4.2), t: add(CB, aB, 8), roll: 0, fogN: 6, fogF: 30 },
    { u: 1.26, p: add(CB, aB, -0.9), t: add(CB, aB, 10), roll: 0.25, fogN: 3, fogF: 22 },
    { u: 1.34, p: add(CB, aB, -0.4), t: add(CB, aB, 10), roll: 0.55, fogN: 3, fogF: 22 },
    { u: 1.5, p: add(CB, aB, -9), t: CB, roll: 1.1, fogN: 6, fogF: 26 },
    { u: 1.64, p: add(add(add(CB, aB, -12.5), rB, 5.5), upW, 1.4), t: add(CB, rB, 0.8), roll: Math.PI / 2, fogN: 9, fogF: 26 },
    { u: 1.99, p: add(add(add(CB, aB, -11.5), rB, 5.2), upW, 1.2), t: add(CB, rB, 0.8), roll: Math.PI / 2 + 0.06, fogN: 9, fogF: 26 },
    // C: whip-pan into the horn's throat, then blown backwards out of the bell.
    { u: 2.1, p: lerp3(add(CB, aB, -6), add(CC, aC, 6), 0.5), t: add(CC, aB, 2), roll: 0.4, fogN: 6, fogF: 30 },
    { u: 2.22, p: add(CC, aC, 2.1), t: add(CC, aC, -4), roll: 0.1, fogN: 3, fogF: 24 },
    { u: 2.3, p: add(CC, aC, 1.8), t: add(CC, aC, -4), roll: 0, fogN: 3, fogF: 24 },
    { u: 2.44, p: add(CC, aC, 9), t: CC, roll: -0.12, fogN: 6, fogF: 34 },
    { u: 2.54, p: hornCam(0), t: hornT, roll: -0.05, fogN: 22, fogF: 76 },
    { u: 2.78, p: hornCam(1), t: hornT, roll: -0.03, fogN: 22, fogF: 76 },
    { u: 3.0, p: [0, 1.6, 12.4], t: [0, -0.6, 0], fogN: 9, fogF: 22 },
  ];
  return { cols, rows, pitchX, pitchZ, W, D, CA, frontZ, CB, aB, rB, ringR, CC, aC, rC, hornL, keys };
}
