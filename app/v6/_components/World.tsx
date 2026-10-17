"use client";

import { useEffect, useRef } from "react";
import { VERT, FRAG } from "./shader";
import { W, SLABS, SEG, live } from "./timeline";
import { director, onFrame, onMeasure } from "./director";
import styles from "../n2.module.css";

const MAX_SCALE = 0.62;
const NOON_SCALE = 0.62; // salt act (monolith edges are supersampled in the shader)
const MIN_ADAPT = 0.55;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

/** Links without blocking: with KHR_parallel_shader_compile, polls completion once per frame. */
function linkAsync(gl: WebGL2RenderingContext, isAlive: () => boolean): Promise<WebGLProgram> {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
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
  if (!ext) return Promise.resolve().then(finish);
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

/** Fullscreen WebGL2 world; renders the three acts from the timeline state at reduced resolution. */
export default function World() {
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
    });
    if (!gl) {
      host.removeChild(canvas);
      return;
    }

    let alive = true;
    let teardown: (() => void) | null = null;
    linkAsync(gl, () => alive)
      .then((prog) => {
        if (alive) teardown = setup(gl, prog);
      })
      .catch((e) => {
        if (alive) console.warn("[nocturne2] shader unavailable, poster fallback", e);
        canvas.remove();
      });

    return () => {
      alive = false;
      teardown?.();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };

  /** Binds geometry/uniforms and registers the per-frame draw. Returns its teardown. */
  function setup(gl: WebGL2RenderingContext, prog: WebGLProgram): () => void {
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const L = (n: string) => gl.getUniformLocation(prog, n);
    const U = {
      res: L("uRes"),
      time: L("uTime"),
      camP: L("uCamP"),
      camR: L("uCamR"),
      cam2P: L("uCam2P"),
      cam2R: L("uCam2R"),
      w: L("uW"),
      wc: L("uWC"),
      t: L("uT"),
      n1: L("uN1"),
      n2: L("uN2"),
      n3: L("uN3"),
      s1: L("uS1"),
      slab: L("uSlab"),
      d1: L("uD1"),
      d2: L("uD2"),
      rip: L("uRip"),
      ptr: L("uPtr"),
    };
    gl.uniform4fv(U.slab, new Float32Array(SLABS.flat()));

    const mobile = window.matchMedia("(max-width: 760px)").matches;
    let adapt = 1;
    let scale = mobile ? 0.5 : MAX_SCALE;
    // the develop transition renders two worlds at once: drop resolution there
    const baseScale = (g: number) =>
      g > SEG.T2a + 40 && g < SEG.PRINT0 - 30 ? (mobile ? 0.42 : 0.48) : mobile ? 0.5 : g > SEG.SWAP1 + 50 && g < SEG.T2a ? NOON_SCALE : MAX_SCALE;
    let cssW = 0;
    let cssH = 0;
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
      }
    });

    let ema = 16;
    let slowFor = 0;
    let px = 0;

    const unFrame = onFrame((fr) => {
      // adaptive resolution: drop scale if frames run long for ~1s
      ema += (fr.dt * 1000 - ema) * 0.05;
      if (ema > 21 && fr.time > 3) {
        slowFor += fr.dt;
        if (slowFor > 1 && adapt > MIN_ADAPT) {
          adapt = Math.max(MIN_ADAPT, adapt * 0.82);
          slowFor = 0;
          ema = 16;
        }
      } else slowFor = 0;
      const want = Math.round(baseScale(fr.g) * adapt * 100) / 100;
      if (want !== scale) {
        scale = want;
        sizeCanvas();
      }
      px += (director.pointerX - px) * (1 - Math.exp(-fr.dt * 1.6));

      const c = W.cam,
        c2 = W.cam2;
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, fr.time + 20.0);
      gl.uniform4f(U.camP, c.x, c.y, c.z, c.F);
      gl.uniform4f(U.camR, c.yaw, c.pitch, c.roll, 0);
      gl.uniform4f(U.cam2P, c2.x, c2.y, c2.z, c2.F);
      gl.uniform4f(U.cam2R, c2.yaw, c2.pitch, c2.roll, 0);
      gl.uniform4fv(U.w, W.w);
      gl.uniform4fv(U.wc, W.wc);
      gl.uniform4fv(U.t, W.t);
      gl.uniform4fv(U.n1, W.n1);
      gl.uniform4fv(U.n2, W.n2);
      gl.uniform4fv(U.n3, W.n3);
      gl.uniform4fv(U.s1, W.s1);
      gl.uniform4fv(U.d1, W.d1);
      gl.uniform4fv(U.d2, W.d2);
      gl.uniform4fv(U.rip, live.ripples);
      gl.uniform2f(U.ptr, px, director.pointerY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!canvas.dataset.on) canvas.dataset.on = "1";
    }, 100);

    const onLost = (e: Event) => e.preventDefault();
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      unFrame();
      unMeasure();
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    };
  }
  }, []);

  return <div ref={holder} className={styles.world} aria-hidden="true" />;
}
