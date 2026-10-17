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
