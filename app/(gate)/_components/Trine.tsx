"use client";

import { useEffect, useRef } from "react";
import type { WorldId } from "@/content/quiz";
import { FRAG, VERT } from "./shader";
import { EXIT_MS, lightsWin, type Rig } from "./rig";
import s from "../gate.module.css";

// ---------- camera keys ----------
// t: look-at point · az/el: orbit angles (deg; az 0 faces the z wall, 90 faces the x wall) · fov: vertical (deg)
// sx/sy: lens shift (fraction of the half frame) so the scene sits clear of the text.
type Cam = { t: [number, number, number]; az: number; el: number; dist: number; roll: number; fov: number; sx: number; sy: number };

const DESK: Cam[] = [
  { t: [-1.3, -0.8, -1.3], az: 45, el: 19, dist: 19, roll: 0, fov: 30, sx: -0.25, sy: 0.02 },
  { t: [-1.45, -0.7, -1.0], az: 37, el: 14, dist: 18.5, roll: 0.6, fov: 30, sx: -0.27, sy: 0.02 },
  { t: [-1.0, -1.0, -1.5], az: 55, el: 29, dist: 19.5, roll: -0.7, fov: 30, sx: -0.27, sy: 0.02 },
  { t: [-1.5, -0.6, -1.1], az: 31, el: 9, dist: 18, roll: 0.4, fov: 30, sx: -0.27, sy: 0.02 },
  { t: [-1.05, -0.8, -1.5], az: 60, el: 23, dist: 19, roll: -0.5, fov: 30, sx: -0.27, sy: 0.02 },
  { t: [-1.3, -0.9, -1.3], az: 46, el: 34, dist: 18.5, roll: 0, fov: 30, sx: -0.27, sy: 0.02 },
];
const DESK_RESULT: Record<WorldId, Cam> = {
  monolith: { t: [0.2, 0.2, -2.9], az: 34, el: 6, dist: 13, roll: 0, fov: 30, sx: 0, sy: -0.22 },
  nocturne: { t: [-3.0, 0.4, 0.6], az: 52, el: 0, dist: 13, roll: 0, fov: 30, sx: -0.02, sy: -0.2 },
  codex: { t: [0.6, -2.4, -0.4], az: -20, el: 55, dist: 12, roll: 0, fov: 30, sx: 0.04, sy: -0.32 },
};
const MOB: Cam[] = [
  { t: [-1.3, -0.8, -1.3], az: 45, el: 19, dist: 24, roll: 0, fov: 40, sx: 0, sy: -0.36 },
  { t: [-1.4, -0.7, -1.1], az: 38, el: 14, dist: 23.5, roll: 0.6, fov: 40, sx: 0, sy: -0.42 },
  { t: [-1.05, -1.0, -1.45], az: 53, el: 28, dist: 24, roll: -0.7, fov: 40, sx: 0, sy: -0.42 },
  { t: [-1.45, -0.6, -1.1], az: 33, el: 10, dist: 23, roll: 0.4, fov: 40, sx: 0, sy: -0.42 },
  { t: [-1.05, -0.8, -1.45], az: 58, el: 23, dist: 24, roll: -0.5, fov: 40, sx: 0, sy: -0.42 },
  { t: [-1.3, -0.9, -1.3], az: 46, el: 33, dist: 23.5, roll: 0, fov: 40, sx: 0, sy: -0.42 },
];
const MOB_RESULT: Record<WorldId, Cam> = {
  monolith: { t: [-0.4, 0.0, -2.4], az: 36, el: 8, dist: 21, roll: 0, fov: 40, sx: 0, sy: -0.3 },
  nocturne: { t: [-2.4, 0.0, -0.4], az: 54, el: 8, dist: 21, roll: 0, fov: 40, sx: 0, sy: -0.3 },
  codex: { t: [0.2, -2.0, -0.4], az: -6, el: 50, dist: 19, roll: 0, fov: 40, sx: 0, sy: -0.3 },
};

// Result offset of the solid along the winner's light axis (desktop, mobile).
const SLIDE: Record<WorldId, [number, number, number]>[] = [
  { monolith: [0, 0, 1.2], nocturne: [1.2, 0, 0], codex: [0, 1.2, 0] },
  { monolith: [0, 0, 1.2], nocturne: [1.2, 0, 0], codex: [0, 1.2, 0] },
];

// ---------- quaternions [x, y, z, w] ----------
type Q = [number, number, number, number];
const QI: Q = [0, 0, 0, 1];
function qAxis(ax: number, ay: number, az: number, a: number): Q {
  const l = Math.hypot(ax, ay, az) || 1;
  const s2 = Math.sin(a / 2) / l;
  return [ax * s2, ay * s2, az * s2, Math.cos(a / 2)];
}
function qMul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Q = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  d = Math.abs(d);
  if (d > 0.9995) {
    const r = a.map((x, i) => x + (bb[i] - x) * t) as Q;
    const l = Math.hypot(...r);
    return r.map((x) => x / l) as Q;
  }
  const th = Math.acos(d);
  const sa = Math.sin((1 - t) * th) / Math.sin(th);
  const sb = Math.sin(t * th) / Math.sin(th);
  return [a[0] * sa + bb[0] * sb, a[1] * sa + bb[1] * sb, a[2] * sa + bb[2] * sb, a[3] * sa + bb[3] * sb];
}
/** Column-major 3×3 rotation for uniformMatrix3fv. */
function qMat(q: Q, out: Float32Array) {
  const [x, y, z, w] = q;
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y + z * w);
  out[2] = 2 * (x * z - y * w);
  out[3] = 2 * (x * y - z * w);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z + x * w);
  out[6] = 2 * (x * z + y * w);
  out[7] = 2 * (y * z - x * w);
  out[8] = 1 - 2 * (x * x + y * y);
}
const qAngle = (a: Q, b: Q) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));

// Object poses per question: each step turns it less, so the shadows converge on the letters.
const POSES: Q[] = [
  QI,
  qAxis(0.35, 1, 0.2, 0.95),
  qAxis(1, 0.45, -0.3, -0.78),
  qAxis(-0.4, 1, 0.65, 0.6),
  qAxis(0.6, -0.25, 1, -0.42),
  qAxis(0.2, 1, -0.5, 0.24),
];
// Detents of the monolith exit: three 120° clicks about the body diagonal cycle C, N, M through the red wall.
const DETENTS: Q[] = [qAxis(1, 1, 1, (2 * Math.PI) / 3), qAxis(1, 1, 1, (4 * Math.PI) / 3), QI];

/** Intro motion: a slow tumble that eases into exact alignment for a moment every cycle. */
function wander(t: number): Q {
  const cyc = 9.5;
  const ph = ((t + 6.2) % cyc) / cyc;
  // 0 at alignment, 1 fully turned
  const e = ph < 0.16 ? 0 : ph < 0.5 ? smooth((ph - 0.16) / 0.34) : ph < 0.72 ? 1 : 1 - smooth((ph - 0.72) / 0.28);
  const k = Math.floor((t + 6.2) / cyc);
  const ax = [Math.sin(k * 2.1 + 0.4), 0.8 + 0.4 * Math.cos(k * 1.3), Math.sin(k * 3.7 + 1.1)];
  const drift = t * 0.05;
  return qAxis(ax[0] + Math.sin(drift) * 0.3, ax[1], ax[2] + Math.cos(drift) * 0.3, (k % 2 ? -1 : 1) * 1.25 * e);
}
const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---------- springs (critically damped, implicit) ----------
type Spring = { x: number; v: number };
function spring(sp: Spring, target: number, omega: number, dt: number) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const det = f + dt * dt * oo;
  const x = (f * sp.x + dt * sp.v + dt * dt * oo * target) / det;
  sp.v = (sp.v + dt * oo * (target - sp.x)) / det;
  sp.x = x;
  return Math.abs(target - x) > 1e-4 || Math.abs(sp.v) > 1e-4;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

/** Fullscreen WebGL2 render of the Trine room; reads the rig every frame and sleeps when settled. */
export default function Trine({ rig }: { rig: Rig }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const canvas = document.createElement("canvas");
    canvas.className = s.canvas;
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      canvas.remove();
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    const par = gl.getExtension("KHR_parallel_shader_compile");

    let alive = true;
    let raf = 0;
    let started = false;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let U: Record<string, WebGLUniformLocation | null> = {};

    // ---------- state ----------
    const mobileQ = window.matchMedia("(max-width: 760px)");
    const debug = new URLSearchParams(window.location.search).has("debug");
    const keyFor = (): Cam => {
      const mob = mobileQ.matches;
      const ex = rig.exit?.id;
      if (ex === "monolith") return (mob ? MOB_RESULT : DESK_RESULT).monolith;
      if (rig.step >= 6 && rig.winner) return (mob ? MOB_RESULT : DESK_RESULT)[rig.winner];
      return (mob ? MOB : DESK)[Math.min(rig.step, 5)];
    };
    const k0 = keyFor();
    const cam = {
      tx: { x: k0.t[0], v: 0 },
      ty: { x: k0.t[1], v: 0 },
      tz: { x: k0.t[2], v: 0 },
      az: { x: k0.az, v: 0 },
      el: { x: k0.el, v: 0 },
      dist: { x: k0.dist, v: 0 },
      roll: { x: k0.roll, v: 0 },
      fov: { x: k0.fov, v: 0 },
      sx: { x: k0.sx, v: 0 },
      sy: { x: k0.sy, v: 0 },
    };
    const lights = rig.lights.map((x) => ({ x, v: 0 }));
    const sharp = { x: 12, v: 0 };
    const shieldX = { x: 0, v: 0 };
    const opos = [0, 0.2, 0].map((x) => ({ x, v: 0 }));
    const shieldA = { x: 0.55, v: 0 };
    const par3 = { px: 0, py: 0 };
    let yaw = 0;
    let yawV = 0;
    let releasedAt = 0;

    // orientation tween: from a frozen pose toward a (possibly moving) target
    let mode = "";
    let qCur: Q = rig.reduced ? QI : wander(0);
    let qFrom: Q = qCur;
    let tw0 = 0;
    let twDur = 1;
    let exitStartQ: Q | null = null;
    let exitT0 = -1;
    let exitDone = false;
    const objM = new Float32Array(9);
    let hold: Q | null = null;

    const t0 = performance.now();
    let last = t0;
    let ema = 16;
    let slow = 0;
    let adapt = 1;
    let cssW = 0;
    let cssH = 0;
    let scale = 1;
    const baseScale = () => Math.min(window.devicePixelRatio || 1, 1.5) * (mobileQ.matches ? 0.8 : 1);

    const size = () => {
      const r = el.getBoundingClientRect();
      cssW = r.width;
      cssH = r.height;
      scale = baseScale() * adapt;
      const w = Math.max(2, Math.round(cssW * scale));
      const h = Math.max(2, Math.round(cssH * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const modeOf = () => (rig.exit ? `x${rig.exit.id}` : rig.step === 0 ? "intro" : rig.step >= 6 ? "result" : `q${rig.step}`);
    const poseTarget = (t: number): Q => {
      if (rig.step === 0) return rig.reduced ? QI : wander(t);
      if (rig.step >= 6) return QI;
      return POSES[rig.step];
    };

    const update = (now: number, dt: number) => {
      const t = (now - t0) / 1000;
      const k = keyFor();
      const exit = rig.exit;
      const ex = exit ? (now - exit.t0) / 1000 / rig.slow : -1;
      let active = false;

      // ----- orientation -----
      const m = modeOf();
      if (m !== mode) {
        if (exit) {
          exitStartQ = qCur;
          exitT0 = exit.t0;
        } else {
          qFrom = qCur;
          tw0 = now;
          twDur = rig.reduced ? 0 : mode === "" ? 0 : rig.step >= 6 ? 2.1 : 1.7;
        }
        mode = m;
      }
      let qBase: Q;
      if (exit && exitStartQ) {
        if (exit.id === "monolith" && !rig.reduced) {
          // three hard clicks; hold between them
          let q = exitStartQ;
          for (let i = 0; i < 3; i++) {
            const st = 0.1 + i * 0.22;
            const p = clamp01((ex - st) / 0.15);
            if (p <= 0) break;
            q = qSlerp(i === 0 ? exitStartQ : DETENTS[i - 1], DETENTS[i], inOut(p));
            if (p < 1) break;
          }
          qBase = q;
        } else if (exit.id === "codex") {
          qBase = qSlerp(exitStartQ, QI, inOut(clamp01(ex / 0.3)));
        } else qBase = exitStartQ;
        active = true;
      } else {
        const p = twDur > 0 ? clamp01((now - tw0) / 1000 / twDur) : 1;
        qBase = p < 1 ? qSlerp(qFrom, poseTarget(t), inOut(p)) : poseTarget(t);
        if (p < 1 || (rig.step === 0 && !rig.reduced)) active = true;
      }

      // drag yaw: free while held, eases back to a whole turn after release
      if (rig.dragging) {
        yaw += rig.dragDX * 0.0085;
        yawV = 0;
        releasedAt = now;
        active = true;
      } else if (yaw !== 0 && !exit) {
        if (now - releasedAt > 450) {
          const sp = { x: yaw, v: yawV };
          const moving = spring(sp, Math.round(yaw / (Math.PI * 2)) * Math.PI * 2, 2.2, dt);
          yaw = sp.x;
          yawV = sp.v;
          if (!moving) {
            yaw = 0;
            yawV = 0;
          }
        }
        active = true;
      }
      rig.dragDX = 0;
      const q = exit ? qBase : yaw !== 0 ? qMul(qAxis(0, 1, 0, yaw), qBase) : qBase;
      qCur = q;
      qMat(hold ?? q, objM);

      // ----- camera -----
      const stiff = exit?.id === "monolith" ? 7 : 2.1;
      const pxT = rig.reduced || exit ? 0 : rig.px;
      const pyT = rig.reduced || exit ? 0 : rig.py;
      par3.px += (pxT - par3.px) * (1 - Math.exp(-dt * 2.5));
      par3.py += (pyT - par3.py) * (1 - Math.exp(-dt * 2.5));
      if (Math.abs(pxT - par3.px) + Math.abs(pyT - par3.py) > 1e-3) active = true;
      const push = exit?.id === "nocturne" ? 1 - 0.14 * inOut(clamp01(ex / 1.5)) : 1;
      const targets: [Spring, number][] = [
        [cam.tx, k.t[0]],
        [cam.ty, k.t[1]],
        [cam.tz, k.t[2]],
        [cam.az, k.az],
        [cam.el, k.el],
        [cam.dist, k.dist * push],
        [cam.roll, k.roll],
        [cam.fov, k.fov],
        [cam.sx, k.sx],
        [cam.sy, k.sy],
      ];
      for (const [sp, v] of targets) {
        if (rig.reduced) {
          sp.x = v;
          sp.v = 0;
        } else if (spring(sp, v, stiff, dt)) active = true;
      }

      // ----- lights -----
      let lt: number[] = rig.step >= 6 && rig.winner ? lightsWin(rig.winner) : rig.lights;
      let lOmega = 3.2;
      let expo = 1;
      let cone = 1;
      let point = 0;
      let pointR = 0.05;
      let ink = -1;
      if (exit) {
        const id = exit.id;
        if (id === "monolith") {
          // hard click: no smoothing
          lt = [2.3, 0, 0];
          lights.forEach((l, i) => ((l.x = lt[i]), (l.v = 0)));
        } else if (id === "nocturne") {
          lt = [0, Math.max(lights[1].x, 1.4), 0];
          lOmega = 5;
          expo = 1 - inOut(clamp01((ex - 0.15) / 1.05));
          cone = 1 - 0.8 * inOut(clamp01((ex - 0.2) / 0.9));
          point = smooth((ex - 0.45) / 0.5) * (ex < 1.46 ? 1 : 0);
          pointR = 0.045 - 0.036 * inOut(clamp01((ex - 0.95) / 0.5));
          // one flicker just before it dies
          if (ex > 1.3 && ex < 1.36) point *= 0.35;
        } else {
          lt = [lights[0].x * 0.5, lights[1].x * 0.5, Math.max(lights[2].x, 1.6)];
          lOmega = 4;
          // slow soak from the letter, accelerating; the tail guarantees full cover
          const p = clamp01((ex - 0.08) / (EXIT_MS.codex / 1000 - 0.16));
          const span = canvas.width < canvas.height ? 0.68 : 0.95; // portrait frames are fewer screen-heights wide
          ink = p < 0.88 ? span * Math.pow(p / 0.88, 2) : span + (p - 0.88) * 30;
        }
        if (ex * 1000 < EXIT_MS[id] + 400) active = true;
        else exitDone = true;
      }
      for (let i = 0; i < 3; i++) {
        if (rig.reduced && !exit) {
          lights[i].x = lt[i];
          lights[i].v = 0;
        } else if (spring(lights[i], lt[i], lOmega, dt)) active = true;
      }
      const kT = rig.step >= 6 || exit ? 110 : rig.step === 0 ? 22 : 22 + rig.step * 3;
      if (spring(sharp, kT, 2, dt) && !rig.reduced) active = true;
      if (rig.reduced) sharp.x = kT;

      // ----- uniforms -----
      const az = ((cam.az.x + par3.px * 2.2) * Math.PI) / 180;
      const elv = ((cam.el.x - par3.py * 1.4) * Math.PI) / 180;
      const d = cam.dist.x;
      const tx = cam.tx.x,
        ty = cam.ty.x,
        tz = cam.tz.x;
      const px = tx + d * Math.cos(elv) * Math.sin(az);
      const py = ty + d * Math.sin(elv);
      const pz = tz + d * Math.cos(elv) * Math.cos(az);
      let fx = tx - px,
        fy = ty - py,
        fz = tz - pz;
      const fl = Math.hypot(fx, fy, fz);
      fx /= fl;
      fy /= fl;
      fz /= fl;
      // right = forward × up(0,1,0)
      let rx = -fz,
        rz = fx;
      const rl = Math.hypot(rx, rz);
      rx /= rl;
      rz /= rl;
      const ry = 0;
      // up = right × forward
      let ux = ry * fz - rz * fy,
        uy = rz * fx - rx * fz,
        uz = rx * fy - ry * fx;
      const roll = (cam.roll.x * Math.PI) / 180;
      const cr = Math.cos(roll),
        sr = Math.sin(roll);
      const Rx = rx * cr + ux * sr,
        Ry = ry * cr + uy * sr,
        Rz = rz * cr + uz * sr;
      ux = ux * cr - rx * sr;
      uy = uy * cr - ry * sr;
      uz = uz * cr - rz * sr;

      // result: the solid glides toward the viewer along the winning beam, clearing its shadow
      const slide = !exit && rig.step >= 6 && rig.winner ? SLIDE[mobileQ.matches ? 1 : 0][rig.winner] : [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        const v = (i === 1 ? 0.2 : 0) + slide[i];
        if (rig.reduced) opos[i].x = v;
        else if (!exit && spring(opos[i], v, 1.6, dt)) active = true;
      }
      gl.uniform3f(U.uO, opos[0].x, opos[1].x, opos[2].x);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform3f(U.uCamPos, px, py, pz);
      gl.uniformMatrix3fv(U.uCamM, false, [Rx, Ry, Rz, ux, uy, uz, fx, fy, fz]);
      gl.uniform3f(U.uLens, Math.tan((cam.fov.x * Math.PI) / 360), cam.sx.x, cam.sy.x);
      gl.uniformMatrix3fv(U.uObjM, false, objM);
      gl.uniform3f(U.uLight, lights[0].x, lights[1].x, lights[2].x);
      gl.uniform4f(U.uFx, sharp.x, expo, cone, 0.03);
      gl.uniform4f(U.uPoint, point, pointR, 0, 0);
      gl.uniform1f(U.uInk, ink);
      const mob = mobileQ.matches;
      // darkening behind the text: left column (intro, questions) or bottom band (result, phones)
      const bottom = mob || rig.step >= 6;
      if (spring(shieldX, bottom ? 1 : 0, 3, dt)) active = true;
      if (spring(shieldA, exit ? 0 : 0.55, 3, dt)) active = true;
      const b = shieldX.x;
      gl.uniform4f(U.uShield, -(1 - b), -b, shieldA.x, mob ? -0.25 : 0.05 - 0.15 * b);
      return active;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      // adaptive resolution: step down when frames run long for ~1 s
      ema += (dt * 1000 - ema) * 0.08;
      if (ema > 21) {
        slow += dt;
        if (slow > 1 && adapt > 0.5) {
          adapt = Math.max(0.5, adapt * 0.85);
          slow = 0;
          ema = 16;
          size();
        }
      } else slow = 0;
      const active = update(now, dt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!rig.out.ready) {
        rig.out.ready = true;
        canvas.dataset.on = "";
      }
      if (exitDone) return;
      if (active || rig.dragging) schedule();
    };
    const schedule = () => {
      if (!raf && alive && !document.hidden && started) raf = requestAnimationFrame(frame);
    };
    rig.wake = () => {
      if (!raf) {
        last = performance.now() - 16;
        ema = 16;
      }
      schedule();
    };

    const onVis = () => (document.hidden ? (cancelAnimationFrame(raf), (raf = 0)) : rig.wake());
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => {
      size();
      rig.wake();
    });
    ro.observe(el);
    const onMq = () => rig.wake();
    mobileQ.addEventListener("change", onMq);

    const begin = () => {
      if (!alive) return;
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn("[gate] shader unavailable", gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog));
        canvas.remove();
        return;
      }
      gl.useProgram(prog);
      const names = ["uO", "uRes", "uTime", "uCamPos", "uCamM", "uLens", "uObjM", "uLight", "uFx", "uPoint", "uInk", "uShield"];
      U = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
      rig.out.gl = true;
      started = true;
      size();
      rig.wake();
    };
    const poll = () => {
      if (!alive) return;
      if (!par || gl.getProgramParameter(prog, par.COMPLETION_STATUS_KHR)) begin();
      else requestAnimationFrame(poll);
    };
    poll();

    if (debug) {
      (window as unknown as { __trine: unknown }).__trine = {
        rig,
        set(c: Partial<Cam>) {
          const k = keyFor();
          Object.assign(k, c);
          for (const [key, sp] of Object.entries(cam) as [string, Spring][]) {
            const v = key === "tx" ? k.t[0] : key === "ty" ? k.t[1] : key === "tz" ? k.t[2] : (k as unknown as Record<string, number>)[key];
            sp.x = v;
            sp.v = 0;
          }
          rig.wake();
        },
        hold(i: number | null) {
          hold = i === null ? null : i < 0 ? QI : POSES[i];
          rig.wake();
        },
      };
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      rig.wake = () => {};
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      mobileQ.removeEventListener("change", onMq);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [rig]);

  return <div ref={host} className={s.stage} aria-hidden="true" />;
}
