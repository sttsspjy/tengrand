"use client";

import { useEffect, useRef } from "react";
import b from "../base.module.css";

// Entrance arrival "Ink": the gate leaves the screen covered in ink (#1c1a19, the .cover element shown by
// html[data-entry="codex"]). Here that ink is a sheet that turns like a page: a WebGL grid mesh wrapped
// around a moving cylinder from the bottom-right corner (shaded fold, paper-coloured back), revealing the
// hero, whose own letter animation is held until the turn is under way. `?entry` replays it on a direct load.

const VS = `
attribute vec2 aP;
uniform vec2 uSize;
uniform vec2 uN;
uniform float uA;
uniform float uR;
uniform float uD;
varying float vShade;
varying vec2 vUv;
varying float vS;
void main(){
  vec2 p = aP * uSize;
  float s = dot(p, uN) - uA;
  vec2 q = p;
  float z = 0.0;
  vec3 nrm = vec3(0.0, 0.0, 1.0);
  if (s > 0.0) {
    float PI = 3.14159265;
    if (s < PI * uR) {
      float ph = s / uR;
      q = p - uN * s + uN * uR * sin(ph);
      z = uR * (1.0 - cos(ph));
      nrm = vec3(-uN * sin(ph), cos(ph));
    } else {
      q = p - uN * s - uN * (s - PI * uR);
      z = 2.0 * uR;
      nrm = vec3(0.0, 0.0, -1.0);
    }
  }
  // the light comes from the upper left, in front of the screen
  vec3 L = normalize(vec3(-0.45, -0.55, 1.0));
  vShade = dot(nrm, L);
  vUv = aP;
  vS = s;
  // perspective: the page plane z=0 maps exactly onto the viewport; lifted parts come toward the eye
  float k = uD / (uD - z);
  vec2 c = (q - uSize * 0.5) * k;
  gl_Position = vec4(c.x / (uSize.x * 0.5), -c.y / (uSize.y * 0.5), -z / (uD * 2.0), 1.0);
}`;

const FS = `
precision highp float;
varying float vShade;
varying vec2 vUv;
varying float vS;
uniform vec2 uSize;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 px = vUv * uSize;
  float g = hash(floor(px));
  if (gl_FrontFacing) {
    // ink side: near-black with a faint fibre grain; the fold catches a dull sheen
    vec3 ink = vec3(0.110, 0.102, 0.098);
    float sh = clamp(vShade, -1.0, 1.0);
    vec3 c = ink * (0.92 + 0.08 * g) + vec3(0.09, 0.08, 0.07) * smoothstep(0.55, 1.0, sh) * step(0.001, vS);
    c *= mix(1.0, 0.62, smoothstep(0.2, -0.6, sh) * step(0.001, vS));
    gl_FragColor = vec4(c, 1.0);
  } else {
    // paper back: the codex leaf colour, shaded by the curl, with ink soaked through at the rim
    vec3 paper = vec3(0.945, 0.925, 0.882);
    float sh = clamp(-vShade, -1.0, 1.0);
    vec3 c = paper * (0.58 + 0.42 * smoothstep(-0.4, 1.0, sh)) * (0.97 + 0.03 * g);
    float rim = min(min(vUv.x, 1.0 - vUv.x) * uSize.x, min(vUv.y, 1.0 - vUv.y) * uSize.y);
    c = mix(vec3(0.42, 0.39, 0.35), c, smoothstep(0.0, 26.0, rim));
    gl_FragColor = vec4(c, 1.0);
  }
}`;

const SVS = `
attribute vec2 aP;
varying vec2 vP;
void main(){ vP = aP; gl_Position = vec4(aP * 2.0 - 1.0, 0.999, 1.0); vP.y = 1.0 - vP.y; }`;
const SFS = `
precision highp float;
varying vec2 vP;
uniform vec2 uSize;
uniform vec2 uN;
uniform float uA;
uniform float uR;
void main(){
  // soft shadow the lifted sheet casts on the page it uncovers
  float s = dot(vP * uSize, uN) - uA;
  if (s <= 0.0) discard;
  float a = 0.5 * exp(-s / (uR * 1.6));
  gl_FragColor = vec4(0.06, 0.04, 0.02, a);
}`;

const DURATION = 1350;

function compile(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  for (const [t, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(t)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "");
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

/** Plays the page turn on a fresh full-screen canvas; resolves when the sheet is gone. */
function turnPage(cover: HTMLElement, onHalf: () => void, duration = DURATION): Promise<void> {
  return new Promise((done) => {
    const cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    Object.assign(cv.style, { position: "fixed", inset: "0", width: "100vw", height: "100dvh", zIndex: "101", pointerEvents: "none" });
    document.body.appendChild(cv);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true, depth: true });
    if (!gl) {
      cv.remove();
      onHalf();
      cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: "forwards" }).finished.then(() => done());
      return;
    }
    let page: WebGLProgram;
    let shadow: WebGLProgram;
    try {
      page = compile(gl, VS, FS);
      shadow = compile(gl, SVS, SFS);
    } catch {
      cv.remove();
      onHalf();
      cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: "forwards" }).finished.then(() => done());
      return;
    }
    // grid mesh over the unit square
    const NX = 72;
    const NY = Math.max(24, Math.round((NX * H) / W));
    const verts: number[] = [];
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const a = [i / NX, j / NY];
        const b = [(i + 1) / NX, j / NY];
        const c = [(i + 1) / NX, (j + 1) / NY];
        const d = [i / NX, (j + 1) / NY];
        verts.push(...a, ...d, ...c, ...a, ...c, ...b);
      }
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    const n = [1, H / W > 1 ? 0.9 : 0.62];
    const nl = Math.hypot(n[0], n[1]);
    const N = [n[0] / nl, n[1] / nl];
    const R0 = Math.min(W, H) * 0.075;
    const far = W * N[0] + H * N[1];
    const D = H / 2 / Math.tan((28 * Math.PI) / 360);
    const t0 = performance.now();
    let half = false;
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const R = R0 * (1 + 1.4 * e);
      // the fold line sweeps from just outside the bottom-right corner past the top-left corner
      const A = lerpN(far + 2, -Math.PI * R - R * 1.2, e);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(shadow);
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      const sp = gl.getAttribLocation(shadow, "aP");
      gl.enableVertexAttribArray(sp);
      gl.vertexAttribPointer(sp, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(gl.getUniformLocation(shadow, "uSize"), W, H);
      gl.uniform2f(gl.getUniformLocation(shadow, "uN"), N[0], N[1]);
      gl.uniform1f(gl.getUniformLocation(shadow, "uA"), A);
      gl.uniform1f(gl.getUniformLocation(shadow, "uR"), R);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(page);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      const ap = gl.getAttribLocation(page, "aP");
      gl.enableVertexAttribArray(ap);
      gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(gl.getUniformLocation(page, "uSize"), W, H);
      gl.uniform2f(gl.getUniformLocation(page, "uN"), N[0], N[1]);
      gl.uniform1f(gl.getUniformLocation(page, "uA"), A);
      gl.uniform1f(gl.getUniformLocation(page, "uR"), R);
      gl.uniform1f(gl.getUniformLocation(page, "uD"), D);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
      if (cover.style.display !== "none") cover.style.display = "none";
      if (!half && t > 0.42) {
        half = true;
        onHalf();
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        cv.remove();
        done();
      }
    };
    requestAnimationFrame(frame);
  });
}

const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

export default function Arrival() {
  const coverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const html = document.documentElement;
    if (new URLSearchParams(location.search).has("entry")) {
      html.dataset.entry = "codex";
      // debug path: the page already started its intro; rewind the hero's animations so they wait for the turn
      document.querySelectorAll('[data-layer="a1"] *').forEach((el) => el.getAnimations().forEach((a) => (a.currentTime = 0)));
    }
    if (html.dataset.entry !== "codex") return;
    const cover = coverRef.current!;
    cover.style.display = "";
    let alive = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const go = () => {
      html.dataset.inkGo = "";
    };
    const finish = () => {
      html.dataset.codexArrived = "";
      delete html.dataset.inkGo;
      delete html.dataset.entry;
    };
    const ready = Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
    ready.then(() => {
      if (!alive) return;
      // two frames so the hero is laid out and painted under the cover
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!alive) return;
          if (reduced) {
            go();
            cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "ease-out", fill: "forwards" }).finished.then(finish);
            return;
          }
          // `?entry=<ms>` slows the turn down for frame-by-frame probes
          const slow = Number(new URLSearchParams(location.search).get("entry"));
          turnPage(cover, go, slow > 0 ? slow : DURATION).then(finish);
        })
      );
    });
    return () => {
      alive = false;
    };
  }, []);
  return <div ref={coverRef} className={b.cover} aria-hidden />;
}
