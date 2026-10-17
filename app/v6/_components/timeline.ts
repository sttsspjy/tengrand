// The film's timeline. Scroll position g (svh units) -> camera pose + world parameters.
// Three worlds share one shader: 0 night sea, 1 salt noon, 2 darkroom; the coda returns to night.

import { chapters } from "@/content/profile";
import { director } from "./director";
import { type Pose, mkPose, copyPose, mkTrack, sample, type Track, smooth, lin, lerp, lerpAng, clamp01 } from "./camera";

/* ---------- segments (g) ---------- */
export const SEG = {
  heroEnd: 100,
  VO0: 190,
  VO_STEP: 95,
  T1a: 470,
  SWAP1: 588, // under full white: night -> noon
  CARD: 600,
  SHOT0: 700,
  SHOT_LEN: 105,
  T2a: 1330,
  DEV_S0: 1338,
  DEV_S1: 1405,
  BLEED0: 1385,
  BLEED1: 1452,
  DARK0: 1440,
  DARK1: 1478,
  RIG2: 1460,
  PRINT0: 1545,
  PRINT_LEN: 135,
  T3a: 2085,
  SWAP3: 2195, // door fills frame: darkroom -> night
  SIGNAL0: 2240,
  CREDITS0: 2335,
  END: 2520,
} as const;

export const CHAPTERS = [
  { id: "origin", n: "01", label: chapters.intro, g: 0 },
  { id: "intent", n: "02", label: chapters.about, g: 150 },
  { id: "instruments", n: "03", label: chapters.skills, g: 618 },
  { id: "works", n: "04", label: chapters.work, g: 1515 },
  { id: "signal", n: "05", label: chapters.contact, g: 2270 },
] as const;

// Palette key per act, written to [data-act] on the root.
export const ACTS = ["night", "noon", "dark", "coda"] as const;

export function actAt(g: number) {
  return g < SEG.SWAP1 ? 0 : g < 1420 ? 1 : g < SEG.SWAP3 ? 2 : 3;
}

/* ---------- world constants (mirrored in the shader) ---------- */
export const DOOR_A = [20, 70];
export const DOOR_B = [16, 96];

// Monoliths: x, z, rot, height (proportions 4 : 9 : 1)
export const SLABS: number[][] = [
  [0, 0, 0.25, 6],
  [16, 14, -0.5, 8],
  [-4, 30, 1.0, 5.5],
  [14, 44, 0.15, 9],
  [-8, 58, -0.8, 7],
  [6, 72, 0.4, 10],
];

export const DARK = {
  SP: 5.6, // print spacing along the wall
  WALLZ: 5.2,
  RIMZ: 4.7,
  LINEY: 2.84,
  PRINT_W: 1.6,
  PRINT_H: 2.0,
  DOORX: 4 * 5.6 - 0.2,
};

/* ---------- tracks ---------- */
// night A: [z, h, x, ds (door screen x 0..1), pitch, rollDeg, F]
const NIGHT_A = mkTrack([
  [0, 0, 1.3, 0, 0.74, 0.08, 0, 1.6],
  [50, 2.5, 1.35, 0.6, 0.73, 0.078, -0.8, 1.6],
  [140, 9, 1.9, 2.5, 0.62, 0.06, -2.2, 1.6],
  [230, 16, 3.1, 5.5, 0.36, 0.03, 1.8, 1.55],
  [325, 23.5, 4.4, 8.5, 0.3, 0.0, 2.6, 1.5],
  [420, 31, 3.6, 12, 0.42, 0.02, -1.2, 1.55],
  [470, 38, 2.6, 15, 0.48, 0.045, -0.5, 1.6],
  [530, 52, 1.9, 18.5, 0.5, 0.06, -3, 1.4],
  [575, 65.5, 1.7, 19.9, 0.5, 0.07, -7, 1.0],
  [600, 71, 1.7, 20, 0.5, 0.07, -9, 0.9],
]);

const CODA = mkTrack([
  [SEG.T3a + 30, -4, 1.3, 0, 0.6, 0.075, 0, 1.3],
  [SEG.SWAP3, 0, 1.4, 0, 0.62, 0.075, 0, 1.45],
  [2290, 4, 1.6, 0.5, 0.66, 0.08, -1, 1.55],
  [2340, 5.5, 1.9, 0.6, 0.66, 0.075, 0, 1.55],
  [SEG.END, 11, 4.6, 1.2, 0.7, 0.03, 1, 1.6],
]);

type Shot = { s: number; a: number[]; d: number[]; h: number[]; sx: number[]; p: number[]; r: number[]; F: number[]; top?: boolean };
// One camera move per capability: low tracking, orbit, top-down spin, dutch wide, crane down, aerial pull-back.
export const SHOTS: Shot[] = [
  { s: 0, a: [2.5, 2.8], d: [13, 10], h: [0.45, 0.6], sx: [0.73, 0.71], p: [0.15, 0.14], r: [0, 0.02], F: [1.5, 1.5] },
  { s: 1, a: [2.9, 4.0], d: [13, 12], h: [2.2, 2.9], sx: [0.3, 0.3], p: [0.05, 0.08], r: [-0.04, 0.03], F: [1.45, 1.45] },
  { s: 2, a: [0.5, 1.7], d: [2.5, 2.5], h: [15, 12.5], sx: [0.7, 0.7], p: [-1.32, -1.32], r: [0, 0], F: [1.4, 1.4], top: true },
  { s: 3, a: [3.1, 3.4], d: [9, 8], h: [1.2, 1.0], sx: [0.3, 0.3], p: [0.18, 0.17], r: [0.24, 0.17], F: [1.05, 1.1] },
  { s: 4, a: [1.1, 1.4], d: [17, 15], h: [13, 2.5], sx: [0.72, 0.72], p: [-0.55, 0.02], r: [0, 0], F: [1.5, 1.5] },
  { s: 5, a: [4.3, 4.45], d: [15, 44], h: [3, 16], sx: [0.62, 0.6], p: [0.04, -0.3], r: [0, 0], F: [1.5, 1.3] },
];
const SWOOP = 23; // g at the start of each shot spent travelling from the previous one

let darkTrack: Track | null = null;
let darkKey = "";

function ensureDark() {
  const m = director.mobile;
  const key = m ? "m" : "d";
  if (darkTrack && darkKey === key) return darkTrack;
  darkKey = key;
  const off = m ? 0 : 0.78;
  const y = m ? 2.25 : 2.0;
  const p = m ? -0.24 : -0.17;
  const F = m ? 0.95 : 1.1;
  const keys: number[][] = [[SEG.PRINT0 - 4, off, y, 0, p - 0.13, F]];
  const pt = p - 0.13; // look down into the bath while the print develops
  for (let i = 0; i < 4; i++) {
    const g = SEG.PRINT0 + i * SEG.PRINT_LEN;
    const X = i * DARK.SP + off;
    const L = SEG.PRINT_LEN;
    keys.push([g + 8, X, y, 0, pt, F]);
    keys.push([g + 0.42 * L, X + 0.1, y, 0, pt, F]);
    keys.push([g + 0.64 * L, X + 0.2, y, 0, p, F]);
    keys.push([g + 110, X + 0.3, y, 0, p, F]);
  }
  keys.push([SEG.T3a + 25, DARK.DOORX, y, 0.4, p * 0.8, F]);
  keys.push([SEG.SWAP3 + 10, DARK.DOORX, 1.55, 4.9, -0.01, m ? 0.75 : 0.85]);
  darkTrack = mkTrack(keys);
  return darkTrack;
}

const tmp = new Array<number>(8).fill(0);

function nightPose(t: Track, door: number[], g: number, out: Pose) {
  sample(t, g, tmp);
  out.z = tmp[0];
  out.y = tmp[1];
  out.x = tmp[2];
  out.F = tmp[6] * (director.mobile ? 0.92 : 1);
  const zc = Math.min(out.z, door[1] - 4);
  const az = Math.atan2(door[0] - out.x, door[1] - zc);
  let ds = tmp[3];
  if (director.mobile) ds = 0.5 + (ds - 0.5) * 0.55;
  out.yaw = az - Math.atan(((ds - 0.5) * director.aspect) / out.F);
  out.pitch = tmp[4];
  out.roll = (tmp[5] * Math.PI) / 180;
}

function shotPose(i: number, u: number, out: Pose) {
  const S = SHOTS[i];
  const sl = SLABS[S.s];
  const m = director.mobile;
  const e = u * 0.5 + u * u * (3 - 2 * u) * 0.5;
  const a = lerp(S.a[0], S.a[1], e);
  const d = lerp(S.d[0], S.d[1], e);
  out.x = sl[0] + Math.sin(a) * d;
  out.z = sl[1] + Math.cos(a) * d;
  out.y = lerp(S.h[0], S.h[1], e);
  out.F = lerp(S.F[0], S.F[1], e) * (m ? 0.85 : 1);
  const sx = m ? 0.5 : lerp(S.sx[0], S.sx[1], e);
  out.yaw = Math.atan2(sl[0] - out.x, sl[1] - out.z) - Math.atan(((sx - 0.5) * director.aspect) / out.F);
  out.pitch = lerp(S.p[0], S.p[1], e) + (m && !S.top ? -0.12 : 0);
  out.roll = lerp(S.r[0], S.r[1], e) * (m ? 0.6 : 1);
}

const pa = mkPose(),
  pb = mkPose();

function blendPose(a: Pose, b: Pose, t: number, hop: number, out: Pose) {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t) + Math.sin(Math.PI * t) * hop;
  out.z = lerp(a.z, b.z, t);
  out.yaw = lerpAng(a.yaw, b.yaw, t);
  out.pitch = lerp(a.pitch, b.pitch, t);
  out.roll = lerp(a.roll, b.roll, t);
  out.F = lerp(a.F, b.F, t);
}

function noonPose(g: number, out: Pose) {
  const first = SEG.SHOT0 + SWOOP;
  if (g < first) {
    // fly in from the white: continues the forward momentum of the door crossing
    shotPose(0, 0, pb);
    copyPose(pb, pa);
    const s = SLABS[0];
    pa.x = s[0] + Math.sin(SHOTS[0].a[0]) * 62;
    pa.z = s[1] + Math.cos(SHOTS[0].a[0]) * 62;
    pa.y = 2.6;
    pa.roll = (-9 * Math.PI) / 180;
    pa.F = 0.9;
    pa.pitch = 0.07;
    const t = lin(SEG.SWAP1, first, g);
    const e = 1 - Math.pow(1 - t, 2.4);
    blendPose(pa, pb, e, 0, out);
    return;
  }
  const last = SHOTS.length - 1;
  if (g >= SEG.T2a) {
    // develop: crane up to a top-down frame over the flat, slow spin
    shotPose(last, 1, pa);
    pb.x = 0;
    pb.y = 30;
    pb.z = 64;
    pb.yaw = pa.yaw;
    pb.pitch = -1.5;
    pb.roll = 0;
    pb.F = 1.3;
    const t = smooth(SEG.T2a, 1415, g);
    blendPose(pa, pb, t, 0, out);
    out.roll = Math.max(0, g - 1395) * 0.006;
    out.y -= Math.max(0, g - 1415) * 0.08;
    return;
  }
  const k = (g - SEG.SHOT0) / SEG.SHOT_LEN;
  const i = Math.min(last, Math.max(0, Math.floor(k)));
  const local = g - SEG.SHOT0 - i * SEG.SHOT_LEN;
  if (i > 0 && local < SWOOP) {
    // swoop: position arcs between the two set-ups while the aim slides from one monolith to the next
    shotPose(i - 1, 1, pa);
    shotPose(i, 0, pb);
    const t = smooth(0, SWOOP, local);
    blendPose(pa, pb, t, 3, out);
    const A = SLABS[SHOTS[i - 1].s],
      B = SLABS[SHOTS[i].s];
    const ta = smooth(0, 0.55, t); // aim reaches the next monolith early so one is always in frame
    const tx = lerp(A[0], B[0], ta),
      tz = lerp(A[1], B[1], ta);
    const aim = Math.atan2(tx - out.x, tz - out.z);
    const w = Math.min(1, Math.sin(Math.PI * t) * 1.6);
    out.yaw = lerpAng(out.yaw, aim, w * 0.9);
    return;
  }
  shotPose(i, clamp01((local - SWOOP) / (SEG.SHOT_LEN - SWOOP)), out);
}

const dtmp = new Array<number>(6).fill(0);

function darkPose(g: number, out: Pose) {
  const t = ensureDark();
  sample(t, g, dtmp);
  out.x = dtmp[0];
  out.y = dtmp[1];
  out.z = dtmp[2];
  out.pitch = dtmp[3];
  out.F = dtmp[4];
  out.yaw = 0;
  out.roll = 0;
  if (g < SEG.PRINT0) {
    // match cut: top-down over the tray, still spinning from the salt flat, tilts up into the room
    const e = smooth(1462, SEG.PRINT0, g);
    const x0 = dtmp[0];
    out.x = lerp(x0 - 0.2, x0, e);
    out.y = lerp(3.5, dtmp[1], e);
    out.z = lerp(3.3, 0, e);
    out.pitch = lerp(-1.53, dtmp[3], e);
    out.roll = (0.27 + Math.max(0, g - 1460) * 0.006) * (1 - e);
  }
}

/** Base camera (no visitor look) of the act that owns position g. Pure. */
export function poseAt(g: number, out: Pose) {
  if (g < SEG.SWAP1) nightPose(NIGHT_A, DOOR_A, g, out);
  else if (g < SEG.RIG2) noonPose(g, out);
  else if (g < SEG.SWAP3) darkPose(g, out);
  else nightPose(CODA, DOOR_B, g, out);
  return out;
}

/* ---------- live (visitor-driven) state ---------- */
export const live = {
  lookYaw: 0,
  lookPitch: 0,
  lookVy: 0,
  lookVp: 0,
  dragging: false,
  sunOff: 0,
  sunV: 0,
  ripples: new Float32Array(24), // x, z, t0, amp
  ripIdx: 0,
  cut: 0, // negative flash
  flash: 0, // enlarger flash (darkroom)
  hoverSlab: -1,
  hoverPrint: -1,
  agitate: 0,
  ripWorld: -1, // world the ripples belong to
};

export function addRipple(x: number, z: number, amp: number, world: number) {
  if (live.ripWorld !== world) {
    live.ripples.fill(0);
    live.ripWorld = world;
  }
  const i = live.ripIdx % 6;
  live.ripples.set([x, z, director.time + 20, amp], i * 4); // shader time is offset by 20 s
  live.ripIdx++;
}

/* ---------- world uniforms ---------- */
export const W = {
  cam: mkPose(), // primary render camera (with look)
  cam2: mkPose(), // secondary world camera (darkroom in T2, night through the door in T3)
  rig: mkPose(), // DOM rig camera (with look)
  w: new Float32Array(4),
  wc: new Float32Array(4),
  t: new Float32Array(4),
  n1: new Float32Array(4),
  n2: new Float32Array(4),
  n3: new Float32Array(4),
  s1: new Float32Array(4),
  d1: new Float32Array(4),
  d2: new Float32Array(4),
  act: 0,
};

function nightParams(g: number, intro: number) {
  const n1 = W.n1,
    n2 = W.n2,
    n3 = W.n3;
  if (g < SEG.SWAP1 + 40) {
    const open = Math.pow(lin(540, 590, g), 2);
    n1[0] = DOOR_A[0];
    n1[1] = DOOR_A[1];
    n1[2] = 0.16 + 0.3 * smooth(470, 545, g) + 4 * open;
    n1[3] = 7 + 2 * smooth(470, 545, g) + 8 * open;
    n2[0] = 1 + 1.5 * smooth(500, 588, g);
    n2[1] = 0.02 + 0.012 * smooth(120, 330, g) - 0.01 * smooth(380, 470, g);
    n2[2] = 1 - 0.15 * smooth(140, 300, g) + 0.15 * smooth(400, 470, g);
    n2[3] = 1 - 0.15 * smooth(140, 300, g) + 0.2 * smooth(400, 560, g);
    n3[0] = intro * (1 + 2.5 * smooth(540, 588, g));
    n3[1] = 0.55 + 0.3 * smooth(120, 330, g) - 0.25 * smooth(380, 470, g);
    n3[2] = 2 * smooth(500, 585, g);
  } else {
    const opn = smooth(2240, 2290, g),
      cls = smooth(2400, SEG.END, g);
    n1[0] = DOOR_B[0];
    n1[1] = DOOR_B[1];
    n1[2] = 0.2 + 1.2 * opn - 1.28 * cls;
    n1[3] = 9 + 5 * opn - 8 * cls;
    n2[0] = 1 + 0.8 * opn - 1.45 * cls;
    n2[1] = 0.03;
    n2[2] = 0.9;
    n2[3] = 1.0 + 0.05 * opn;
    n3[0] = 1 + 0.1 * opn - 0.65 * cls;
    n3[1] = 0.6;
    n3[2] = 0.4 * opn;
  }
  n3[3] = 1;
}

/** Evaluates everything the shader and rigs need at g. */
export function evaluate(g: number, time: number, dt: number) {
  const intro = director.reduced ? 1 : smooth(0.25, 2.6, (performance.now() - director.introAt) / 1000);
  W.act = actAt(g);
  W.w.fill(0);
  W.wc.fill(0);
  W.t.fill(0);

  // visitor look: hover parallax + drag + handheld breathing
  const hy = director.pointerX * 0.035 + Math.sin(time * 0.31) * 0.004 + Math.sin(time * 0.17 + 1) * 0.003;
  const hp = -director.pointerY * 0.018 + Math.sin(time * 0.23) * 0.003;
  const ly = live.lookYaw + (director.reduced ? 0 : hy);
  const lp = live.lookPitch + (director.reduced ? 0 : hp);

  const addLook = (p: Pose) => {
    p.yaw += ly;
    p.pitch = Math.max(-1.56, Math.min(1.2, p.pitch + lp));
  };

  if (g < SEG.SWAP1) {
    nightPose(NIGHT_A, DOOR_A, g, W.cam);
    W.w[0] = 1;
    nightParams(g, intro);
    W.t[0] = smooth(548, SEG.SWAP1, g);
  } else if (g < SEG.DARK0) {
    noonPose(g, W.cam);
    W.w[1] = 1;
    W.t[0] = 1 - smooth(SEG.SWAP1 + 2, 650, g);
  } else if (g < SEG.DARK1) {
    noonPose(g, W.cam);
    darkPose(g, W.cam2);
    addLook(W.cam2);
    const k = smooth(SEG.DARK0, SEG.DARK1, g);
    W.w[1] = 1 - k;
    W.w[2] = k;
    W.wc[2] = 1;
  } else if (g < SEG.SWAP3) {
    darkPose(g, W.cam);
    nightPose(CODA, DOOR_B, g, W.cam2);
    addLook(W.cam2);
    W.w[2] = 1;
    W.wc[0] = 1;
    nightParams(g, 1);
  } else {
    nightPose(CODA, DOOR_B, g, W.cam);
    W.w[0] = 1;
    nightParams(g, 1);
  }
  addLook(W.cam);

  if (g < SEG.RIG2) {
    if (g < SEG.SWAP1) copyPose(W.cam, W.rig);
    else copyPose(W.cam, W.rig);
  } else if (g < SEG.SWAP3) {
    if (g < SEG.DARK1) copyPose(W.cam2, W.rig);
    else copyPose(W.cam, W.rig);
  } else copyPose(W.cam, W.rig);

  // develop transition
  W.t[1] = lin(SEG.DEV_S0, SEG.DEV_S1, g);
  W.t[2] = lin(SEG.BLEED0, SEG.BLEED1, g);
  live.cut *= Math.exp(-dt * 7);
  W.t[3] = live.cut;

  // noon: sun drag with inertia
  if (!live.dragging) {
    live.sunOff += live.sunV * dt;
    live.sunV *= Math.exp(-dt * 1.6);
  }
  W.s1[0] = 2.45 + live.sunOff + (g - SEG.SHOT0) * 0.0006;
  W.s1[1] = 0.62;
  W.s1[2] = 1 + 3 * (1 - smooth(SEG.SWAP1, 660, g));
  W.s1[3] = live.hoverSlab;

  // darkroom
  live.flash *= Math.exp(-dt * 4.5);
  live.agitate *= Math.exp(-dt * 0.8);
  W.d1[0] = DARK.SP;
  W.d1[1] = live.flash;
  W.d1[2] = 1 - lin(2108, 2150, g);
  W.d1[3] = live.agitate;
  const ajar = smooth(2092, 2122, g);
  W.d2[0] = DARK.DOORX;
  W.d2[1] = ajar > 0 ? 0.015 + 0.24 * ajar + 2.8 * Math.pow(lin(2122, SEG.SWAP3, g), 1.7) : 0;
  W.d2[2] = 2.7;
  W.d2[3] = live.hoverPrint;

  // spring-back look
  if (!live.dragging) {
    const k = 22,
      c = 2 * Math.sqrt(k) * 0.62;
    live.lookVy += (-k * live.lookYaw - c * live.lookVy) * dt;
    live.lookVp += (-k * live.lookPitch - c * live.lookVp) * dt;
    live.lookYaw += live.lookVy * dt;
    live.lookPitch += live.lookVp * dt;
  }
}
