"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { scene as S } from "./state";
import {
  ACID,
  BLACK,
  E,
  KEYS,
  O2,
  O3,
  PAPER,
  POSE_FIELDS,
  POSE_KEYS,
  RED,
  actParams,
  clamp01,
  expoOut,
  ramp,
  smooth,
  type Pose,
} from "./timeline";

const BASE_FOV = 35;
const TIERS = [1.5, 1.25, 1, 0.8]; // adaptive DPR steps (down only)
const WALL_LEN = 44;
const RING_R = 3.3;

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const V = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

// ───────────── camera path ─────────────
const camCurve = new THREE.CatmullRomCurve3(
  KEYS.map((k) => V(k.p)),
  false,
  "centripetal"
);
const camQuats = KEYS.map((k) => {
  const m = new THREE.Matrix4().lookAt(V(k.p), V(k.t), V(k.up ?? [0, 1, 0]));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (k.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), k.roll));
  return q;
});

function evalCam(u: number, p: THREE.Vector3, q: THREE.Quaternion) {
  const n = KEYS.length;
  let k = 0;
  while (k < n - 2 && u >= KEYS[k + 1].u) k++;
  const a = KEYS[k];
  const b = KEYS[k + 1];
  const t = clamp01((u - a.u) / (b.u - a.u));
  camCurve.getPoint((k + t) / (n - 1), p);
  const te = 0.5 * (t + smooth(t));
  q.slerpQuaternions(camQuats[k], camQuats[k + 1], te);
  return {
    spin: (a.spin ?? 0) + ((b.spin ?? 0) - (a.spin ?? 0)) * t,
    fogN: a.fogN + (b.fogN - a.fogN) * t,
    fogF: a.fogF + (b.fogF - a.fogF) * t,
  };
}

function evalPose(u: number, out: Pose) {
  let k = 0;
  while (k < POSE_KEYS.length - 2 && u >= POSE_KEYS[k + 1].u) k++;
  const a = POSE_KEYS[k];
  const b = POSE_KEYS[k + 1];
  const f = smooth((u - a.u) / (b.u - a.u));
  for (const key of POSE_FIELDS) out[key] = a.p[key] + (b.p[key] - a.p[key]) * f;
}

// ───────────── slat material ─────────────
function makeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.46, metalness: 0 });
  const uniforms = {
    uInkY: { value: -14 },
    uEdge: { value: 0 },
    uAcid: { value: 0 },
    uLeft: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uRed: { value: new THREE.Color(RED) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aEnergy;
        varying vec3 vSlat; varying vec3 vSlatN; varying vec3 vWPos; varying float vEnergy;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vSlat = position; vSlatN = normal; vEnergy = aEnergy;
        vWPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uInkY; uniform float uEdge; uniform float uAcid; uniform vec3 uRed;
        uniform float uLeft; uniform vec2 uRes;
        varying vec3 vSlat; varying vec3 vSlatN; varying vec3 vWPos; varying float vEnergy;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float ink = smoothstep(uInkY + 0.3, uInkY - 0.3, vWPos.y);
        float ao = mix(0.42, 1.0, smoothstep(-0.5, 0.25, vSlat.x));
        ao *= mix(0.78, 1.0, smoothstep(0.36, 0.18, abs(vSlat.z)));
        vec3 porcelain = vec3(0.93, 0.915, 0.88) * ao;
        vec3 obsidian = mix(vec3(0.012, 0.011, 0.011), vec3(0.006), uAcid);
        diffuseColor.rgb = mix(porcelain, obsidian, ink);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.46, mix(0.2, 0.32, uAcid), ink);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec3 sn = normalize(vSlatN);
        float side = pow(1.0 - abs(sn.y), 2.0);
        float seam = 1.0 - smoothstep(0.0, 0.14, abs(vWPos.y - uInkY));
        float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
        float hot = ink * (1.0 - uAcid);
        float quiet = mix(1.0, mix(0.12, 1.0, smoothstep(0.38, 0.66, gl_FragCoord.x / uRes.x)), uLeft);
        totalEmissiveRadiance += uRed * quiet * (side * uEdge * hot * 1.25 + fres * 0.1 * uEdge * hot + seam * 1.6 * step(uInkY, 200.0));
        totalEmissiveRadiance += uRed * vEnergy * (0.12 + side) * mix(0.45, 1.4, ink * (1.0 - uAcid * 0.5));`
      );
  };
  return { m, uniforms };
}

// ───────────── backdrop: act colour field + radial flood ─────────────
const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BG_FRAG = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform vec3 uEdgeC;
uniform float uP; uniform float uAspect; uniform float uTime; uniform vec2 uC; uniform float uVig;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main() {
  vec2 q = (vUv - uC) * vec2(uAspect, 1.0);
  float d = length(q);
  float ang = atan(q.y, q.x);
  float live = step(0.0005, uP) * step(uP, 0.9995);
  float wob = (n(vec2(ang * 2.2 + 7.0, uTime * 0.35)) - 0.5) * 0.1 * live + (n(vec2(ang * 7.0, 3.0)) - 0.5) * 0.012 * live;
  vec2 far = max(abs(uC), abs(1.0 - uC)) * vec2(uAspect, 1.0);
  float R = uP * (length(far) + 0.2);
  float x = d + wob * R;
  float inside = 1.0 - smoothstep(R - 0.003, R + 0.003, x);
  vec3 col = mix(uA, uB, inside);
  float w = 0.012 + 0.016 * uP;
  float band = smoothstep(R - w - 0.003, R - w + 0.003, x) * inside * live;
  col = mix(col, uEdgeC, band);
  vec2 v = vUv - 0.5;
  col *= 1.0 - uVig * dot(v, v);
  gl_FragColor = vec4(col, 1.0);
}`;

const srgb = (hex: string) => new THREE.Color(hex).convertLinearToSRGB();

function Backdrop({ uniforms }: { uniforms: Record<string, THREE.IUniform> }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BG_VERT,
        fragmentShader: BG_FRAG,
        uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    [uniforms]
  );
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={-1000} />;
}

type Wave = { i0: number; t0: number; amp: number };

function World({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const { scene, camera, size } = useThree();

  const geo = useMemo(() => {
    const g = new RoundedBoxGeometry(1, 0.085, 0.72, 1, 0.03);
    g.setAttribute("aEnergy", new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    return g;
  }, [count]);
  const { m: mat, uniforms: matU } = useMemo(makeMaterial, []);
  const bgU = useMemo(
    () => ({
      uA: { value: srgb(PAPER) },
      uB: { value: srgb(BLACK) },
      uEdgeC: { value: srgb(RED) },
      uP: { value: 0 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uC: { value: new THREE.Vector2(0.5, 0.5) },
      uVig: { value: 0 },
    }),
    []
  );

  useEffect(() => {
    scene.fog = new THREE.Fog(PAPER, 9, 19);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);

  const T = useMemo(() => {
    const mk = () => Array.from({ length: count }, () => new THREE.Vector3());
    const mq = () => Array.from({ length: count }, () => new THREE.Quaternion());
    return {
      hp: mk(), hq: mq(), hs: mk(),
      wp: mk(), wq: mq(), ws: mk(),
      rp: mk(), rq: mq(), rs: mk(),
      fp: mk(), fq: mq(), fs: mk(),
      seed: Array.from({ length: count }, (_, i) => [hash(i + 1), hash(i * 3.1 + 7), hash(i * 7.7 + 2), hash(i * 1.9 + 11), hash(i * 5.3 + 5)]),
      hov: new Float32Array(count),
      proj: new Float32Array(count * 2),
      energy: new Float32Array(count),
      depth: new Float32Array(count),
      order: Array.from({ length: count }, (_, i) => i),
      mat4: new THREE.Matrix4(),
      X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(),
      r: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3(), v: new THREE.Vector3(),
      q: new THREE.Quaternion(), q2: new THREE.Quaternion(), gq: new THREE.Quaternion(),
      e: new THREE.Euler(),
      camP: new THREE.Vector3(), camQ: new THREE.Quaternion(), fwd: new THREE.Vector3(),
      right: new THREE.Vector3(), up: new THREE.Vector3(),
      qZ90: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      AX: new THREE.Vector3(1, 0, 0), AY: new THREE.Vector3(0, 1, 0), AZ: new THREE.Vector3(0, 0, 1),
      pose: { ...POSE_KEYS[0].p } as Pose,
      cur: { px: 0, py: 0, spin: 0, spinV: 0, tilt: 0, tiltV: 0, edge: 0 },
      waves: [] as Wave[],
      lastChime: performance.now(),
      over: false,
      colA: new THREE.Color(), colB: new THREE.Color(),
      cPaper: new THREE.Color(PAPER), cBlack: new THREE.Color(BLACK), cAcid: new THREE.Color(ACID),
      cWhite: new THREE.Color("#ffffff"), cWarm: new THREE.Color("#aca89f"), cRed: new THREE.Color(RED),
      cDeep: new THREE.Color("#1a0400"), sPaper: srgb(PAPER), sBlack: srgb(BLACK), sAcid: srgb(ACID),
    };
  }, [count]);
  const byDepth = useMemo(() => (a: number, b: number) => T.depth[a] - T.depth[b], [T]);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(delta, 1 / 20);
    const reduced = S.reduced;
    const now = performance.now();
    const time = reduced ? 0 : state.clock.elapsedTime;
    const c = T.cur;
    const cu = S.cu;
    const A = actParams(cu);
    const N = count;

    c.px += (S.px - c.px) * (reduced ? 1 : 1 - Math.exp(-dt * 2.2));
    c.py += (S.py - c.py) * (reduced ? 1 : 1 - Math.exp(-dt * 2.2));
    S.seen.cu = cu;
    S.seen.px = S.px;
    S.seen.py = S.py;

    // Act weights.
    const wI = 1 - ramp(cu, 1.9, 2.25);
    const wII = ramp(cu, 2.8, 3.0) * (1 - ramp(cu, 4.98, 5.15));
    const wIII = ramp(cu, 5.75, 6.0);
    const act = cu < 2.6 ? 1 : cu < 5.48 ? 2 : 3;

    // ── drag spin with inertia, springing back to the nearest symmetric pose ──
    const period = act === 1 ? Math.PI * 2 : act === 2 ? Math.PI : (Math.PI * 4) / N;
    if (S.dragging) {
      const dv = S.dragDX * 0.0065;
      c.spin += dv;
      c.spinV += (dv / dt - c.spinV) * 0.5;
      c.tilt = Math.max(-0.7, Math.min(0.7, c.tilt + S.dragDY * 0.0035));
      c.tiltV = 0;
    } else {
      const target = Math.round(c.spin / period) * period;
      c.spinV += ((target - c.spin) * 2.4 - c.spinV * 1.5) * dt;
      c.spin += c.spinV * dt;
      c.tiltV += (-c.tilt * 5 - c.tiltV * 3.2) * dt;
      c.tilt += c.tiltV * dt;
    }
    S.dragDX = 0;
    S.dragDY = 0;

    // ── camera ──
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const fov = Math.max(BASE_FOV, (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(21.5)) / aspect) * 180) / Math.PI);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const cs = evalCam(cu, T.camP, T.camQ);
    T.right.set(1, 0, 0).applyQuaternion(T.camQ);
    T.up.set(0, 1, 0).applyQuaternion(T.camQ);
    const tunnel = ramp(cu, 2.25, 2.4) * (1 - ramp(cu, 2.85, 3.0));
    const par = reduced ? 0 : 0.32 * (1 - tunnel * 0.8);
    cam.position
      .copy(T.camP)
      .addScaledVector(T.right, c.px * par + Math.sin(time * 0.37) * 0.05)
      .addScaledVector(T.up, -c.py * par * 0.6 + Math.sin(time * 0.29 + 1) * 0.04);
    T.q.setFromAxisAngle(T.AZ, cs.spin);
    cam.quaternion.copy(T.camQ).multiply(T.q);
    cam.updateMatrixWorld();
    S.out.roll = cs.spin;
    S.out.camY = cam.position.y;
    T.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const fog = scene.fog as THREE.Fog;
    fog.near = cs.fogN;
    fog.far = cs.fogF;

    // ── act colours: backdrop, fog, lights, material ──
    let floodP: number;
    if (cu < 4) {
      floodP = A.flood1;
      bgU.uA.value.copy(T.sPaper);
      bgU.uB.value.copy(T.sBlack);
      bgU.uC.value.set(0.5, 0.5);
      fog.color.copy(T.cPaper).lerp(T.cBlack, A.flood1);
    } else {
      floodP = A.flood2;
      bgU.uA.value.copy(T.sBlack);
      bgU.uB.value.copy(T.sAcid);
      T.v.set(E[0], E[1], E[2]).project(cam);
      bgU.uC.value.set(T.v.x * 0.5 + 0.5, T.v.y * 0.5 + 0.5);
      fog.color.copy(T.cBlack).lerp(T.cAcid, A.flood2);
    }
    bgU.uP.value = floodP;
    bgU.uAspect.value = aspect;
    bgU.uTime.value = time;
    bgU.uVig.value = 0.25 * wII + 0.12 * wIII;
    S.out.floodX = bgU.uC.value.x;
    S.out.floodY = bgU.uC.value.y;

    c.edge += (A.edge - c.edge) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
    matU.uEdge.value = c.edge;
    matU.uAcid.value = A.acid;
    // Capabilities (desktop): edges behind the index columns go quiet, the slab side stays hot.
    matU.uLeft.value = aspect > 1 ? ramp(cu, 3.04, 3.2) * (1 - ramp(cu, 3.84, 4.0)) : 0;
    matU.uRes.value.set(state.gl.domElement.width, state.gl.domElement.height);

    const kL = ramp(-cam.position.y, 9, 18); // below the ink line
    const kA = A.acid;
    if (hemi.current && key.current && fill.current) {
      const h = hemi.current;
      h.intensity = 2.55 * (1 - kL) + 0.22 * kL * (1 - kA) + 2.1 * kA;
      h.color.copy(T.cWhite);
      h.groundColor.copy(T.cWarm).lerp(T.cDeep, kL).lerp(T.cAcid, kA);
      const k = key.current;
      k.intensity = 1.9 * (1 - kL) + 0.8 * kL * (1 - kA) + 1.6 * kA;
      k.position.set(-4 + c.px * 5, 6 - c.py * 4, 5);
      const f = fill.current;
      f.color.copy(T.cWhite).lerp(T.cRed, kL * (1 - kA)).lerp(T.cAcid, kA);
      f.intensity = 0.7 * (1 - kL) + 2.2 * kL * (1 - kA) + 1.3 * kA;
      // Act II: the red light rakes from behind/below so faces stay black and edges catch the glow.
      const back = kL * (1 - kA);
      f.position.set(5 + c.px * 3 * kL, -2 - 4 * back - c.py * 3 * kL, 4 - 9 * back);
    }

    // ── strikes: map queued screen points to the nearest slat ──
    if (!reduced) {
      while (S.strikes.length) {
        const s = S.strikes.shift()!;
        let best = -1;
        let bd = Infinity;
        for (let i = 0; i < N; i++) {
          const dx = T.proj[i * 2] - s.x;
          const dy = T.proj[i * 2 + 1] - s.y;
          const d = dx * dx + dy * dy;
          if (d < bd) (bd = d), (best = i);
        }
        if (best >= 0) {
          T.waves.push({ i0: best, t0: now, amp: s.amp });
          if (T.waves.length > 6) T.waves.shift();
        }
      }
      // Idle chime: an unprompted soft strike hints that the sculpture is playable.
      if (now - S.lastInput > 7000 && now - T.lastChime > 6500 && S.introAt > 0 && now - S.introAt > 4000) {
        T.lastChime = now;
        T.waves.push({ i0: Math.floor(hash(now) * N), t0: now, amp: 0.24 });
      }
    } else S.strikes.length = 0;
    for (let w = T.waves.length - 1; w >= 0; w--) if (now - T.waves[w].t0 > 4500) T.waves.splice(w, 1);

    // ── forms ──
    const P = T.pose;
    evalPose(Math.min(cu, 2.95), P);
    const introT = S.introAt < 0 ? 0 : reduced ? 9 : (now - S.introAt) / 1000;
    const span = P.T * Math.PI * 2;
    const calm = 1 - tunnel;
    T.e.set(
      P.rx + (c.py * 0.12 + c.tilt) * wI,
      (c.px * 0.22 + Math.sin(time * 0.11) * 0.14) * calm,
      P.rz + Math.sin(time * 0.21) * 0.03 * calm
    );
    T.gq.setFromEuler(T.e);
    const needHelix = cu < 3.04;
    const needWall = cu > 2.84 && cu < 6.05;
    const needRing = cu > 5.38;
    const ringQ = T.q2.setFromEuler(T.e.set(0.32 + c.py * 0.14 + c.tilt * wIII, -0.6 + c.px * 0.22, 0.05));
    const ringSpin = time * 0.06 + c.spin * 0.5;

    const mx = S.mx;
    const my = S.my;
    const hovTwist = 0.55 * wI + 1.35 * wII + 0.3 * wIII;
    const hovPush = 0.12 * wI + 0.55 * wIII;
    const kh = reduced ? 1 : 1 - Math.exp(-dt * 7);
    let hovMoving = false;
    let anyOver = false;

    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const sd = T.seed[i];

      // hover response from last frame's projected position
      const sx = T.proj[i * 2];
      const sy = T.proj[i * 2 + 1];
      const dx = sx - mx;
      const dy = sy - my;
      const f2 = Math.exp(-(dx * dx + dy * dy) / (150 * 150));
      const fx = Math.exp(-(dx * dx) / (130 * 130));
      const ht = mx < -9000 ? 0 : fx * wII + f2 * (1 - wII);
      const hv = T.hov[i] + (ht - T.hov[i]) * kh;
      if (Math.abs(hv - T.hov[i]) > 0.002) hovMoving = true;
      T.hov[i] = hv;
      if (dx * dx + dy * dy < 60 * 60) anyOver = true;

      // helix
      if (needHelix) {
        const u0 = t - 0.5;
        const th = u0 * span + time * 0.07 + c.spin * wI;
        const cth = Math.cos(th);
        const sth = Math.sin(th);
        T.p.set(P.R * cth, u0 * P.H, P.R * sth);
        T.Y.set(-P.R * sth * span, P.H, P.R * cth * span).normalize();
        T.r.set(cth, 0, sth);
        T.b.crossVectors(T.Y, T.r).normalize();
        const breath = reduced ? 0 : Math.sin(time * 0.55 + t * 5.5) * 0.16;
        const phi = P.tw * u0 + breath;
        T.X.copy(T.r).multiplyScalar(Math.cos(phi)).addScaledVector(T.b, Math.sin(phi));
        T.Z.crossVectors(T.X, T.Y);
        const a = expoOut(clamp01((introT - 0.15 - Math.abs(u0) * 1.3) / 1.1));
        const len = P.L * (0.92 + 0.08 * Math.sin(t * 19.0)) * a;
        T.p.addScaledVector(T.X, len * P.off);
        T.p.y += (1 - a) * 0.6;
        T.mat4.makeBasis(T.X, T.Y, T.Z);
        T.hq[i].setFromRotationMatrix(T.mat4).premultiply(T.gq);
        T.hp[i].copy(T.p).multiplyScalar(P.s).applyQuaternion(T.gq).add(T.v.set(P.x, P.y, P.z));
        T.hs[i].set(Math.max(len, 0.0001) * P.s, Math.max(a, 0.0001) * P.s, P.w * P.s);
      }

      // blade wall (Act II)
      if (needWall) {
        const x = (t - 0.5) * WALL_LEN;
        const h = 3.0 + 0.9 * Math.sin(t * 13 + time * 0.45) * Math.sin(t * 5.1 - time * 0.21) + sd[0] * 0.5;
        const phi = 0.42 + 0.22 * Math.sin(time * 0.6 + t * 9) + c.spin * (0.45 + 0.55 * hv) * (1 - wIII);
        T.wp[i].set(O2[0] + x, O2[1] - 1.7 + h * 0.5, O2[2] + (sd[1] - 0.5) * 0.4);
        T.q.setFromAxisAngle(T.AY, phi);
        T.wq[i].copy(T.q).multiply(T.qZ90);
        T.ws[i].set(h, 1, 1.15);
      }

      // ring (Act III)
      if (needRing) {
        const th = t * Math.PI * 2 + ringSpin;
        const cth = Math.cos(th);
        const sth = Math.sin(th);
        const R = RING_R + 0.18 * Math.sin(th * 3 + time * 0.7);
        T.X.set(cth, sth, 0);
        const beta = 0.95 + 0.15 * Math.sin(th * 2 - time * 0.5);
        T.Y.set(-sth * Math.sin(beta), cth * Math.sin(beta), Math.cos(beta));
        T.Z.crossVectors(T.X, T.Y);
        T.mat4.makeBasis(T.X, T.Y, T.Z);
        T.rq[i].setFromRotationMatrix(T.mat4).premultiply(ringQ);
        T.rp[i].set(cth * R, sth * R, 0).applyQuaternion(ringQ).add(T.v.set(O3[0], O3[1], O3[2]));
        T.rs[i].set(1.9 + 0.25 * sd[2], 1, 1.3);
      }

      // combine forms
      const fp = T.fp[i];
      const fq = T.fq[i];
      const fs = T.fs[i];
      if (cu < 2.86) {
        fp.copy(T.hp[i]);
        fq.copy(T.hq[i]);
        fs.copy(T.hs[i]);
      } else if (cu < 3.02) {
        // unroll from the centre outward
        const f = smooth((A.peel - Math.abs(t - 0.5) * 0.8) / 0.6);
        fp.lerpVectors(T.hp[i], T.wp[i], f);
        fp.y += Math.sin(f * Math.PI) * (0.6 + sd[2] * 1.2);
        fp.z += Math.sin(f * Math.PI) * (sd[3] - 0.3) * 1.5;
        fq.slerpQuaternions(T.hq[i], T.wq[i], f);
        fs.lerpVectors(T.hs[i], T.ws[i], f);
      } else if (cu < 5.42) {
        fp.copy(T.wp[i]);
        fq.copy(T.wq[i]);
        fs.copy(T.ws[i]);
      } else {
        const f = smooth((A.form - sd[4] * 0.45) / 0.55);
        fp.lerpVectors(T.wp[i], T.rp[i], f);
        fq.slerpQuaternions(T.wq[i], T.rq[i], f);
        fs.lerpVectors(T.ws[i], T.rs[i], f);
        if (f >= 1) {
          fp.copy(T.rp[i]);
          fq.copy(T.rq[i]);
        }
      }

      // shatter: radial scatter with tumble, plus slow-motion drift
      if (A.scatter > 0.0001) {
        const Sx = A.scatter;
        T.v.set(fp.x - E[0], (sd[0] - 0.5) * 2.6, (sd[1] - 0.35) * 2.4);
        T.v.x = T.v.x * 0.4 + (sd[2] - 0.5) * 2.5;
        T.v.normalize();
        const dist = (2.5 + sd[3] * 5.5) * Sx;
        fp.addScaledVector(T.v, dist);
        fp.y += Math.sin(time * 0.6 + sd[0] * 6) * 0.25 * Sx;
        T.r.set(sd[1] - 0.5, sd[2] - 0.5, sd[3] - 0.5).normalize();
        T.q.setFromAxisAngle(T.r, Sx * (2 + sd[4] * 5) + time * 0.15 * Sx);
        fq.premultiply(T.q);
      }
      if (A.tremble > 0.0001) {
        const tr = A.tremble * 0.08;
        fp.x += Math.sin(time * 41 + sd[0] * 40) * tr;
        fp.y += Math.sin(time * 37 + sd[1] * 40) * tr;
      }

      // strike waves: twist about the slat's long axis and push along its normal
      let tw = 0;
      let en = 0;
      for (let w = 0; w < T.waves.length; w++) {
        const W = T.waves[w];
        let d = Math.abs(i - W.i0);
        if (cu > 5.7) d = Math.min(d, N - d);
        const ta = (now - W.t0) / 1000 - d / 70;
        if (ta > 0) {
          const env = Math.exp(-ta * 2.4) * W.amp;
          tw += env * Math.sin(ta * 15);
          en += env;
        }
      }
      tw += hv * hovTwist;
      if (Math.abs(tw) > 0.0001) {
        T.q.setFromAxisAngle(T.AX, tw * 0.9);
        fq.multiply(T.q);
      }
      if (hv * hovPush > 0.0001) {
        T.X.set(1, 0, 0).applyQuaternion(fq);
        fp.addScaledVector(T.X, hv * hovPush);
      }
      T.energy[i] = Math.min(1.5, en * 1.6 + hv * 0.35 * wII);

      // project for hover / strike targeting, depth for front-to-back order
      const depth = T.v.subVectors(fp, cam.position).dot(T.fwd);
      T.depth[i] = depth;
      T.p.copy(fp).project(cam);
      const behind = depth < 0.4;
      T.proj[i * 2] = behind ? -1e5 : (T.p.x * 0.5 + 0.5) * size.width;
      T.proj[i * 2 + 1] = behind ? -1e5 : (0.5 - T.p.y * 0.5) * size.height;
    }

    T.order.sort(byDepth);
    const en = geo.getAttribute("aEnergy") as THREE.InstancedBufferAttribute;
    const ea = en.array as Float32Array;
    let energyLive = false;
    for (let j = 0; j < N; j++) {
      const i = T.order[j];
      T.mat4.compose(T.fp[i], T.fq[i], T.fs[i]);
      m.setMatrixAt(j, T.mat4);
      ea[j] = T.energy[i];
      if (T.energy[i] > 0.01) energyLive = true;
    }
    m.instanceMatrix.needsUpdate = true;
    en.needsUpdate = true;

    if (anyOver !== T.over) {
      T.over = anyOver;
      S.out.over = anyOver;
      S.onOver?.(anyOver);
    }

    const spinning = S.dragging || Math.abs(c.spinV) > 0.002 || Math.abs(c.tilt) > 0.002 || Math.abs(c.tiltV) > 0.002;
    S.settled =
      Math.abs(S.px - c.px) < 0.004 &&
      Math.abs(S.py - c.py) < 0.004 &&
      !spinning &&
      !hovMoving &&
      !energyLive &&
      T.waves.length === 0 &&
      Math.abs(A.edge - c.edge) < 0.003 &&
      introT > 3;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffffff", "#aca89f", 2.55]} />
      <directionalLight ref={key} position={[-4, 6, 5]} intensity={1.9} />
      <directionalLight ref={fill} position={[5, -1, 4]} intensity={0.7} />
      <Backdrop uniforms={bgU} />
      <instancedMesh ref={mesh} args={[geo, mat, count]} frustumCulled={false} />
    </>
  );
}

function Scheduler({ maxDpr }: { maxDpr: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);

  // frameloop="demand": render every frame while anything moves, ~30fps for idle motion,
  // a single frame per change under reduced motion. Steps DPR down when busy frames average >19ms.
  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, maxDpr));
    let raf = 0;
    let last = 0;
    let prev = performance.now();
    let prevBusy = false;
    let tier = 0;
    let acc = 0;
    let n = 0;
    const start = prev;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - prev;
      prev = now;
      const seen = S.seen;
      const changed = seen.cu !== S.cu || seen.px !== S.px || seen.py !== S.py || S.dragging || S.strikes.length > 0;
      const busy = changed || !S.settled;
      if (!busy && (S.reduced || now - last < 32)) {
        prevBusy = false;
        return;
      }
      if (busy && prevBusy && !S.reduced && tier < TIERS.length - 1 && now - start > 2500 && dt < 250) {
        acc += dt;
        n++;
        if (acc > 1000) {
          if (acc / n > 19) {
            tier++;
            setDpr(Math.min(window.devicePixelRatio || 1, maxDpr, TIERS[tier]));
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
  }, [invalidate, setDpr, maxDpr]);
  return null;
}

export default function Sculpture({ onReady }: { onReady?: () => void }) {
  const narrow = typeof window !== "undefined" && window.innerWidth < 760;
  const count = narrow ? 120 : 168;
  const maxDpr = narrow ? 1.5 : 1.5;

  return (
    <Canvas
      aria-hidden="true"
      dpr={1}
      frameloop="demand"
      camera={{ fov: BASE_FOV, position: [0, 0, 10], near: 0.3, far: 80 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping }}
      onCreated={() => onReady?.()}
      style={{ position: "absolute", inset: 0 }}
    >
      <Scheduler maxDpr={maxDpr} />
      <World count={count} />
    </Canvas>
  );
}
