"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildForms, SEA_Y } from "./forms";
import { CAM_RESULT, type Rig } from "./rig";

export const BG = "#111110";
const BASE_FOV = 34;
const TIERS = [2, 1.5, 1.25, 1]; // adaptive DPR steps (down only)
const OMEGA = 2.3; // per-slat spring frequency (rad/s), critically damped

// sy: extra vertical view offset; pd / pel / psy: portrait distance, elevation and offset overrides.
type CamKey = { az: number; el: number; dist: number; roll: number; sy?: number; pd?: number; pel?: number; psy?: number };
// 0 intro · 1–5 questions · 6–8 result (monolith, nocturne, codex)
const KEYS: CamKey[] = [
  { az: 0.55, el: 0.14, dist: 14, roll: -0.03, pd: 11.8, psy: 0.17 },
  { az: -0.4, el: 0.4, dist: 15.5, roll: 0.02, pd: 11, psy: 0.27 },
  { az: 1.05, el: 0.1, dist: 15, roll: 0.045, pd: 10.6, psy: 0.27 },
  { az: 2.15, el: 0.55, dist: 16, roll: -0.02, pd: 11.2, psy: 0.27 },
  { az: 0.95, el: 0.24, dist: 15, roll: -0.05, pd: 10.6, psy: 0.27 },
  { az: 0.25, el: 0.44, dist: 15.5, roll: 0, pd: 11, psy: 0.27 },
  { az: 0.35, el: 0.1, dist: 13.5, roll: 0, pd: 11.3, psy: 0.04 },
  { az: 0.0, el: 0.15, dist: 13.5, roll: 0, sy: -0.07, pd: 7.2, pel: 0.34, psy: 0.0 },
  { az: 0.4, el: 0.22, dist: 11.5, roll: 0, pd: 9.7, psy: 0.04 },
];
const Q_SX = 0.28; // desktop question steps: form centred at 78% of the width, clear of the text column
const Q_SCALE = 0.8;

// Each slat belongs to one form: its evenly spread share value falls into that form's slice of the weights,
// so every form stays whole and its density follows the tally.
function member(h: number, w: readonly number[], out: Float32Array, o: number) {
  const k = h < w[0] ? 0 : h < w[0] + w[1] ? 1 : 2;
  out[o] = k === 0 ? 1 : 0;
  out[o + 1] = k === 1 ? 1 : 0;
  out[o + 2] = k === 2 ? 1 : 0;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Porcelain: built-in standard material plus a cheap ambient-occlusion term from the slat's local position.
function makeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSlat;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSlat = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSlat;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float ao = mix(0.45, 1.0, smoothstep(-0.5, 0.25, vSlat.x));
        ao *= mix(0.8, 1.0, smoothstep(0.36, 0.18, abs(vSlat.z)));
        diffuseColor.rgb = vec3(0.86, 0.853, 0.835) * ao;`
      );
  };
  return m;
}

function World({ rig, count }: { rig: Rig; count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const { scene, camera, size, gl } = useThree();

  const geo = useMemo(() => new RoundedBoxGeometry(1, 0.085, 0.72, 1, 0.03), []);
  const mat = useMemo(makeMaterial, []);
  const F = useMemo(() => buildForms(count), [count]);
  const debug = useMemo(() => new URLSearchParams(window.location.search).has("debug"), []);

  useEffect(() => {
    scene.fog = new THREE.Fog(BG, 10, 22);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);

  const T = useMemo(() => {
    const N = count;
    const w = new Float32Array(N * 3);
    const tw = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      member(F.share[i], rig.target, tw, i * 3);
      for (let k = 0; k < 3; k++) w[i * 3 + k] = tw[i * 3 + k];
    }
    const k0 = KEYS[rig.cam];
    return {
      w,
      v: new Float32Array(N * 3),
      tw,
      ver: new Int32Array(N).fill(rig.version),
      time: 0,
      born: -1,
      frames: 0,
      spin: 0,
      spinV: 0,
      cam: { ...k0, ty: 0, fov: BASE_FOV, sx: 0, sy: 0, px: 0, py: 0, sc: 1, init: false },
      rate: 1, // idle-motion clock speed: 1 on the intro or while anything moves, eases to 0 once settled
      gw: [...rig.target] as number[],
      p: new THREE.Vector3(),
      pa: new THREE.Vector3(),
      pb: new THREE.Vector3(),
      pc: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      qa: new THREE.Quaternion(),
      qb: new THREE.Quaternion(),
      qc: new THREE.Quaternion(),
      qt: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      qHelix: new THREE.Quaternion(),
      qRing: new THREE.Quaternion(),
      qTilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, 0.16)),
      e: new THREE.Euler(),
      m4: new THREE.Matrix4(),
      AY: new THREE.Vector3(0, 1, 0),
      look: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      qr: new THREE.Quaternion(),
    };
  }, [count, rig, F]);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now();
    if (T.born < 0) T.born = now;
    T.frames++;
    if (T.frames === 1) gl.domElement.setAttribute("data-on", "");
    const reduced = rig.reduced;
    const dt = Math.min(delta, 1 / 20);
    T.time += dt * T.rate;
    const time = T.time;
    const N = count;

    // ── blend weights: each slat adopts the newest target after its ripple delay, then springs to it ──
    const since = (now - rig.tChange) / 1000;
    const kw = OMEGA * OMEGA;
    let morph = false;
    for (let i = 0; i < N; i++) {
      if (T.ver[i] !== rig.version && (reduced || since >= F.delay[i] * rig.spread)) {
        T.ver[i] = rig.version;
        member(F.share[i], rig.target, T.tw, i * 3);
      }
      if (T.ver[i] !== rig.version) morph = true;
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        if (reduced) {
          T.w[j] = T.tw[j];
          T.v[j] = 0;
          continue;
        }
        T.v[j] += (kw * (T.tw[j] - T.w[j]) - 2 * OMEGA * T.v[j]) * dt;
        T.w[j] += T.v[j] * dt;
        if (Math.abs(T.tw[j] - T.w[j]) > 6e-4 || Math.abs(T.v[j]) > 6e-4) morph = true;
      }
    }

    // ── drag spin with inertia ──
    if (rig.dragging) {
      const dv = rig.dragDX * 0.0055;
      T.spin += dv;
      T.spinV += (dv / Math.max(dt, 1e-3) - T.spinV) * 0.5;
    } else if (!reduced) {
      T.spin += T.spinV * dt;
      T.spinV *= Math.exp(-dt * 1.3);
      if (Math.abs(T.spinV) < 0.002) T.spinV = 0;
    } else T.spinV = 0;
    rig.dragDX = 0;
    m.rotation.y = T.spin;
    const spinning = rig.dragging || T.spinV !== 0;

    // ── camera: damped travel between step keys, view offset keeps the form clear of the text ──
    const cam = camera as THREE.PerspectiveCamera;
    const C = T.cam;
    const W = size.width;
    const Hh = size.height;
    const aspect = W / Hh;
    const portrait = aspect < 0.9;
    const k = KEYS[rig.cam] ?? KEYS[0];
    const isResult = rig.cam >= CAM_RESULT;
    const isQuestion = rig.cam > 0 && !isResult && !rig.dive;
    const tgt = {
      az: k.az,
      el: portrait ? (k.pel ?? k.el) : k.el,
      dist: rig.dive ? 0.35 : portrait ? (k.pd ?? k.dist * 0.8) : k.dist,
      roll: k.roll,
      sx: portrait || isResult ? 0 : rig.cam === 0 ? 0.2 : Q_SX,
      sy: portrait ? (k.psy ?? 0) : (k.sy ?? 0),
      sc: isQuestion ? (portrait ? 0.92 : Q_SCALE) : 1,
      fov: (portrait ? (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(23)) / aspect) * 180) / Math.PI : BASE_FOV) + (rig.dive ? 30 : 0),
    };
    T.gw[0] += (rig.target[0] - T.gw[0]) * (reduced ? 1 : 1 - Math.exp(-dt * 1.2));
    T.gw[1] += (rig.target[1] - T.gw[1]) * (reduced ? 1 : 1 - Math.exp(-dt * 1.2));
    T.gw[2] += (rig.target[2] - T.gw[2]) * (reduced ? 1 : 1 - Math.exp(-dt * 1.2));
    const ty = SEA_Y * 0.55 * T.gw[1];
    const kc = reduced || !C.init ? 1 : 1 - Math.exp(-dt * (rig.dive ? 2.4 : 0.95));
    C.init = true;
    let camMoving = false;
    const damp = (cur: number, to: number, eps: number) => {
      const n = cur + (to - cur) * kc;
      if (Math.abs(to - n) > eps) camMoving = true;
      return Math.abs(to - n) <= eps ? to : n;
    };
    C.az = damp(C.az, tgt.az, 0.002);
    C.el = damp(C.el, tgt.el, 0.002);
    C.dist = damp(C.dist, tgt.dist, 0.004);
    C.roll = damp(C.roll, tgt.roll, 0.0005);
    C.sx = damp(C.sx, tgt.sx, 0.0005);
    C.sy = damp(C.sy, tgt.sy, 0.0005);
    C.fov = damp(C.fov, tgt.fov, 0.02);
    C.ty = damp(C.ty, ty, 0.002);
    C.sc = damp(C.sc, tgt.sc, 0.001);
    m.scale.setScalar(C.sc);
    const kp = reduced ? 0 : 1 - Math.exp(-dt * 2.2);
    C.px += (rig.px - C.px) * kp;
    C.py += (rig.py - C.py) * kp;
    const parallax = reduced ? 0 : Math.abs(rig.px - C.px) > 0.003 || Math.abs(rig.py - C.py) > 0.003;

    T.look.set(0, C.ty, 0);
    const ce = Math.cos(C.el);
    cam.position.set(Math.sin(C.az) * ce * C.dist, C.ty + Math.sin(C.el) * C.dist, Math.cos(C.az) * ce * C.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(T.look);
    T.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    T.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const par = reduced ? 0 : 0.3 * Math.min(1, C.dist / 8);
    cam.position.addScaledVector(T.right, C.px * par).addScaledVector(T.up, -C.py * par * 0.6);
    T.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    cam.quaternion.multiply(T.qr.setFromAxisAngle(T.fwd.set(0, 0, 1), C.roll));
    if (Math.abs(cam.fov - C.fov) > 0.01) cam.fov = C.fov;
    cam.setViewOffset(W, Hh, -C.sx * W, C.sy * Hh, W, Hh);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const fog = scene.fog as THREE.Fog;
    fog.near = Math.max(0.1, C.dist - 3.5);
    fog.far = C.dist + 8.5;

    // screen position of the form centre (hand-off flood origin)
    T.p.set(0, C.ty, 0).project(cam);
    rig.out.cx = (T.p.x * 0.5 + 0.5) * W;
    rig.out.cy = (0.5 - T.p.y * 0.5) * Hh;

    if (key.current) key.current.position.set(-5 + C.px * 3, 7 - C.py * 2, 6);

    // ── per-form idle motion ──
    T.qHelix.setFromAxisAngle(T.AY, time * 0.045);
    T.qRing.copy(T.qTilt).multiply(T.qt.setFromAxisAngle(T.AY, time * 0.05));

    // ── assemble on load ──
    const age = (now - T.born) / 1000;
    const assembling = !reduced && age < 3.6;

    for (let i = 0; i < N; i++) {
      const wa = T.w[i * 3];
      const wb = T.w[i * 3 + 1];
      const wc = T.w[i * 3 + 2];

      // helix
      T.pa.copy(F.helix.p[i]).applyQuaternion(T.qHelix);
      T.qa.copy(T.qHelix).multiply(F.helix.q[i]);
      // sea with swell
      const bp = F.sea.p[i];
      T.pb.copy(bp);
      T.qb.copy(F.sea.q[i]);
      if (F.seaSwell[i] > 0) {
        const a1 = bp.x * 0.7 + time * 0.55;
        const a2 = bp.z * 0.9 - time * 0.35;
        const a3 = bp.x * 2.1 + bp.z * 1.3 + time * 0.9;
        T.pb.y += 0.17 * Math.sin(a1) * Math.cos(a2) + 0.05 * Math.sin(a3);
        const sx = 0.17 * 0.7 * Math.cos(a1) * Math.cos(a2) + 0.05 * 2.1 * Math.cos(a3);
        const sz = -0.17 * 0.9 * Math.sin(a1) * Math.sin(a2) + 0.05 * 1.3 * Math.cos(a3);
        T.qt.setFromEuler(T.e.set(-sz, 0, sx));
        T.qb.premultiply(T.qt);
      }
      // ring
      T.pc.copy(F.ring.p[i]).applyQuaternion(T.qRing);
      T.qc.copy(T.qRing).multiply(F.ring.q[i]);

      const p = T.p.set(0, 0, 0).addScaledVector(T.pa, wa).addScaledVector(T.pb, wb).addScaledVector(T.pc, wc);
      if (T.qa.dot(T.qb) < 0) T.qb.set(-T.qb.x, -T.qb.y, -T.qb.z, -T.qb.w);
      if (T.qa.dot(T.qc) < 0) T.qc.set(-T.qc.x, -T.qc.y, -T.qc.z, -T.qc.w);
      const q = T.q.set(
        T.qa.x * wa + T.qb.x * wb + T.qc.x * wc,
        T.qa.y * wa + T.qb.y * wb + T.qc.y * wc,
        T.qa.z * wa + T.qb.z * wb + T.qc.z * wc,
        T.qa.w * wa + T.qb.w * wb + T.qc.w * wc
      );
      if (q.lengthSq() < 1e-6) q.copy(T.qa);
      q.normalize();
      const s = T.s
        .copy(F.helix.s[i])
        .multiplyScalar(wa)
        .addScaledVector(F.sea.s[i], wb)
        .addScaledVector(F.ring.s[i], wc);

      // flutter while morphing: drift off-path and tumble in proportion to the slat's blend speed
      const sp = Math.sqrt(T.v[i * 3] ** 2 + T.v[i * 3 + 1] ** 2 + T.v[i * 3 + 2] ** 2);
      if (sp > 1e-4) {
        p.addScaledVector(F.dir[i], sp * 0.45);
        q.multiply(T.qt.setFromAxisAngle(F.axis[i], sp * 0.6));
      }

      if (assembling) {
        const a = expoOut(clamp01((age - 0.25 - F.delay[i] * 1.2) / 1.5));
        s.x *= Math.max(a, 1e-4);
        s.y *= Math.max(a, 1e-4);
        p.y += (1 - a) * 0.5;
      }

      m.setMatrixAt(i, T.m4.compose(p, q, s));
    }
    m.instanceMatrix.needsUpdate = true;

    // Idle motion runs on the intro; elsewhere it eases to a stop once the morph, camera and spin settle.
    const live = !reduced && (rig.cam === 0 || rig.dive || morph || spinning || assembling);
    const rateTo = live ? 1 : 0;
    T.rate += (rateTo - T.rate) * (reduced ? 1 : 1 - Math.exp(-dt * 2.4));
    if (Math.abs(rateTo - T.rate) < 0.003) T.rate = rateTo;
    const easing = T.rate !== rateTo;
    rig.out.idle = T.rate > 0;
    rig.out.settled = !morph && !camMoving && !spinning && !parallax && !assembling && !easing;

    if (debug) {
      // Leftmost projected slat end, as a fraction of the width (legibility probe).
      let minX = 1;
      for (let i = 0; i < N; i++) {
        m.getMatrixAt(i, T.m4);
        for (const e of [-0.5, 0.5]) {
          T.p.set(e, 0, 0).applyMatrix4(T.m4).applyMatrix4(m.matrixWorld).project(cam);
          if (T.p.z < 1) minX = Math.min(minX, T.p.x * 0.5 + 0.5);
        }
      }
      (window as unknown as { __gate?: object }).__gate = { minX, cam: rig.cam, frames: T.frames };
    }
  });

  return (
    <>
      <hemisphereLight args={["#ffffff", "#2a2a28", 1.5]} />
      <directionalLight ref={key} position={[-5, 7, 6]} intensity={2.3} />
      <directionalLight position={[6, 2, -6]} intensity={1.2} />
      <instancedMesh ref={mesh} args={[geo, mat, count]} frustumCulled={false} />
    </>
  );
}

function Scheduler({ rig, maxDpr }: { rig: Rig; maxDpr: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);

  // frameloop="demand": every frame while anything moves, ~30fps for idle motion, nothing when settled
  // under reduced motion. rAF stops by itself in hidden tabs. Steps DPR down when busy frames average >19ms.
  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, maxDpr));
    let raf = 0;
    let last = 0;
    let prev = performance.now();
    let prevBusy = false;
    let seen = -1;
    let tier = TIERS.findIndex((t) => t <= maxDpr);
    let acc = 0;
    let n = 0;
    const start = prev;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - prev;
      prev = now;
      const changed = rig.stamp !== seen || rig.dragging;
      seen = rig.stamp;
      const busy = changed || !rig.out.settled;
      if (!busy && (rig.reduced || !rig.out.idle || now - last < 32)) {
        prevBusy = false;
        return;
      }
      if (busy && prevBusy && !rig.reduced && tier < TIERS.length - 1 && now - start > 2500 && dt < 250) {
        acc += dt;
        n++;
        if (acc > 1000) {
          if (acc / n > 19) {
            tier++;
            setDpr(Math.min(window.devicePixelRatio || 1, TIERS[tier]));
          }
          acc = 0;
          n = 0;
        }
      }
      prevBusy = busy;
      last = now;
      invalidate();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [invalidate, setDpr, maxDpr, rig]);
  return null;
}

export default function Sculpture({ rig, onReady }: { rig: Rig; onReady?: () => void }) {
  const narrow = typeof window !== "undefined" && window.innerWidth < 760;
  const count = narrow ? 186 : 264;

  return (
    <Canvas
      aria-hidden="true"
      dpr={1}
      frameloop="demand"
      camera={{ fov: BASE_FOV, position: [0, 0, 14], near: 0.1, far: 60 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        onReady?.();
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Scheduler rig={rig} maxDpr={2} />
      <World rig={rig} count={count} />
    </Canvas>
  );
}
