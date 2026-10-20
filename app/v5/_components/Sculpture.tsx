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
  MORPH,
  O2,
  O3,
  PAPER,
  POSE_FIELDS,
  POSE_KEYS,
  RED,
  actParams,
  breath01,
  buildCraft,
  clamp01,
  craftFlood,
  facadeRise,
  expoOut,
  ramp,
  smooth,
  type Craft,
  type Key,
  type Pose,
} from "./timeline";
import { craft as PHRASES } from "@/content/profile";

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
type Path = { keys: Key[]; curve: THREE.CatmullRomCurve3; quats: THREE.Quaternion[] };
function makePath(keys: Key[]): Path {
  const curve = new THREE.CatmullRomCurve3(
    keys.map((k) => V(k.p)),
    false,
    "centripetal"
  );
  const quats = keys.map((k) => {
    const m = new THREE.Matrix4().lookAt(V(k.p), V(k.t), V(k.up ?? [0, 1, 0]));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    if (k.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), k.roll));
    return q;
  });
  return { keys, curve, quats };
}
const LEGACY = makePath(KEYS);

function evalCam(path: Path, u: number, p: THREE.Vector3, q: THREE.Quaternion) {
  const { keys: KEYS, curve: camCurve, quats: camQuats } = path;
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
// aBack: 0 plain · 1 black back face · 2 red back face · 3 acid edge (B accent ring) · 4 paper rim (C bell).
function makeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.46, metalness: 0 });
  const uniforms = {
    uInkY: { value: -14 },
    uEdge: { value: 0 },
    uAcid: { value: 0 },
    uLeft: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uRed: { value: new THREE.Color(RED) },
    uCraft: { value: 0 }, // craft look: no end-shading
    uFlip: { value: 0 }, // two-tone faces (A)
    uInkAll: { value: 0 }, // everything obsidian (C)
    uAcidC: { value: new THREE.Color(ACID) },
    uCEdge: { value: 0 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aEnergy; attribute float aBack;
        varying vec3 vSlat; varying vec3 vSlatN; varying vec3 vWPos; varying float vEnergy; varying float vBack;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vSlat = position; vSlatN = normal; vEnergy = aEnergy; vBack = aBack;
        vWPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uInkY; uniform float uEdge; uniform float uAcid; uniform vec3 uRed;
        uniform float uLeft; uniform vec2 uRes;
        uniform float uCraft; uniform float uFlip; uniform float uInkAll; uniform vec3 uAcidC; uniform float uCEdge;
        varying vec3 vSlat; varying vec3 vSlatN; varying vec3 vWPos; varying float vEnergy; varying float vBack;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float ink = max(smoothstep(uInkY + 0.3, uInkY - 0.3, vWPos.y), uInkAll);
        float ao = mix(0.42, 1.0, smoothstep(-0.5, 0.25, vSlat.x));
        ao *= mix(0.78, 1.0, smoothstep(0.36, 0.18, abs(vSlat.z)));
        vec3 porcelain = vec3(0.93, 0.915, 0.88) * mix(ao, mix(1.0, ao, 0.35), uCraft);
        float backF = uFlip * smoothstep(-0.2, -0.6, normalize(vSlatN).y) * step(0.5, vBack) * step(vBack, 2.5);
        vec3 backC = mix(vec3(0.016, 0.015, 0.014), uRed * 0.9, step(1.5, vBack));
        porcelain = mix(porcelain, backC, backF);
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
        float hot = ink * (1.0 - uAcid) * (1.0 - uInkAll);
        float quiet = mix(1.0, mix(0.12, 1.0, smoothstep(0.38, 0.66, gl_FragCoord.x / uRes.x)), uLeft);
        totalEmissiveRadiance += uRed * quiet * (side * uEdge * hot * 1.25 + fres * 0.1 * uEdge * hot + seam * 1.6 * step(uInkY, 200.0) * (1.0 - uCraft));
        totalEmissiveRadiance += uRed * vEnergy * (0.12 + side) * mix(0.45, 1.4, ink * (1.0 - uAcid * 0.5));
        totalEmissiveRadiance += uAcidC * uCEdge * step(2.5, vBack) * step(vBack, 3.5) * pow(side, 3.0) * 1.5;
        totalEmissiveRadiance += vec3(0.95, 0.93, 0.88) * uInkAll * step(3.5, vBack) * pow(side, 3.0) * 1.6;`
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

type Wave = { i0: number; t0: number; amp: number; sc: number };

const WHITE_A = "#f5f4f0";

type Light = { hemi: number; ground: THREE.Color; key: number; keyPos: THREE.Vector3; fill: number; fillC: THREE.Color; fillPos: THREE.Vector3 };
const mkLight = (hemi: number, ground: string, key: number, kp: number[], fill: number, fillC: string, fp: number[]): Light => ({
  hemi,
  ground: new THREE.Color(ground),
  key,
  keyPos: V(kp),
  fill,
  fillC: new THREE.Color(fillC),
  fillPos: V(fp),
});

// Per-slat craft assignments: field cell (A), ring slot (B), horn position (C), and the accent-word bitmap.
function craftData(N: number, CR: Craft, narrow: boolean) {
  const { cols, rows } = CR;
  const order = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(hash(i * 17.3 + 4.1) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const L = narrow ? 6 : 8;
  const M = Math.ceil(N / L);
  const col = new Int16Array(N);
  const row = new Int16Array(N);
  const layer = new Int16Array(N);
  const slot = new Int16Array(N);
  const ha = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = order[i] % cols;
    const r = Math.floor(order[i] / cols);
    col[i] = c;
    row[i] = r;
    const cm = c * rows + r; // column-major: neighbouring field columns become neighbouring ring arcs
    layer[i] = cm % L;
    slot[i] = Math.floor(cm / L);
    ha[i] = cm / (N - 1);
  }
  return { col, row, layer, slot, ha, L, M, word: new Uint8Array(N), turns: narrow ? 9 : 11 };
}
type CraftData = ReturnType<typeof craftData>;

// 5×7 flip-dot glyphs (rows top → bottom, '#' = flipped).
const GLYPHS: Record<string, string[]> = {
  "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  "G": [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "I": ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
  "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  ".": ["..", "..", "..", "..", "..", "..", "##"],
  ",": ["..", "..", "..", "..", "..", ".#", "#."],
  "!": ["#", "#", "#", "#", "#", ".", "#"],
  "?": [".###.", "#...#", "....#", "..##.", "..#..", ".....", "..#.."],
  "'": ["#", "#", ".", ".", ".", ".", "."],
  "-": ["...", "...", "...", "###", "...", "...", "..."],
  " ": ["...", "...", "...", "...", "...", "...", "..."],
};

// Writes the accent word onto the field grid in the flip-dot font (rows doubled, stems doubled when `bold`);
// false if it does not fit.
function pixelWord(text: string, CD: CraftData, CR: Craft, bold: boolean) {
  const chars = Array.from(text.toUpperCase());
  if (!chars.every((c) => GLYPHS[c])) return false;
  const sy = 2;
  const bw = bold ? 1 : 0;
  const w = chars.reduce((n, c) => n + GLYPHS[c][0].length + bw, 0) + chars.length - 1;
  if (w > CR.cols || 7 * sy > CR.rows) return false;
  const on = new Set<number>();
  let x = Math.floor((CR.cols - w) / 2);
  const y0 = Math.round((CR.rows - 7 * sy) / 2);
  for (const c of chars) {
    const g = GLYPHS[c];
    g.forEach((line, r) => {
      for (let j = 0; j < line.length; j++)
        if (line[j] === "#")
          for (let k = 0; k < sy; k++) for (let b = 0; b <= bw; b++) on.add((y0 + r * sy + k) * CR.cols + x + j + b);
    });
    x += g[0].length + bw + 1;
  }
  for (let i = 0; i < CD.word.length; i++) CD.word[i] = on.has(CD.row[i] * CR.cols + CD.col[i]) ? 1 : 0;
  return true;
}

// Samples the accent word onto the field grid (cell aspect corrected) and marks the cells it covers.
function sampleWord(text: string, CD: CraftData, CR: Craft, family: string) {
  const { cols, rows, pitchX, pitchZ } = CR;
  const px = 10;
  const pz = (px * pitchZ) / pitchX;
  const w = Math.round(cols * px);
  const h = Math.round(rows * pz);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  let fs = h * 0.72;
  const font = (n: number) => `900 ${n}px ${family}, "Arial Black", Arial, sans-serif`;
  ctx.font = font(fs);
  const mw = ctx.measureText(text).width;
  if (mw > w * 0.9) fs *= (w * 0.9) / mw;
  ctx.font = font(fs);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h * 0.53);
  const img = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < CD.word.length; i++) {
    const x0 = Math.floor(CD.col[i] * px);
    const y0 = Math.floor(CD.row[i] * pz);
    let a = 0;
    let n = 0;
    for (let y = y0 + 1; y < Math.min(h, y0 + pz - 1); y += 2)
      for (let x = x0 + 1; x < Math.min(w, x0 + px - 1); x += 2) {
        a += img[(y * w + x) * 4 + 3];
        n++;
      }
    CD.word[i] = n && a / n > 110 ? 1 : 0;
  }
}

function World({ count, base, narrow }: { count: number; base: number; narrow: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const { scene, camera, size, gl } = useThree();

  const CR = useMemo(() => buildCraft(narrow), [narrow]);
  const CP = useMemo(() => makePath(CR.keys), [CR]);
  const CD = useMemo(() => craftData(count, CR, narrow), [count, CR, narrow]);
  const touch = useMemo(() => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches, []);

  useEffect(() => {
    let live = true;
    const run = () => {
      if (!live) return;
      const fam = getComputedStyle(gl.domElement).getPropertyValue("--v5-sans").trim() || "Arial";
      const t = PHRASES[0].accent;
      if (!pixelWord(t, CD, CR, true) && !pixelWord(t, CD, CR, false)) sampleWord(PHRASES[0].accent.toUpperCase(), CD, CR, fam);
    };
    run();
    document.fonts?.ready.then(run);
    return () => {
      live = false;
    };
  }, [CD, CR, gl]);

  const geo = useMemo(() => {
    const g = new RoundedBoxGeometry(1, 0.085, 0.72, 1, 0.03);
    g.setAttribute("aEnergy", new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    g.setAttribute("aBack", new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
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
    const sceneHex = [PAPER, WHITE_A, BLACK, RED, PAPER];
    return {
      hp: mk(), hq: mq(), hs: mk(),
      wp: mk(), wq: mq(), ws: mk(),
      rp: mk(), rq: mq(), rs: mk(),
      fp: mk(), fq: mq(), fs: mk(),
      lp: mk(), lq: mq(), ls: mk(),
      cp: mk(), cq: mq(), cs: mk(),
      xp: new THREE.Vector3(), xq: new THREE.Quaternion(), xs: new THREE.Vector3(),
      yp: new THREE.Vector3(), yq: new THREE.Quaternion(), ys: new THREE.Vector3(),
      seed: Array.from({ length: count }, (_, i) => [hash(i + 1), hash(i * 3.1 + 7), hash(i * 7.7 + 2), hash(i * 1.9 + 11), hash(i * 5.3 + 5)]),
      hov: new Float32Array(count),
      proj: new Float32Array(count * 2),
      energy: new Float32Array(count),
      back: new Float32Array(count),
      depth: new Float32Array(count),
      order: Array.from({ length: count }, (_, i) => i),
      flipA: new Float32Array(count),
      flipV: new Float32Array(count),
      flipHold: new Float32Array(count),
      pulses: [] as number[],
      lastPulse: 0,
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
      cur: { px: 0, py: 0, spin: 0, spinV: 0, tilt: 0, tiltV: 0, edge: 0, cspin: 0, cspinV: 0 },
      waves: [] as Wave[],
      lastChime: performance.now(),
      over: false,
      colA: new THREE.Color(), colB: new THREE.Color(),
      cPaper: new THREE.Color(PAPER), cBlack: new THREE.Color(BLACK), cAcid: new THREE.Color(ACID),
      cWhite: new THREE.Color("#ffffff"), cWarm: new THREE.Color("#aca89f"), cRed: new THREE.Color(RED),
      cDeep: new THREE.Color("#1a0400"), sPaper: srgb(PAPER), sBlack: srgb(BLACK), sAcid: srgb(ACID),
      sceneS: sceneHex.map(srgb),
      sceneL: sceneHex.map((h) => new THREE.Color(h)),
      edgeS: [RED, ACID, BLACK, BLACK].map(srgb),
      craftEdgeS: [WHITE_A, ACID, BLACK, BLACK].map(srgb),
      lights: [
        mkLight(2.55, "#aca89f", 1.9, [-4, 6, 5], 0.7, "#ffffff", [5, -2, 4]),
        mkLight(1.7, "#b9b5ab", 2.6, [-9, 7, 6], 0.55, "#ffffff", [6, 3, -5]),
        mkLight(0.1, "#000000", 3.6, [7, 8, 3], 1.5, "#ffffff", [-7, -5, -6]),
        mkLight(0.75, "#ff2a00", 2.6, [-5, 8, 6], 1.9, "#ff2a00", [6, -3, 3]),
        mkLight(2.55, "#aca89f", 1.9, [-4, 6, 5], 0.7, "#ffffff", [5, -2, 4]),
      ],
      e1: new THREE.Vector3(0, 1, 0),
      bA: V(CR.aB), bR: V(CR.rB), cA: V(CR.aC), cE2: V(CR.aC).cross(new THREE.Vector3(0, 1, 0)).normalize(),
      vCA: V(CR.CA), vCB: V(CR.CB), vCC: V(CR.CC),
    };
  }, [count, CR]);
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
    const ck = S.ck;
    const craftOn = ck >= 0 && ck <= 3;
    const A = actParams(cu);
    const N = count;
    const NB = base;

    c.px += (S.px - c.px) * (reduced ? 1 : 1 - Math.exp(-dt * 2.2));
    c.py += (S.py - c.py) * (reduced ? 1 : 1 - Math.exp(-dt * 2.2));
    S.seen.cu = cu;
    S.seen.ck = ck;
    S.seen.px = S.px;
    S.seen.py = S.py;
    S.seen.mx = S.mx;
    S.seen.my = S.my;

    // Craft scene: 0 legacy · 1 A field · 2 B ring · 3 C horn.
    const sc = !craftOn ? 0 : ck < MORPH.AB[0] ? 1 : ck < MORPH.BC[0] ? 2 : 3;

    // Act weights.
    const wI = 1 - ramp(cu, 1.9, 2.25);
    const wII = ramp(cu, 2.8, 3.0) * (1 - ramp(cu, 4.98, 5.15));
    const wIII = ramp(cu, 5.75, 6.0);
    const act = cu < 2.6 ? 1 : cu < 5.48 ? 2 : 3;

    // ── drag spin with inertia, springing back to the nearest symmetric pose ──
    if (craftOn) {
      const period = sc === 2 ? (Math.PI * 2) / CD.M : sc === 3 ? (Math.PI * 2 * CD.turns) / N : 0;
      if (S.dragging && period) {
        const dv = S.dragDX * 0.006;
        c.cspin += dv;
        c.cspinV += (dv / dt - c.cspinV) * 0.5;
      } else {
        const target = period ? Math.round(c.cspin / period) * period : 0;
        c.cspinV += ((target - c.cspin) * 2.4 - c.cspinV * 1.5) * dt;
        c.cspin += c.cspinV * dt;
      }
    } else {
      const period = act === 1 ? Math.PI * 2 : act === 2 ? Math.PI : (Math.PI * 4) / NB;
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
    }
    S.dragDX = 0;
    S.dragDY = 0;

    // ── camera ──
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const inside = craftOn ? ramp(ck, 1.08, 1.2) * (1 - ramp(ck, 1.34, 1.52)) + ramp(ck, 2.12, 2.2) * (1 - ramp(ck, 2.3, 2.44)) : 0;
    // Wide lens inside the ring tunnel and the horn throat.
    const fov = Math.max(BASE_FOV, (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(21.5)) / aspect) * 180) / Math.PI) + 30 * inside;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const cs = craftOn ? evalCam(CP, ck, T.camP, T.camQ) : evalCam(LEGACY, cu, T.camP, T.camQ);
    const spin = craftOn ? 0 : cs.spin;
    T.right.set(1, 0, 0).applyQuaternion(T.camQ);
    T.up.set(0, 1, 0).applyQuaternion(T.camQ);
    const tunnel = ramp(cu, 2.25, 2.4) * (1 - ramp(cu, 2.85, 3.0));
    const par = reduced ? 0 : craftOn ? 0.26 * (1 - inside) : 0.32 * (1 - tunnel * 0.8);
    cam.position
      .copy(T.camP)
      .addScaledVector(T.right, c.px * par + Math.sin(time * 0.37) * 0.05)
      .addScaledVector(T.up, -c.py * par * 0.6 + Math.sin(time * 0.29 + 1) * 0.04);
    T.q.setFromAxisAngle(T.AZ, spin);
    cam.quaternion.copy(T.camQ).multiply(T.q);
    cam.updateMatrixWorld();
    S.out.roll = spin;
    S.out.camY = cam.position.y;
    T.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const fog = scene.fog as THREE.Fog;
    fog.near = cs.fogN;
    fog.far = cs.fogF;

    // ── act colours: backdrop, fog, lights, material ──
    let floodP: number;
    const fl = craftOn ? craftFlood(ck) : null;
    if (fl) {
      floodP = fl.p;
      bgU.uA.value.copy(T.sceneS[fl.from]);
      bgU.uB.value.copy(T.sceneS[fl.to]);
      bgU.uEdgeC.value.copy(T.craftEdgeS[fl.i]);
      const ctr = fl.i === 0 ? T.vCA : fl.i === 1 ? T.vCB : T.vCC;
      const d = T.v.subVectors(ctr, cam.position).dot(T.fwd);
      T.v.copy(ctr).project(cam);
      if (d > 0.5) bgU.uC.value.set(Math.min(1.4, Math.max(-0.4, T.v.x * 0.5 + 0.5)), Math.min(1.4, Math.max(-0.4, T.v.y * 0.5 + 0.5)));
      else bgU.uC.value.set(0.5, 0.5);
      fog.color.copy(T.sceneL[fl.from]).lerp(T.sceneL[fl.to], fl.p);
    } else if (cu < 4) {
      floodP = A.flood1;
      bgU.uA.value.copy(T.sPaper);
      bgU.uB.value.copy(T.sBlack);
      bgU.uEdgeC.value.copy(T.edgeS[0]);
      bgU.uC.value.set(0.5, 0.5);
      fog.color.copy(T.cPaper).lerp(T.cBlack, A.flood1);
    } else {
      floodP = A.flood2;
      bgU.uA.value.copy(T.sBlack);
      bgU.uB.value.copy(T.sAcid);
      bgU.uEdgeC.value.copy(T.edgeS[0]);
      T.v.set(E[0], E[1], E[2]).project(cam);
      bgU.uC.value.set(T.v.x * 0.5 + 0.5, T.v.y * 0.5 + 0.5);
      fog.color.copy(T.cBlack).lerp(T.cAcid, A.flood2);
    }
    bgU.uP.value = floodP;
    bgU.uAspect.value = aspect;
    bgU.uTime.value = time;
    const wB = craftOn ? ramp(ck, 1.1, 1.24) * (1 - ramp(ck, 2.0, 2.12)) : 0;
    bgU.uVig.value = 0.25 * wII + 0.12 * wIII + 0.5 * wB;
    S.out.floodX = bgU.uC.value.x;
    S.out.floodY = bgU.uC.value.y;

    c.edge += (A.edge - c.edge) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
    matU.uEdge.value = c.edge;
    matU.uAcid.value = A.acid;
    // Capabilities (desktop): edges behind the index columns go quiet, the slab side stays hot.
    matU.uLeft.value = aspect > 1 ? ramp(cu, 3.04, 3.2) * (1 - ramp(cu, 3.84, 4.0)) : 0;
    matU.uRes.value.set(state.gl.domElement.width, state.gl.domElement.height);
    matU.uCraft.value = craftOn ? ramp(ck, 0.04, 0.3) * (1 - ramp(ck, 2.76, 3.0)) : 0;
    matU.uFlip.value = craftOn ? ramp(ck, 0.05, 0.3) * (1 - ramp(ck, 1.0, 1.18)) : 0;
    matU.uInkAll.value = craftOn ? ramp(ck, 2.0, 2.15) * (1 - ramp(ck, 2.8, 2.97)) : 0;
    matU.uCEdge.value = wB;

    const kL = ramp(-cam.position.y, 9, 18); // below the ink line
    const kA = A.acid;
    if (hemi.current && key.current && fill.current) {
      const h = hemi.current;
      const k = key.current;
      const f = fill.current;
      if (fl) {
        const L0 = T.lights[fl.from];
        const L1 = T.lights[fl.to];
        const lp = fl.p;
        h.intensity = L0.hemi + (L1.hemi - L0.hemi) * lp;
        h.color.copy(T.cWhite);
        h.groundColor.copy(L0.ground).lerp(L1.ground, lp);
        k.intensity = L0.key + (L1.key - L0.key) * lp;
        k.position.lerpVectors(L0.keyPos, L1.keyPos, lp);
        k.position.x += c.px * 3;
        k.position.y -= c.py * 2;
        f.intensity = L0.fill + (L1.fill - L0.fill) * lp;
        f.color.copy(L0.fillC).lerp(L1.fillC, lp);
        f.position.lerpVectors(L0.fillPos, L1.fillPos, lp);
      } else {
        h.intensity = 2.55 * (1 - kL) + 0.22 * kL * (1 - kA) + 2.1 * kA;
        h.color.copy(T.cWhite);
        h.groundColor.copy(T.cWarm).lerp(T.cDeep, kL).lerp(T.cAcid, kA);
        k.intensity = 1.9 * (1 - kL) + 0.8 * kL * (1 - kA) + 1.6 * kA;
        k.position.set(-4 + c.px * 5, 6 - c.py * 4, 5);
        f.color.copy(T.cWhite).lerp(T.cRed, kL * (1 - kA)).lerp(T.cAcid, kA);
        f.intensity = 0.7 * (1 - kL) + 2.2 * kL * (1 - kA) + 1.3 * kA;
        // Act II: the red light rakes from behind/below so faces stay black and edges catch the glow.
        const back = kL * (1 - kA);
        f.position.set(5 + c.px * 3 * kL, -2 - 4 * back - c.py * 3 * kL, 4 - 9 * back);
      }
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
          T.waves.push({ i0: best, t0: now, amp: s.amp, sc });
          if (T.waves.length > 6) T.waves.shift();
          if (sc === 3) T.pulses.push(now);
        }
      }
      // Idle chime: an unprompted soft strike hints that the sculpture is playable.
      if (now - S.lastInput > 7000 && now - T.lastChime > 6500 && S.introAt > 0 && now - S.introAt > 4000) {
        T.lastChime = now;
        T.waves.push({ i0: Math.floor(hash(now) * (sc ? N : NB)), t0: now, amp: sc === 1 ? 1 : 0.24, sc });
      }
      // Horn: a sound pulse runs throat → bell every ~1.7 s, rapid-fire while the camera is blown out.
      if (sc === 3) {
        const gap = ck > 2.24 && ck < 2.5 ? 380 : 1700;
        if (now - T.lastPulse > gap) {
          T.lastPulse = now;
          T.pulses.push(now);
        }
      }
    } else S.strikes.length = 0;
    for (let w = T.waves.length - 1; w >= 0; w--) if (now - T.waves[w].t0 > 4500) T.waves.splice(w, 1);
    while (T.pulses.length && now - T.pulses[0] > 1600) T.pulses.shift();

    // ── forms ──
    const needLegacy = !craftOn || ck < MORPH.inA[1] || ck > MORPH.out[0];
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
    const needHelix = needLegacy && cu < 3.04;
    const needWall = needLegacy && cu > 2.84 && cu < 6.05;
    const needRing = needLegacy && cu > 5.38;
    const ringQ = T.q2.setFromEuler(T.e.set(0.32 + c.py * 0.14 + c.tilt * wIII, -0.6 + c.px * 0.22, 0.05));
    const ringSpin = time * 0.06 + c.spin * 0.5;

    const mx = S.mx;
    const my = S.my;
    const hovTwist = 0.55 * wI + 1.35 * wII + 0.3 * wIII;
    const hovPush = 0.12 * wI + 0.55 * wIII;
    const kh = reduced ? 1 : 1 - Math.exp(-dt * 7);
    let hovMoving = false;
    let anyOver = false;

    // Craft: which forms are live and how far each per-slat morph has run.
    const needA = craftOn && ck < MORPH.AB[1];
    const needB = craftOn && ck > MORPH.AB[0] && ck < MORPH.BC[1];
    const needC = craftOn && ck > MORPH.BC[0];
    const pIn = craftOn ? clamp01((ck - MORPH.inA[0]) / (MORPH.inA[1] - MORPH.inA[0])) : 0;
    const pAB = clamp01((ck - MORPH.AB[0]) / (MORPH.AB[1] - MORPH.AB[0]));
    const pBC = clamp01((ck - MORPH.BC[0]) / (MORPH.BC[1] - MORPH.BC[0]));
    const pOut = clamp01((ck - MORPH.out[0]) / (MORPH.out[1] - MORPH.out[0]));
    const { cols, rows, pitchX, pitchZ, CA, ringR, hornL } = CR;
    const br = reduced ? 0.5 : breath01(now);
    // B starts as a long narrow tunnel around the camera and gathers into the ring as the camera pulls out.
    const gather = craftOn ? ramp(ck, 1.32, 1.6) : 1;
    const spread = 1 + 4.5 * (1 - gather);
    const ringS = 0.6 + 0.4 * gather;
    // A: the flip trail follows the pointer, or a wandering virtual pointer when there is none.
    const realP = !touch && mx > -9000 && now - S.lastMove < 6000;
    const trailX = realP ? mx : size.width * (0.5 + 0.36 * Math.sin(time * 0.43));
    const trailY = realP ? my : size.height * (0.6 + 0.2 * Math.sin(time * 0.71 + 1.3));
    const trailOn = !reduced && sc === 1 && ck > 0.24;
    const trailR2 = (narrow ? 46 : 74) ** 2;
    let craftMoving = false;
    const riseA = craftOn ? (facadeRise(ck) * Math.PI) / 2 : 0;
    const riseS = Math.sin(riseA);
    const riseC = Math.cos(riseA);

    const formA = (i: number, op: THREE.Vector3, oq: THREE.Quaternion, os: THREE.Vector3) => {
      const col = CD.col[i];
      const row = CD.row[i];
      // hinge about the front edge: rows rise into a standing facade facing +z
      const dz = (row - (rows - 1) / 2) * pitchZ - CR.D / 2;
      op.set(CA[0] + (col - (cols - 1) / 2) * pitchX, CA[1] - dz * riseS, CR.frontZ + dz * riseC);
      // flip spring (word cells rest flipped, black side up)
      const rest = CD.word[i] ? Math.PI : 0;
      if (trailOn) {
        const dx = T.proj[i * 2] - trailX;
        const dy = T.proj[i * 2 + 1] - trailY;
        if (dx * dx + dy * dy < trailR2) T.flipHold[i] = now + 420;
      }
      const tgt = rest + (now < T.flipHold[i] ? Math.PI : 0);
      if (reduced) {
        T.flipA[i] = tgt;
        T.flipV[i] = 0;
      } else {
        T.flipV[i] += ((tgt - T.flipA[i]) * 150 - T.flipV[i] * 15) * dt;
        T.flipA[i] += T.flipV[i] * dt;
        if (Math.abs(T.flipV[i]) > 0.01 || Math.abs(tgt - T.flipA[i]) > 0.01) craftMoving = true;
      }
      let ang = T.flipA[i];
      let en = Math.abs(Math.sin(ang - rest)) * 0.9;
      for (let w = 0; w < T.waves.length; w++) {
        const W = T.waves[w];
        if (W.sc !== 1) continue;
        const d = Math.hypot(col - CD.col[W.i0], ((row - CD.row[W.i0]) * pitchZ) / pitchX);
        const ta = (now - W.t0) / 1000 - d / 26;
        if (ta > 0 && ta < 0.6) {
          const f = smooth(ta / 0.55);
          ang += Math.PI * 2 * f;
          en += Math.sin(f * Math.PI) * W.amp;
        }
      }
      const idle = reduced ? 0 : (touch ? 0.32 : 0.16) * Math.sin(time * 1.25 - col * 0.3 - row * 0.2);
      oq.setFromAxisAngle(T.AX, ang + idle + riseA);
      os.set(pitchX * 0.9, 0.8, (pitchZ * 0.86) / 0.72);
      T.energy[i] = en;
      T.back[i] = CD.word[i] ? 1 : 2;
    };

    const formB = (i: number, op: THREE.Vector3, oq: THREE.Quaternion, os: THREE.Vector3) => {
      const L = CD.L;
      const layer = CD.layer[i];
      const th = ((CD.slot[i] + (layer % 2) * 0.5) / CD.M) * Math.PI * 2 + time * 0.035 + c.cspin;
      const uL = (layer - (L - 1) / 2) / ((L - 1) / 2);
      const bulge = 1 - uL * uL;
      const R = (ringR * (1 + 0.075 * (br - 0.5) * 2) + 0.55 * bulge) * ringS;
      const len = 1.6 * (0.55 + 0.45 * bulge) * (0.9 + 0.2 * br) * (0.7 + 0.3 * ringS);
      const hw = (narrow ? 1.5 : 1.95) * (1 + 0.12 * (br - 0.5));
      const ax = uL * hw * spread + hw * (spread - 1);
      let beta = 0.18 + 0.95 * br + 0.16 * Math.sin(th * 3 - time * 1.3);
      let en = 0;
      for (let w = 0; w < T.waves.length; w++) {
        const W = T.waves[w];
        if (W.sc !== 2) continue;
        let d = Math.abs(CD.slot[i] - CD.slot[W.i0]);
        d = Math.min(d, CD.M - d) + Math.abs(layer - CD.layer[W.i0]) * 2;
        const ta = (now - W.t0) / 1000 - d / 45;
        if (ta > 0) {
          const env = Math.exp(-ta * 2.4) * W.amp;
          beta += env * Math.sin(ta * 15) * 1.1;
          en += env;
        }
      }
      const cth = Math.cos(th);
      const sth = Math.sin(th);
      T.r.copy(T.e1).multiplyScalar(cth).addScaledVector(T.bR, sth); // radial
      T.b.copy(T.e1).multiplyScalar(-sth).addScaledVector(T.bR, cth); // tangent
      T.X.copy(T.r);
      T.Z.copy(T.bA).multiplyScalar(Math.cos(beta)).addScaledVector(T.b, Math.sin(beta));
      T.Y.crossVectors(T.Z, T.X);
      T.mat4.makeBasis(T.X, T.Y, T.Z);
      oq.setFromRotationMatrix(T.mat4);
      op.copy(T.vCB).addScaledVector(T.r, R).addScaledVector(T.bA, ax);
      os.set(len, 0.8, 0.62 / 0.72);
      T.energy[i] = en;
      T.back[i] = layer === Math.floor(L / 2) ? 3 : 0;
    };

    const formC = (i: number, op: THREE.Vector3, oq: THREE.Quaternion, os: THREE.Vector3) => {
      const a = CD.ha[i];
      const th = Math.PI * 2 * CD.turns * a + time * 0.12 + c.cspin;
      const r = 0.6 + 2.6 * Math.pow(a, 2.5);
      const dr = 2.6 * 2.5 * Math.pow(a, 1.5);
      let bump = 0;
      for (let k = 0; k < T.pulses.length; k++) {
        const pa = ((now - T.pulses[k]) / 1000) * 0.85;
        const d = a - pa;
        bump += Math.exp(-(d * d) / 0.0035);
      }
      let en = bump * 0.6;
      let tw = 0;
      for (let w = 0; w < T.waves.length; w++) {
        const W = T.waves[w];
        if (W.sc !== 3) continue;
        const d = Math.abs(a - CD.ha[W.i0]) * N;
        const ta = (now - W.t0) / 1000 - d / 70;
        if (ta > 0) {
          const env = Math.exp(-ta * 2.4) * W.amp;
          tw += env * Math.sin(ta * 15);
          en += env;
        }
      }
      const len = (0.32 + 1.15 * a) * (1 + 0.55 * Math.min(1, bump));
      const cth = Math.cos(th);
      const sth = Math.sin(th);
      T.r.copy(T.e1).multiplyScalar(cth).addScaledVector(T.cE2, sth);
      T.b.copy(T.e1).multiplyScalar(-sth).addScaledVector(T.cE2, cth);
      T.X.copy(T.r).addScaledVector(T.cA, -dr / hornL).normalize();
      T.Y.copy(T.b).multiplyScalar(r * Math.PI * 2 * CD.turns).addScaledVector(T.cA, hornL).addScaledVector(T.r, dr);
      T.Y.addScaledVector(T.X, -T.X.dot(T.Y)).normalize();
      T.Z.crossVectors(T.X, T.Y);
      T.mat4.makeBasis(T.X, T.Y, T.Z);
      oq.setFromRotationMatrix(T.mat4);
      if (Math.abs(tw) > 0.0001) oq.multiply(T.q.setFromAxisAngle(T.AX, tw * 0.9));
      op.copy(T.vCC).addScaledVector(T.cA, a * hornL).addScaledVector(T.r, r).addScaledVector(T.X, len * 0.5);
      os.set(len, 0.9, (0.26 + 0.46 * a) / 0.72);
      T.energy[i] = en;
      T.back[i] = a > 0.93 ? 4 : 0; // bell rim catches a paper-white edge light
    };

    // Per-slat morph between two forms: delay d ∈ [0, 0.45], lifted along an arc with a tumble.
    const morph = (
      i: number,
      p: number,
      d: number,
      ap: THREE.Vector3,
      aq: THREE.Quaternion,
      as: THREE.Vector3,
      bp: THREE.Vector3,
      bq: THREE.Quaternion,
      bs: THREE.Vector3,
      lift: number,
      op: THREE.Vector3,
      oq: THREE.Quaternion,
      os: THREE.Vector3
    ) => {
      const f = smooth((p - d) / 0.55);
      const sd = T.seed[i];
      op.lerpVectors(ap, bp, f);
      const arc = Math.sin(f * Math.PI);
      op.y += arc * lift * (0.6 + sd[2]);
      oq.slerpQuaternions(aq, bq, f);
      if (arc > 0.001) {
        T.v.set(sd[1] - 0.5, sd[2] - 0.5, sd[3] - 0.5).normalize();
        oq.premultiply(T.q.setFromAxisAngle(T.v, arc * (1 + sd[4] * 2.5)));
      }
      os.lerpVectors(as, bs, f);
      return f;
    };

    for (let i = 0; i < N; i++) {
      const sd = T.seed[i];
      const fp = T.fp[i];
      const fq = T.fq[i];
      const fs = T.fs[i];
      let legacyE = 0;

      if (needLegacy && i < NB) {
        const t = i / (NB - 1);

        // hover response from last frame's projected position
        const sx = T.proj[i * 2];
        const sy = T.proj[i * 2 + 1];
        const dx = sx - mx;
        const dy = sy - my;
        const f2 = Math.exp(-(dx * dx + dy * dy) / (150 * 150));
        const fx = Math.exp(-(dx * dx) / (130 * 130));
        const ht = mx < -9000 || craftOn ? 0 : fx * wII + f2 * (1 - wII);
        const hv = T.hov[i] + (ht - T.hov[i]) * kh;
        if (Math.abs(hv - T.hov[i]) > 0.002) hovMoving = true;
        T.hov[i] = hv;
        if (!craftOn && dx * dx + dy * dy < 60 * 60) anyOver = true;

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
          if (W.sc !== 0) continue;
          let d = Math.abs(i - W.i0);
          if (cu > 5.7) d = Math.min(d, NB - d);
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
        legacyE = Math.min(1.5, en * 1.6 + hv * 0.35 * wII);
        T.lp[i].copy(fp);
        T.lq[i].copy(fq);
        T.ls[i].copy(fs);
      } else if (needLegacy) {
        // extra slats hide inside their parent helix slat outside the craft
        const pi = i % NB;
        fp.copy(T.lp[pi]);
        fq.copy(T.lq[pi]);
        fs.copy(T.ls[pi]).multiplyScalar(0.0001);
        T.lp[i].copy(fp);
        T.lq[i].copy(fq);
        T.ls[i].copy(fs);
      }
      T.energy[i] = legacyE;
      T.back[i] = 0;

      if (craftOn) {
        const colF = CD.col[i] / (cols - 1);
        // current craft form into cp/cq/cs
        if (needA && !needB) formA(i, T.cp[i], T.cq[i], T.cs[i]);
        else if (needA && needB) {
          formA(i, T.xp, T.xq, T.xs);
          const eA = T.energy[i];
          const bA = T.back[i];
          formB(i, T.cp[i], T.cq[i], T.cs[i]);
          const f = morph(i, pAB, 0.45 * (colF * 0.65 + sd[0] * 0.35), T.xp, T.xq, T.xs, T.cp[i], T.cq[i], T.cs[i], 2.2, T.yp, T.yq, T.ys);
          T.cp[i].copy(T.yp);
          T.cq[i].copy(T.yq);
          T.cs[i].copy(T.ys);
          if (f < 0.5) T.back[i] = bA;
          T.energy[i] = eA * (1 - f) + T.energy[i] * f;
          if (f > 0 && f < 1) craftMoving = true;
        } else if (needB && !needC) formB(i, T.cp[i], T.cq[i], T.cs[i]);
        else if (needB && needC) {
          formB(i, T.xp, T.xq, T.xs);
          formC(i, T.cp[i], T.cq[i], T.cs[i]);
          morph(i, pBC, 0.45 * ((CD.slot[i] / CD.M) * 0.6 + sd[1] * 0.4), T.xp, T.xq, T.xs, T.cp[i], T.cq[i], T.cs[i], 3.0, T.yp, T.yq, T.ys);
          T.cp[i].copy(T.yp);
          T.cq[i].copy(T.yq);
          T.cs[i].copy(T.ys);
        } else formC(i, T.cp[i], T.cq[i], T.cs[i]);

        if (needLegacy && ck < 1) {
          const e = T.energy[i];
          const f = morph(i, pIn, 0.45 * ((1 - colF) * 0.7 + sd[0] * 0.3), T.lp[i], T.lq[i], T.ls[i], T.cp[i], T.cq[i], T.cs[i], 2.6, fp, fq, fs);
          T.energy[i] = legacyE * (1 - f) + e * f;
        } else if (needLegacy) {
          const e = T.energy[i];
          const f = morph(i, pOut, 0.45 * (CD.ha[i] * 0.7 + sd[2] * 0.3), T.cp[i], T.cq[i], T.cs[i], T.lp[i], T.lq[i], T.ls[i], 2.0, fp, fq, fs);
          T.energy[i] = e * (1 - f) + legacyE * f;
        } else {
          fp.copy(T.cp[i]);
          fq.copy(T.cq[i]);
          fs.copy(T.cs[i]);
        }
        if (sc >= 2 && mx > -9000) {
          const dx = T.proj[i * 2] - mx;
          const dy = T.proj[i * 2 + 1] - my;
          if (dx * dx + dy * dy < 50 * 50) anyOver = true;
        }
      }

      // project for hover / strike targeting, depth for front-to-back order
      const depth = T.v.subVectors(fp, cam.position).dot(T.fwd);
      T.depth[i] = depth;
      T.p.copy(fp).project(cam);
      const hidden = depth < 0.4 || (!craftOn && i >= NB);
      T.proj[i * 2] = hidden ? -1e5 : (T.p.x * 0.5 + 0.5) * size.width;
      T.proj[i * 2 + 1] = hidden ? -1e5 : (0.5 - T.p.y * 0.5) * size.height;
    }

    T.order.sort(byDepth);
    const en = geo.getAttribute("aEnergy") as THREE.InstancedBufferAttribute;
    const bk = geo.getAttribute("aBack") as THREE.InstancedBufferAttribute;
    const ea = en.array as Float32Array;
    const ba = bk.array as Float32Array;
    let energyLive = false;
    for (let j = 0; j < N; j++) {
      const i = T.order[j];
      T.mat4.compose(T.fp[i], T.fq[i], T.fs[i]);
      m.setMatrixAt(j, T.mat4);
      ea[j] = T.energy[i];
      ba[j] = T.back[i];
      if (T.energy[i] > 0.01) energyLive = true;
    }
    m.instanceMatrix.needsUpdate = true;
    en.needsUpdate = true;
    bk.needsUpdate = true;

    if (anyOver !== T.over) {
      T.over = anyOver;
      S.out.over = anyOver;
      S.onOver?.(anyOver);
    }

    const spinning =
      S.dragging || Math.abs(c.spinV) > 0.002 || Math.abs(c.tilt) > 0.002 || Math.abs(c.tiltV) > 0.002 || Math.abs(c.cspinV) > 0.002;
    S.settled =
      Math.abs(S.px - c.px) < 0.004 &&
      Math.abs(S.py - c.py) < 0.004 &&
      !spinning &&
      !hovMoving &&
      !energyLive &&
      !craftMoving &&
      !(craftOn && !reduced) &&
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
      const changed =
        seen.cu !== S.cu ||
        seen.ck !== S.ck ||
        seen.px !== S.px ||
        seen.py !== S.py ||
        (S.ck >= 0 && (seen.mx !== S.mx || seen.my !== S.my)) ||
        S.dragging ||
        S.strikes.length > 0;
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
  const base = narrow ? 120 : 168;
  const grid = buildCraft(narrow);
  const count = grid.cols * grid.rows; // one slat per craft field cell; the helix acts use the first `base`
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
      <World count={count} base={base} narrow={narrow} />
    </Canvas>
  );
}
