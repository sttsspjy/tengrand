// The film's timeline. Scroll position g (svh units) -> camera poses + world parameters.
// One ascent through one night, in three coordinate frames that hand over under cover:
//   city  (g < 1015): street canyon -> rooftops -> top-down over the grid -> looking up at the lanterns
//   storm (1015..1195): under, into and through a storm cloud
//   above (g >= 1195): the cloud sea (skills), the sky dome (projects), dawn (contact)

import { chapters } from "@/content/profile";
import { director } from "./director";
import { type Pose, mkPose, copyPose, mkTrack, sample, type Track, smooth, lin, lerp, lerpAng, clamp01, mkBasis, basis } from "./camera";
import { WORD_D, WORD_M, lanternWindow, type WordRegion } from "./city";
import { CONST, dirOf } from "./constellations";
import { cloudH } from "./noise";

/* ---------- segments (g) ---------- */
export const SEG = {
  heroEnd: 100,
  CARD: 130,
  VO0: 232,
  VO_STEP: 104,
  CREST: 540,
  D0: 650,
  D1: 790,
  E0: 870,
  E1: 990,
  STORM0: 995, // city -> storm crossfade
  STORM1: 1030,
  RIG_STORM: 1015,
  F0: 1050,
  F1: 1172,
  ABOVE0: 1186, // storm -> above crossfade (inside the cloud)
  ABOVE1: 1204,
  RIG_ABOVE: 1195,
  SK_TITLE: 1212,
  SHOT0: 1290,
  SHOT_LEN: 105,
  PROJ: 1920,
  P_TITLE: 1985,
  CON0: 2050,
  CON_LEN: 150,
  DAWN0: 2650,
  SIGNAL0: 2770,
  CREDITS0: 2880,
  END: 3080,
} as const;

// Scroll positions where lightning speaks the words of the storm slide, one group per strike.
export const STRIKE_G = [1058, 1084, 1110];

export const CHAPTERS = [
  { id: "origin", n: "01", label: chapters.intro, g: 0 },
  { id: "intent", n: "02", label: chapters.about, g: 120 },
  { id: "craft", n: "03", label: chapters.craft, g: 630 },
  { id: "instruments", n: "04", label: chapters.skills, g: 1205 },
  { id: "works", n: "05", label: chapters.work, g: 1940 },
  { id: "signal", n: "06", label: chapters.contact, g: 2700 },
] as const;

// Palette / hint key per act, written to [data-act] on the root.
export const ACTS = ["city", "alive", "lanterns", "storm", "clouds", "stars", "dawn"] as const;

export function actAt(g: number) {
  return g < 625 ? 0 : g < 808 ? 1 : g < 1000 ? 2 : g < 1200 ? 3 : g < 1945 ? 4 : g < 2690 ? 5 : 6;
}

/** Coordinate frame of the rig (text planes) at g: 0 city, 1 storm, 2 above. */
export const frameAt = (g: number) => (g < SEG.RIG_STORM ? 0 : g < SEG.RIG_ABOVE ? 1 : 2);

export const word = (): WordRegion => (director.mobile ? WORD_M : WORD_D);

export const SKY_C = [1500, 950, 120]; // camera position under the sky dome (projects)

/* ---------- city track: [g, x, y, z, yaw, pitch, roll, F] ---------- */
function cityKeys(m: boolean): number[][] {
  const hD = m ? 820 : 380; // top-down altitude
  const zD = m ? -18 : 204;
  const xD = m ? 204 : -12;
  return [
    [0, 0.0, 1.7, 0, 0.0, 0.42, 0, 1.02],
    [60, 0.0, 2.6, 3, 0.03, 0.42, 0, 1.02],
    [SEG.CARD, -2.2, 8, 8, 0.4, 0.24, -0.02, 1.1],
    [SEG.VO0, -3.2, 30, 12, 0.6, 0.12, 0.03, 1.1],
    [SEG.VO0 + SEG.VO_STEP, -3.6, 56, 16, 0.84, 0.06, -0.03, 1.1],
    [SEG.VO0 + 2 * SEG.VO_STEP, -3.2, 84, 20, 0.62, 0.12, 0.02, 1.1],
    [520, -2.0, 114, 24, 0.5, 0.22, 0, 1.08],
    [565, -1.0, 172, 28, 0.9, -0.24, 0.04, 1.05],
    [605, (-2 + xD) / 2, m ? 520 : 300, (28 + zD) / 2, 3.6, -1.1, 0, 1.12],
    [SEG.D0, xD, hD, zD, Math.PI * 2, -1.5, 0, 1.25],
    [SEG.D1, xD, hD + 20, zD, Math.PI * 2 + 0.09, -1.47, 0, 1.25],
    [825, xD, hD + 55, zD, Math.PI * 2 + 0.09, 0.02, 0, 1.0],
    [SEG.E0, xD, hD + 130, zD, Math.PI * 2 + 0.09, 1.52, 0, 0.95],
    [SEG.E1, xD, hD + 290, zD, 7.6, 1.52, 0, 0.95],
    [1035, xD, hD + 390, zD, 7.75, 1.52, 0, 0.95],
  ];
}

const STORM = mkTrack([
  [SEG.STORM0, 0, -330, 0, 7.6, 1.52, 0, 0.95],
  [SEG.F0, 0, -175, 0, 7.75, 1.46, 0, 0.95],
  [1110, 0, -62, 0, 7.85, 1.4, 0, 1.0],
  [1150, 0, 8, 6, 7.9, 1.18, 0, 1.0],
  [1196, 0, 64, 22, 7.95, 0.5, 0, 1.05],
]);

// emergence above the cloud sea (above frame); last key hands over to the first shot
const EMERGE = mkTrack([
  [SEG.ABOVE0, -150, 6, -40, 1.66, 0.55, 0, 1.05],
  [SEG.SK_TITLE, -112, 16, -40, 1.62, 0.06, 0, 1.1],
  [1262, -50, 18, -38, 1.6, 0.03, 0, 1.15],
]);

// One composition per capability: (a) low skim down the cloud canyon, (b) orbit of the far anvil
// thunderhead, (c) top-down spin over the tear onto the city, (d) dutch wide into the low moon's glade,
// (e) crane down through the strata and moonbeams, (f) aerial pull-back over the curving cloud sea.
// Keys: [g, camera x y z, target x y z, roll, F, subject screen x].
const SKILLS = mkTrack([
  [1262, -50, 18, -38, 250, 17, -47, 0, 1.15, 0.5],
  [1315, 60, 13, -26, 330, 16, -16, 0, 1.0, 0.66],
  [1395, 330, 12, -15, 620, 20, -20, 0.03, 1.0, 0.66],
  [1420, 520, 46, -70, 16000, 3600, 7000, -0.03, 1.12, 0.38],
  [1500, 780, 80, 260, 16000, 3600, 7000, 0.05, 1.18, 0.34],
  [1525, 1150, 340, 520, 1156, 0, 520, 0, 1.15, 0.5],
  [1605, 1150, 265, 520, 1154, 0, 515.5, 0, 1.15, 0.5],
  [1630, 1320, 30, 300, 2269, 60, 615, 0.22, 0.9, 0.36],
  [1710, 1460, 26, 330, 2409, 56, 645, 0.16, 0.92, 0.36],
  [1735, 1740, 420, 260, 2240, 200, 260, 0, 1.1, 0.64],
  [1815, 1830, 34, 260, 2330, 40, 260, 0, 1.1, 0.64],
  [1840, 1960, 45, 270, 3200, 20, 330, 0, 1.15, 0.6],
  [SEG.PROJ, 1500, 950, 120, 3200, 0, 330, 0, 0.95, 0.6],
]);
/** Screen x of each shot's subject (plates go on the other side) and the subject's world point. */
export const SKILL_SX = [0.66, 0.36, 0.7, 0.36, 0.64, 0.6];
export const SKILL_SUBJ = [
  [330, 15, -20],
  [16000, 3600, 7000],
  [1150, -40, 450],
  [2269, 60, 615],
  [2240, 150, 260],
  [3200, 0, 330],
];
const tmpS = new Array<number>(10).fill(0);
function skillPose(g: number, out: Pose) {
  sample(SKILLS, g, tmpS);
  const m = director.mobile;
  out.x = tmpS[0];
  out.y = tmpS[1];
  out.z = tmpS[2];
  const dx = tmpS[3] - out.x,
    dy = tmpS[4] - out.y,
    dz = tmpS[5] - out.z;
  out.roll = tmpS[6] * (m ? 0.6 : 1);
  out.F = tmpS[7] * (m ? 0.85 : 1);
  const sx = m ? 0.5 : tmpS[8];
  out.yaw = Math.atan2(dx, dz) - Math.atan(((sx - 0.5) * director.aspect) / out.F);
  out.pitch = Math.atan2(dy, Math.hypot(dx, dz)) + (m ? -0.06 : 0);
  return out;
}

let cityTrack: Track | null = null;
let cityKey = "";
function ensureCity() {
  const k = director.mobile ? "m" : "d";
  if (!cityTrack || k !== cityKey) {
    cityKey = k;
    cityTrack = mkTrack(cityKeys(director.mobile));
  }
  return cityTrack;
}

const tmp = new Array<number>(8).fill(0);
function fromTrack(t: Track, g: number, out: Pose) {
  sample(t, g, tmp);
  out.x = tmp[0];
  out.y = tmp[1];
  out.z = tmp[2];
  out.yaw = tmp[3];
  out.pitch = tmp[4];
  out.roll = tmp[5];
  out.F = tmp[6] * (director.mobile ? 0.86 : 1);
  return out;
}

function cityPose(g: number, out: Pose) {
  fromTrack(ensureCity(), g, out);
  if (director.mobile && g < 560) {
    // narrow screen: look a little more up the street, keep the lantern in frame
    out.yaw *= 0.8;
  }
  return out;
}

const stormPose = (g: number, out: Pose) => fromTrack(STORM, g, out);

function blendPose(a: Pose, b: Pose, t: number, hop: number, out: Pose) {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t) + Math.sin(Math.PI * t) * hop;
  out.z = lerp(a.z, b.z, t);
  out.yaw = lerpAng(a.yaw, b.yaw, t);
  out.pitch = lerp(a.pitch, b.pitch, t);
  out.roll = lerp(a.roll, b.roll, t);
  out.F = lerp(a.F, b.F, t);
  return out;
}

/** Framing of constellation k (camera fixed under the dome). */
function conPose(k: number, u: number, out: Pose) {
  const C = CONST[k];
  const m = director.mobile;
  out.x = SKY_C[0];
  out.y = SKY_C[1];
  out.z = SKY_C[2];
  out.F = m ? 0.82 : 1.0;
  const sx = m ? 0.5 : 0.36;
  const sy = m ? 0.33 : 0.5;
  out.yaw = C.az - Math.atan(((sx - 0.5) * director.aspect) / out.F) + (u - 0.5) * 0.06;
  out.pitch = C.el - Math.atan((0.5 - sy) / out.F) - 0.03 + (u - 0.5) * 0.03;
  out.roll = (u - 0.5) * 0.02;
  return out;
}

const pa = mkPose(),
  pb = mkPose();

const DAWN = mkTrack([
  [2730, 1580, 760, 120, Math.PI / 2 - 0.26, 0.16, 0, 1.08],
  [SEG.SIGNAL0 + 60, 1760, 330, 120, Math.PI / 2 - 0.14, 0.12, 0, 1.12],
  [SEG.END, 1960, 130, 120, Math.PI / 2 - 0.08, 0.1, 0, 1.15],
]);

function abovePose(g: number, out: Pose) {
  if (g < 1262) return fromTrack(EMERGE, g, out);
  if (g < SEG.PROJ) return skillPose(g, out);
  if (g < SEG.CON0 + 40) {
    // crane up from the last skill shot, tilting into the sky
    skillPose(SEG.PROJ, pa);
    conPose(0, 0, pb);
    const t = smooth(SEG.PROJ, SEG.CON0 + 40, g);
    blendPose(pa, pb, t, 30, out);
    out.pitch = lerp(pa.pitch, pb.pitch, smooth(0.15, 1, t));
    out.roll = Math.sin(Math.PI * t) * -0.12;
    return out;
  }
  if (g < SEG.DAWN0) {
    const k = Math.min(CONST.length - 1, Math.floor((g - SEG.CON0) / SEG.CON_LEN));
    const local = g - SEG.CON0 - k * SEG.CON_LEN;
    const SW = 44;
    if (k > 0 && local < SW) {
      conPose(k - 1, 1, pa);
      conPose(k, 0, pb);
      const t = smooth(0, SW, local);
      blendPose(pa, pb, t, 0, out);
      out.yaw = lerp(pa.yaw, pb.yaw, t); // always swing forward around the dome
      out.pitch = lerp(pa.pitch, pb.pitch, t) - Math.sin(Math.PI * t) * 0.22;
      out.roll = Math.sin(Math.PI * t) * 0.2;
      out.F = lerp(pa.F, pb.F, t) - Math.sin(Math.PI * t) * 0.12;
      return out;
    }
    return conPose(k, clamp01((local - (k > 0 ? SW : 40)) / (SEG.CON_LEN - SW)), out);
  }
  // dawn: swing back east and sink toward the cloud sea
  conPose(CONST.length - 1, 1, pa);
  fromTrack(DAWN, g, pb);
  if (g < 2730) {
    const t = smooth(SEG.DAWN0, 2730, g);
    blendPose(pa, pb, t, 0, out);
    out.yaw = lerp(pa.yaw, pb.yaw, t);
    out.roll = Math.sin(Math.PI * t) * -0.22;
    return out;
  }
  return copyPose(pb, out), out;
}

/** Keeps a camera above the cloud tops (above frame). */
function clearClouds(p: Pose) {
  const h = cloudH(p.x, p.z, director.time + 20, 3);
  if (p.y < h + 7) p.y = h + 7;
}

/** Base camera (no visitor look) of the frame that owns position g. */
export function poseAt(g: number, out: Pose) {
  const f = frameAt(g);
  if (f === 0) return cityPose(g, out);
  if (f === 1) return stormPose(g, out);
  abovePose(g, out);
  if (g > SEG.SK_TITLE) clearClouds(out);
  return out;
}

/* ---------- live (visitor-driven) state ---------- */
export const live = {
  lookYaw: 0,
  lookPitch: 0,
  lookVy: 0,
  lookVp: 0,
  dragging: false,
  trail: new Float32Array(32), // x, z, t0, amp (world, city)
  trailIdx: 0,
  flash: 0, // lightning
  boltX: 0,
  boltZ: 0,
  boltSeed: 0,
  shake: 0,
  hold: 0, // press-and-hold (lanterns breathe in)
  holding: false,
  hoverCon: -1,
  nextStrike: 0,
  prevG: 0,
};

/** Lights windows around a world point (city frame). */
export function addTrail(x: number, z: number, amp: number) {
  const i = live.trailIdx % 8;
  live.trail.set([x, z, director.time + 20, amp], i * 4); // shader time is offset by 20 s
  live.trailIdx++;
}

/** Lightning strike near the storm camera. */
export function strike(power = 1) {
  const c = W.camStorm;
  const a = Math.random() * Math.PI * 2;
  const r = 60 + Math.random() * 110;
  live.boltX = c.x + Math.sin(a) * r;
  live.boltZ = c.z + Math.cos(a) * r;
  live.boltSeed = Math.random() * 50;
  live.flash = Math.max(live.flash, power);
  live.shake = Math.max(live.shake, power);
}

/* ---------- world uniforms ---------- */
export const W = {
  cam: mkPose(), // pass 0 camera (with look)
  cam2: mkPose(), // pass 1 camera (with look)
  rig: mkPose(), // DOM rig camera (with look)
  camStorm: mkPose(),
  b: new Float32Array(4), // branch0, branch1, weight1
  sky: new Float32Array(4),
  sky2: new Float32Array(4),
  moon: new Float32Array(4),
  sun: new Float32Array(4),
  city: new Float32Array(4),
  word: new Float32Array(4),
  arr: new Float32Array(4),
  arrP: new Float32Array(4),
  lanF: new Float32Array(4),
  lan0: new Float32Array(4),
  lan1: new Float32Array(4),
  lanI: new Float32Array(4),
  storm: new Float32Array(4),
  storm2: new Float32Array(4),
  above: new Float32Array(4),
  cc: new Float32Array(16),
  ch: new Float32Array(16),
  post: new Float32Array(4),
  act: 0,
  breath: 0, // 0..1 shared breathing phase value (lanterns)
};

/* ---------- arrival ("Lights out") ---------- */
export const arrival = { at: -1, dur: 2.6, active: false };

/** Arrival progress 0..1, or -1 when not playing. */
export function arrivalT() {
  if (!arrival.active || arrival.at < 0) return -1;
  return clamp01((performance.now() - arrival.at) / 1000 / arrival.dur);
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* ---------- lantern ---------- */
const LB = mkBasis();
const lp = mkPose();

function camRel(p: Pose, f: number, r: number, u: number, out: Float32Array) {
  basis(p, LB);
  out[0] = p.x + LB.f[0] * f + LB.r[0] * r + LB.u[0] * u;
  out[1] = p.y + LB.f[1] * f + LB.r[1] * r + LB.u[1] * u;
  out[2] = p.z + LB.f[2] * f + LB.r[2] * r + LB.u[2] * u;
}

const tmpL = new Float32Array(3);
/** Lantern position in the coordinates of frame `fr` at g; returns intensity. */
function lanternAt(fr: number, g: number, time: number, out: Float32Array): number {
  const m = director.mobile;
  const bob = Math.sin(time * 0.9) * 0.18;
  const sway = Math.sin(time * 0.53 + 1) * 0.25;
  out[3] = 0.62;
  if (fr === 0) {
    const w = lanternWindow(word());
    const o = smooth(4, 70, g);
    const wx = w[0] - 0.55 - 2.6 * o,
      wy = w[1] + 0.3 * o + bob * o,
      wz = w[2] + sway * o;
    if (g < 70) {
      out[0] = wx;
      out[1] = wy;
      out[2] = wz;
      return 1;
    }
    cityPose(Math.max(0, g - 9), lp);
    let F = 9,
      R = m ? 0.6 : 1.8,
      U = m ? 1.8 : 1.4;
    if (g > 600) {
      const k = smooth(600, SEG.D0, g) * (1 - smooth(SEG.D1, SEG.E0, g));
      F = lerp(F, m ? 70 : 34, k);
      R = lerp(R, m ? 6 : 9, k);
      U = lerp(U, m ? 16 : -6, k);
      const e = smooth(SEG.D1, SEG.E0, g);
      F = lerp(F, 26, e);
      R = lerp(R, 0, e);
      U = lerp(U, m ? 5 : 3.6, e);
    }
    camRel(lp, F, R + sway, U + bob, tmpL);
    const k = smooth(70, 170, g);
    out[0] = lerp(wx, tmpL[0], k);
    out[1] = lerp(wy, tmpL[1], k);
    out[2] = lerp(wz, tmpL[2], k);
    return 1;
  }
  if (fr === 1) {
    stormPose(Math.max(SEG.STORM0, g - 8), lp);
    camRel(lp, 15, m ? 1 : 2, (m ? 2 : 1.3) + bob, out);
    return 1;
  }
  abovePose(Math.max(SEG.ABOVE0, g - 8), lp);
  if (g > SEG.SK_TITLE) clearClouds(lp);
  let F = 24,
    R = m ? 2 : 4.6,
    U = m ? 4.4 : 3;
  const kp = smooth(SEG.PROJ, SEG.CON0, g);
  F = lerp(F, 90, kp);
  R = lerp(R, m ? 6 : 14, kp);
  U = lerp(U, m ? 24 : 18, kp);
  camRel(lp, F, R + sway, U + bob, out);
  let I = 1;
  if (g > SEG.DAWN0) {
    // drift toward the rising sun and dissolve into it
    const k = smooth(2700, 3000, g);
    const d = lerp(60, 900, k * k);
    out[0] = lerp(out[0], lp.x + W.sun[0] * d, smooth(2690, 2800, g));
    out[1] = lerp(out[1], lp.y + W.sun[1] * d + 6, smooth(2690, 2800, g));
    out[2] = lerp(out[2], lp.z + W.sun[2] * d, smooth(2690, 2800, g));
    I = 1 - smooth(2900, 3040, g);
  }
  return I;
}

/* ---------- parameters ---------- */
function skyParams(g: number) {
  const s = W.sky,
    s2 = W.sky2;
  const dawn = smooth(SEG.DAWN0, SEG.END - 60, g);
  s[0] = lerp(0.3, 0.5, smooth(560, SEG.E0, g)) * (1 - smooth(1000, 1040, g)) + smooth(1180, 1260, g) * lerp(0.7, 1.15, smooth(SEG.PROJ, SEG.CON0, g));
  s[1] = smooth(1880, 2040, g) * (1 - smooth(2700, 2900, g)) + smooth(860, 960, g) * 0.25 * (1 - smooth(990, 1020, g));
  s[2] = dawn;
  s[3] = 1 - smooth(120, 560, g) * 0.8 - smooth(560, 700, g) * 0.2 + smooth(800, 880, g) * (1 - smooth(990, 1030, g)) * 0.7;
  s2[0] = 1 - smooth(990, 1030, g);
  s2[1] = smooth(995, 1060, g) * (1 - smooth(1180, 1205, g));
  s2[2] = (1 - smooth(1935, 2120, g) * 0.75) * (1 - smooth(2650, 2800, g));
  s2[3] = smooth(2780, SEG.END - 40, g);
  // moon: high over the street, ahead of the flight above the clouds, setting before dawn
  sample(MOON, g, tmpM);
  dirOf(tmpM[0], tmpM[1], tmpD);
  W.moon[0] = tmpD[0];
  W.moon[1] = tmpD[1];
  W.moon[2] = tmpD[2];
  W.moon[3] = director.mobile ? 0.032 : 0.028;
  const se = lerp(-0.09, 0.075, smooth(SEG.DAWN0 + 60, SEG.END, g));
  dirOf(Math.PI / 2 - 0.1, se, tmpD);
  W.sun[0] = tmpD[0];
  W.sun[1] = tmpD[1];
  W.sun[2] = tmpD[2];
  W.sun[3] = 0.022;
}
const tmpD = [0, 0, 0];
const tmpM = [0, 0];
// moon [g, azimuth, elevation]: high over the street, then placed per skill composition, setting before dawn
const MOON = mkTrack([
  [1000, 0, 0.74],
  [1205, 1.45, 0.32],
  [1340, 1.5, 0.3],
  [1450, 0.85, 0.34],
  [1555, 1.2, 0.4],
  [1660, 1.25, 0.075],
  [1765, 1.55, 0.62],
  [1870, 1.45, 0.13],
  [1990, 1.4, 0.2],
  [2600, 1.4, 0.03],
]);

/** Evaluates everything the shader and rigs need at g. */
export function evaluate(g: number, time: number, dt: number) {
  const m = director.mobile;
  const shaderT = time + 20;
  W.act = actAt(g);
  const at = arrivalT();
  const intro = director.reduced ? 1 : at >= 0 ? 1 : smooth(0.15, 2.2, (performance.now() - director.introAt) / 1000);

  // visitor look: hover parallax + drag + handheld breathing
  const hy = director.pointerX * 0.03 + Math.sin(time * 0.31) * 0.004 + Math.sin(time * 0.17 + 1) * 0.003;
  const hp = -director.pointerY * 0.016 + Math.sin(time * 0.23) * 0.003;
  const sh = live.shake;
  const ly = live.lookYaw + (director.reduced ? 0 : hy) + (Math.random() - 0.5) * sh * 0.03;
  const lpch = live.lookPitch + (director.reduced ? 0 : hp) + (Math.random() - 0.5) * sh * 0.03;
  const lr = (Math.random() - 0.5) * sh * 0.02;
  const addLook = (p: Pose) => {
    p.yaw += ly;
    p.pitch = Math.max(-1.565, Math.min(1.565, p.pitch + lpch));
    p.roll += lr;
  };

  // passes
  const b = W.b;
  if (g < SEG.STORM0) {
    cityPose(g, W.cam);
    b[0] = 0;
    b[1] = 0;
    b[2] = 0;
  } else if (g < SEG.STORM1) {
    cityPose(g, W.cam);
    stormPose(g, W.cam2);
    b[0] = 0;
    b[1] = 1;
    b[2] = smooth(SEG.STORM0, SEG.STORM1, g);
  } else if (g < SEG.ABOVE0) {
    stormPose(g, W.cam);
    b[0] = 1;
    b[1] = 1;
    b[2] = 0;
  } else if (g < SEG.ABOVE1) {
    stormPose(g, W.cam);
    poseAt(g, W.cam2);
    b[0] = 1;
    b[1] = 2;
    b[2] = smooth(SEG.ABOVE0, SEG.ABOVE1, g);
  } else {
    poseAt(g, W.cam);
    b[0] = 2;
    b[1] = 2;
    b[2] = 0;
  }
  const rigHero = at >= 0 && g < 60;
  if (rigHero) copyPose(W.cam, W.rig);
  // arrival override: start close on the lantern's window, pull back to the hero frame
  if (at >= 0 && g < 60) {
    const w = lanternWindow(word());
    const lx = w[0] - 0.55,
      ly2 = w[1],
      lz = w[2];
    const e = easeOut(smooth(0.2, 0.96, at));
    const hero = W.cam;
    const sx = lx - 13,
      sy = ly2 - 1.2,
      sz = lz - 9;
    const ax = lerp(lx, hero.x + Math.sin(hero.yaw) * Math.cos(hero.pitch) * 30, e);
    const ay = lerp(ly2, hero.y + Math.sin(hero.pitch) * 30, e);
    const az = lerp(lz, hero.z + Math.cos(hero.yaw) * Math.cos(hero.pitch) * 30, e);
    const px = lerp(sx, hero.x, e),
      py = lerp(sy, hero.y, e),
      pz = lerp(sz, hero.z, e);
    W.cam.x = px;
    W.cam.y = py;
    W.cam.z = pz;
    W.cam.yaw = Math.atan2(ax - px, az - pz);
    W.cam.pitch = Math.atan2(ay - py, Math.hypot(ax - px, az - pz));
    W.cam.roll = lerp(0.05, hero.roll, e);
    W.cam.F = lerp(1.6, hero.F, e);
  }
  addLook(W.cam);
  if (b[2] > 0) addLook(W.cam2);

  // rig camera = the pass camera in the rig's frame
  const fr = frameAt(g);
  const pass1Frame = b[2] > 0 ? b[1] : -1;
  if (rigHero) addLook(W.rig);
  else if (pass1Frame === fr && b[0] !== fr) copyPose(W.cam2, W.rig);
  else copyPose(W.cam, W.rig);
  // lying on your back: a slow continuous roll of the world under the (upright) text
  if (g > SEG.E0 - 40 && g < 1200) {
    const r = time * 0.025 * smooth(SEG.E0 - 40, SEG.E0, g);
    W.cam.yaw += r;
    if (b[2] > 0) W.cam2.yaw += r;
  }
  if (b[0] === 1) copyPose(W.cam, W.camStorm);
  else if (b[1] === 1 && b[2] > 0) copyPose(W.cam2, W.camStorm);

  skyParams(g);

  // city
  const c = W.city;
  const D = smooth(600, SEG.D0, g) * (1 - smooth(SEG.D1, 830, g));
  c[0] = lerp(0.3, 0.4, smooth(SEG.D1, 830, g));
  c[1] = smooth(SEG.D0 - 20, 735, g);
  c[2] = D;
  c[3] = lerp(1, 0.55, D);
  const wr = word();
  W.word[0] = wr.i0;
  W.word[1] = wr.j0;
  W.word[2] = wr.mode;
  W.word[3] = 1 - 0.65 * smooth(540, 640, g) * (1 - smooth(780, 822, g)) + 0.4 * smooth(780, 822, g);

  // arrival wave
  if (at >= 0) {
    const w = lanternWindow(wr);
    W.arrP[0] = w[0];
    W.arrP[1] = w[1];
    W.arrP[2] = w[2];
    W.arr[0] = Math.pow(smooth(0.24, 1, at), 1.6) * 420 + 0.5;
    W.arr[1] = 1;
    // struck match: a hard spike, a flicker, then it settles into the lantern
    const k = at - 0.05;
    W.arr[2] = k < 0 ? 0 : Math.exp(-k * 38) * 2.4 + Math.exp(-Math.pow((at - 0.1) / 0.025, 2)) * 0.6 + smooth(0.0, 0.06, k) * (1 - smooth(0.12, 0.42, at)) * 0.35;
    W.arr[3] = 1;
  } else {
    W.arr[0] = 0;
    W.arr[1] = 0;
    W.arr[2] = 0;
    W.arr[3] = 0;
  }

  // lantern field (city frame)
  const lf = W.lanF;
  lf[0] = 140;
  lf[1] = lerp(Math.max(200, W.cam.y - 60), m ? 3600 : 2400, smooth(SEG.D1, 840, g));
  lf[2] = Math.max(0, g - 600) * 1.4 + time * 0.9;
  lf[3] = smooth(SEG.D0 - 10, 720, g) * (1 - smooth(1000, 1030, g));
  // breathing shared by every lantern (~4.6 s), stronger while the visitor holds
  live.hold += ((live.holding ? 1 : 0) - live.hold) * (1 - Math.exp(-dt * 2.2));
  W.breath = 0.5 + 0.5 * Math.sin(shaderT * 1.366);
  W.lanI[2] = smooth(SEG.D1, SEG.E0, g) * (1 - smooth(1000, 1030, g)) * (1 - live.hold * 0.7);
  W.lanI[3] = live.hold;

  // visitor's lantern per pass
  const f0 = b[0] === 0 ? 0 : b[0] === 1 ? 1 : 2;
  W.lanI[0] = lanternAt(f0, g, time, W.lan0) * (at >= 0 ? smooth(0.05, 0.09, at) : 1);
  W.lan0[3] = 0.62;
  if (b[2] > 0) {
    W.lanI[1] = lanternAt(b[1], g, time, W.lan1);
    W.lan1[3] = 0.62;
  } else W.lanI[1] = 0;
  const breathL = 1 + (W.breath - 0.5) * 0.35 * smooth(SEG.D1, SEG.E0, g) * (1 - smooth(1000, 1030, g));
  W.lanI[0] *= breathL * (1 + live.hold * 0.5);

  // storm: lightning schedule (first strike as the words arrive, then every few seconds)
  live.flash *= Math.exp(-dt * 3.2);
  live.shake *= Math.exp(-dt * 6);
  const inStorm = g > 1035 && g < 1185;
  if (inStorm && !director.reduced) {
    for (const sg of STRIKE_G) if (live.prevG < sg && g >= sg) strike(1.25);
    if (live.nextStrike === 0) live.nextStrike = time + 2.2;
    else if (time > live.nextStrike) {
      strike(0.75 + Math.random() * 0.4);
      live.nextStrike = time + 2.6 + Math.random() * 2.8;
    }
  } else live.nextStrike = 0;
  live.prevG = g;
  // flicker: re-strike briefly after the main flash
  const fl = live.flash;
  W.storm[0] = fl * (0.75 + 0.25 * Math.sin(time * 60));
  W.storm[1] = live.boltX;
  W.storm[2] = live.boltZ;
  W.storm[3] = live.boltSeed;
  W.storm2[0] = 1 - smooth(1110, 1150, g) * 0.6;
  W.storm2[1] = 1;

  // above
  W.above[0] = 1 - smooth(SEG.ABOVE0, 1236, g);
  W.above[1] = 1;
  W.above[2] = smooth(1712, 1742, g) * (1 - smooth(1808, 1832, g));
  W.above[3] = smooth(1188, 1230, g) * (1 - smooth(1925, 2000, g));

  // constellations: draw progress and visibility per project
  for (let k = 0; k < CONST.length; k++) {
    const g0 = SEG.CON0 + k * SEG.CON_LEN;
    W.cc[k * 4] = CONST[k].az;
    W.cc[k * 4 + 1] = CONST[k].el;
    W.cc[k * 4 + 3] = smooth(g0 + 10, g0 + 95, g);
    W.ch[k * 4] += ((live.hoverCon === k ? 1 : 0) - W.ch[k * 4]) * (1 - Math.exp(-dt * 6));
    W.ch[k * 4 + 1] = smooth(SEG.PROJ, SEG.CON0, g) * (1 - smooth(2690, 2790, g));
  }

  // post
  const p = W.post;
  const ex = g < 1000 ? 1.0 : g < 1200 ? 1.0 : lerp(1.05, 0.88, smooth(2650, SEG.END, g));
  p[0] = ex * intro * (at >= 0 ? smooth(0.2, 0.75, at) : 1);
  p[1] = W.act === 6 ? 0.25 : W.act === 1 ? 0.45 : 0.55;
  p[2] = 1;
  p[3] = W.b[0] === 1 || W.b[1] === 1 ? Math.max(0, fl - 0.5) * 0.12 : 0;

  // spring-back look
  if (!live.dragging) {
    const k = 22,
      cc = 2 * Math.sqrt(k) * 0.62;
    live.lookVy += (-k * live.lookYaw - cc * live.lookVy) * dt;
    live.lookVp += (-k * live.lookPitch - cc * live.lookVp) * dt;
    live.lookYaw += live.lookVy * dt;
    live.lookPitch += live.lookVp * dt;
  }
}

/** Constellation centre in world (above frame) at distance d from the sky camera. */
export function conPoint(k: number, d: number, out: number[]) {
  dirOf(CONST[k].az, CONST[k].el, out);
  out[0] = SKY_C[0] + out[0] * d;
  out[1] = SKY_C[1] + out[1] * d;
  out[2] = SKY_C[2] + out[2] * d;
  return out;
}

export { lin };
