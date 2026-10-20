"use client";

import { useEffect, useRef } from "react";
import { VERT, fragFor } from "./shader";
import { W, SEG, live, evaluate } from "./timeline";
import { director, onFrame, onMeasure, worldState } from "./director";
import { packConstellations } from "./constellations";
import { noiseData, NOISE_N } from "./noise";
import styles from "../n2.module.css";

const MAX_SCALE = 0.6;
const MIN_ADAPT = 0.55;

// Reduced motion: one still frame per act, rendered when the act in view changes.
const POSTER_G = [24, 720, 930, 1095, 1360, 2125, 3060];

const UNIFORMS = [
  "uRes", "uTime", "uCamP", "uCamR", "uSky", "uSky2", "uMoon", "uSun", "uCity", "uWord", "uTrail", "uArr", "uArrP",
  "uLanF", "uLan0", "uLanI", "uStorm", "uStorm2", "uAbove", "uCC", "uCH", "uPost", "uPtr",
] as const;
type Prog = { p: WebGLProgram; u: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null> };

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

/** Starts linking one program; resolves without blocking (KHR_parallel_shader_compile is polled per frame). */
function linkAsync(gl: WebGL2RenderingContext, frag: string, isAlive: () => boolean): Promise<WebGLProgram> {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  const ext = gl.getExtension("KHR_parallel_shader_compile");
  const finish = () => {
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(prog);
      throw new Error(log ?? "link failed");
    }
    return prog;
  };
  if (!ext) return new Promise((resolve, reject) => setTimeout(() => (isAlive() ? resolve(finish()) : reject(new Error("gone")))));
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (!isAlive()) return;
      if (gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR)) {
        try {
          resolve(finish());
        } catch (e) {
          reject(e);
        }
      } else requestAnimationFrame(poll);
    };
    poll();
  });
}

/** Branch (program) that renders an act: city 0, storm 1, above the clouds 2. */
const branchOfAct = (a: number) => (a <= 2 ? 0 : a === 3 ? 1 : 2);

/** Fullscreen WebGL2 world: three scene programs (compiled in parallel, the city first), rendered from
 *  the timeline state at reduced resolution; a second, alpha-blended draw while two scenes cross. */
export default function World({ still = false }: { still?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = holder.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.className = styles.worldCanvas;
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: still,
    });
    if (!gl) {
      host.removeChild(canvas);
      worldState.failed = true;
      return;
    }

    let alive = true;
    const progs: (Prog | null)[] = [null, null, null];

    // shared geometry + noise texture
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NOISE_N, NOISE_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseData());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const cp = packConstellations();

    // all three link in parallel; the city (needed first) is submitted first
    ([0, 1, 2] as const).forEach((scene) => {
      linkAsync(gl, fragFor(scene), () => alive)
        .then((p) => {
          if (!alive) return;
          const L = (n: string) => gl.getUniformLocation(p, n);
          const u = Object.fromEntries(UNIFORMS.map((n) => [n, L(n)])) as Prog["u"];
          gl.useProgram(p);
          gl.uniform1i(L("uNoise"), 0);
          if (scene === 2) {
            gl.uniform4fv(L("uCS"), cp.stars);
            gl.uniform4fv(L("uCL"), cp.segs);
            gl.uniform4fv(L("uCR"), cp.ranges);
          }
          progs[scene] = { p, u };
          if (scene === 0) worldState.ready = true;
        })
        .catch((e) => {
          if (!alive) return;
          console.warn("[nocturne] shader unavailable, poster fallback", e);
          if (scene === 0) {
            worldState.failed = true;
            canvas.remove();
          }
        });
    });

    const mobile = window.matchMedia("(max-width: 760px)").matches;
    let adapt = 1;
    let scale = mobile ? 0.8 : MAX_SCALE;
    // two scenes cross (two draws) under cover: drop resolution there
    const twoPass = (g: number) => (g > SEG.STORM0 && g < SEG.STORM1) || (g > SEG.ABOVE0 && g < SEG.ABOVE1);
    const baseScale = (g: number) => (still ? 0.75 : twoPass(g) ? (mobile ? 0.62 : 0.48) : mobile ? 0.8 : MAX_SCALE);
    let cssW = 0;
    let cssH = 0;
    let lastPoster = -1;
    const sizeCanvas = () => {
      const w = Math.max(2, Math.round(cssW * scale));
      const h = Math.max(2, Math.round(cssH * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const unMeasure = onMeasure(() => {
      const r = canvas.getBoundingClientRect();
      if (Math.abs(r.width - cssW) > 1 || Math.abs(r.height - cssH) > 120) {
        cssW = r.width;
        cssH = r.height;
        sizeCanvas();
        if (still) lastPoster = -1;
      }
    });

    /** One draw of scene `pg` through pass `k`'s camera and lantern. */
    const drawPass = (pg: Prog, k: number, time: number) => {
      const u = pg.u;
      const c = k === 0 ? W.cam : W.cam2;
      const lan = k === 0 ? W.lan0 : W.lan1;
      gl.useProgram(pg.p);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, time + 20.0);
      gl.uniform4f(u.uCamP, c.x, c.y, c.z, c.F);
      gl.uniform4f(u.uCamR, c.yaw, c.pitch, c.roll, 0);
      gl.uniform4fv(u.uSky, W.sky);
      gl.uniform4fv(u.uSky2, W.sky2);
      gl.uniform4fv(u.uMoon, W.moon);
      gl.uniform4fv(u.uSun, W.sun);
      gl.uniform4fv(u.uCity, W.city);
      gl.uniform4fv(u.uWord, W.word);
      gl.uniform4fv(u.uTrail, live.trail);
      gl.uniform4fv(u.uArr, W.arr);
      gl.uniform4fv(u.uArrP, W.arrP);
      gl.uniform4fv(u.uLanF, W.lanF);
      gl.uniform4fv(u.uLan0, lan);
      gl.uniform4f(u.uLanI, k === 0 ? W.lanI[0] : W.lanI[1], 0, W.lanI[2], W.lanI[3]);
      gl.uniform4fv(u.uStorm, W.storm);
      gl.uniform4fv(u.uStorm2, W.storm2);
      gl.uniform4fv(u.uAbove, W.above);
      gl.uniform4fv(u.uCC, W.cc);
      gl.uniform4fv(u.uCH, W.ch);
      gl.uniform4fv(u.uPost, W.post);
      gl.uniform2f(u.uPtr, director.pointerX, director.pointerY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    /** Draws the current frame; false if the needed program is not linked yet. */
    const draw = (time: number) => {
      const p0 = progs[W.b[0]];
      const w1 = W.b[2];
      const p1 = w1 > 0.001 ? progs[W.b[1]] : null;
      if (!p0 && !p1) return false;
      if (p0) drawPass(p0, 0, time);
      if (p1) {
        if (p0) {
          gl.enable(gl.BLEND);
          gl.blendColor(0, 0, 0, w1);
          gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
        }
        drawPass(p1, 1, time);
        gl.disable(gl.BLEND);
      }
      return true;
    };

    let ema = 16;
    let slowFor = 0;

    const unFrame = onFrame((fr) => {
      if (still) {
        // static poster of the act nearest the viewport centre
        const a = posterAct();
        if (a === lastPoster || !progs[branchOfAct(a)]) return;
        lastPoster = a;
        evaluate(POSTER_G[a], 6, 0);
        if (a === 3) {
          W.storm[0] = 0.55;
          W.storm[1] = 70;
          W.storm[2] = 90;
          W.storm[3] = 7;
        }
        scale = baseScale(0);
        sizeCanvas();
        if (draw(6)) canvas.dataset.on = "1";
        return;
      }
      // adaptive resolution: drop scale if frames run long for ~1s
      ema += (fr.dt * 1000 - ema) * 0.05;
      if (ema > 21 && fr.time > 3) {
        slowFor += fr.dt;
        if (slowFor > 1 && adapt > MIN_ADAPT) {
          adapt = Math.max(MIN_ADAPT, adapt * 0.85);
          slowFor = 0;
          ema = 16;
        }
      } else slowFor = 0;
      const want = Math.round(baseScale(fr.g) * adapt * 100) / 100;
      if (want !== scale) {
        scale = want;
        sizeCanvas();
      }
      if (draw(fr.time) && !canvas.dataset.on) canvas.dataset.on = "1";
    }, 100);

    const onLost = (e: Event) => e.preventDefault();
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      alive = false;
      unFrame();
      unMeasure();
      canvas.removeEventListener("webglcontextlost", onLost);
      progs.forEach((pg) => pg && gl.deleteProgram(pg.p));
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(tex);
      worldState.ready = false;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [still]);

  return <div ref={holder} className={styles.world} aria-hidden="true" />;
}

/** Act whose section is nearest the viewport centre (reduced-motion document flow). */
function posterAct() {
  const mid = window.innerHeight * 0.5;
  let found = 0;
  document.querySelectorAll<HTMLElement>("[data-poster]").forEach((el) => {
    if (el.getBoundingClientRect().top <= mid) found = Math.max(found, Number(el.dataset.poster) || 0);
  });
  return found;
}
