"use client";

import { useEffect, useRef } from "react";
import { chapters, type Phrase } from "@/content/profile";
import { registerPart, sub, easeInOut, easeOut, lerp, type Frame } from "../../_lib/stage";
import { fontsOf } from "../../_lib/seal";
import { T, localU } from "./timeline";
import { Marble } from "./marble";
import s from "../../craft.module.css";

// G · alive: a marbling (ebru) tray on the manuscript desk. The camera arrives at a grazing angle,
// cranes up to top-down, and the pointer combs the ink; afterwards it dives into a dark ring of ink.

const DEPTH = 26;

export default function Marbling({ p }: { p: Phrase }) {
  const sceneRef = useRef<HTMLElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = sceneRef.current!;
    const rig = rigRef.current!;
    const tray = trayRef.current!;
    const ground = groundRef.current!;
    const canvas = canvasRef.current!;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const m = new Marble(canvas, fontsOf(scene), p);
    if (!m.ok) scene.dataset.nogl = "";
    let alive = true;
    document.fonts.ready.then(() => alive && m.refreshText());

    let on = false;
    let size = { vw: 0, vh: 0, W: 0, H: 0, dpr: 1 };
    let settled = false;
    let lastKey = "";
    let lastInput = -1e9;
    let hint = false;
    let slow = 0;
    let dprCap = 1.5;
    const last = { x: 0, y: 0, ok: false };

    const layout = (vw: number, vh: number, mobile: boolean) => {
      const W = Math.round(vw * (mobile ? 0.9 : 0.9));
      const H = Math.round(vh * (mobile ? 0.7 : 0.82));
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      size = { vw, vh, W, H, dpr };
      tray.style.width = `${W}px`;
      tray.style.height = `${H}px`;
      scene.style.setProperty("--W", `${W}px`);
      scene.style.setProperty("--H", `${H}px`);
      scene.style.setProperty("--D", `${DEPTH}px`);
      ground.style.left = `${-W * 1.6}px`;
      ground.style.top = `${-H * 4}px`;
      ground.style.width = `${W * 4.2}px`;
      ground.style.height = `${H * 6.5}px`;
      m.resize(W, H, dpr);
      lastKey = "";
    };

    const onMove = (e: PointerEvent) => {
      if (!on || !settled || e.pointerType === "touch") return;
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = 1 - (e.clientY - r.top) / r.height;
      if (last.ok && x > -0.05 && x < 1.05 && y > -0.05 && y < 1.05) {
        const dx = x - last.x;
        const dy = y - last.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.0004) m.input(x, y, dx, dy);
        lastInput = performance.now();
      }
      last.x = x;
      last.y = y;
      last.ok = true;
    };
    const onDown = (e: PointerEvent) => {
      if (!on || !settled) return;
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = 1 - (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      // a tap drops a little swirl
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        m.input(x + Math.cos(a) * 0.02, y + Math.sin(a) * 0.03, -Math.sin(a) * 0.012, Math.cos(a) * 0.012);
      }
      lastInput = performance.now();
    };
    // build the pattern ahead of the scene so entering it costs no shader work
    const pre = window.setTimeout(() => {
      if (!size.vw) layout(window.innerWidth, window.innerHeight, window.innerWidth < 820);
    }, 1200);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    const un = registerPart("craft-g", {
      update: (f: Frame) => {
        const u = localU(f);
        const vis = u > -0.75 && u < T.dive[1] + 0.02;
        if (vis !== on) {
          on = vis;
          scene.toggleAttribute("data-on", vis);
          last.ok = false;
        }
        if (!vis) return;
        if (size.vw !== f.vw || size.vh !== f.vh) layout(f.vw, f.vh, f.mobile);
        const { W, H, vw, vh } = size;

        // camera: grazing rush toward the tray → crane up to top-down → dive into the ink ring
        const a = easeOut(sub(u, T.gIn[0], T.gIn[1]));
        const b = easeInOut(sub(u, T.gTilt[0], T.gTilt[1]));
        const d = sub(u, T.dive[0], T.dive[1]);
        const fit = Math.min((vw * 0.97) / (W + 36), ((vh - 80) * 1) / (H + 36), 1.04);
        let tilt = f.reduced ? lerp(30, 0, b) : lerp(lerp(76, 70, a), 0, b);
        let sc = lerp(lerp(f.mobile ? 1.15 : 1.5, f.mobile ? 1.05 : 1.2, a), fit, b);
        let cx = W / 2;
        let cy = H / 2 + lerp(lerp(H * 3.1, H * 0.55, a), 0, b) + (f.mobile ? 0 : 10) * b;
        let rot = 0;
        if (d > 0 && !f.reduced) {
          const e = easeInOut(d);
          const ez = Math.pow(d, 2.2);
          // target: the dark ring just below the cream centre
          const tx = W * 0.5;
          const ty = H * (f.mobile ? 0.9 : 0.89);
          cx = lerp(cx, tx, e);
          cy = lerp(cy, ty, e);
          sc = fit * Math.pow(42, ez);
          rot = 38 * e;
          tilt = 14 * Math.sin(Math.PI * e);
        }
        const key = `${tilt.toFixed(2)}|${sc.toFixed(4)}|${cx.toFixed(1)}|${cy.toFixed(1)}|${rot.toFixed(2)}|${vw}|${vh}`;
        if (key !== lastKey || f.fresh) {
          lastKey = key;
          rig.style.transform = `translate3d(${vw / 2}px, ${vh / 2}px, 0) rotateX(${tilt.toFixed(3)}deg) rotateZ(${rot.toFixed(3)}deg) scale(${sc.toFixed(5)}) translate3d(${(-cx).toFixed(2)}px, ${(-cy).toFixed(2)}px, 0)`;
        }
        settled = u > T.gTilt[1] - 0.04 && u < T.dive[0] + 0.08;
        const h = settled && !coarse;
        if (h !== hint) {
          hint = h;
          scene.toggleAttribute("data-hint", h);
        }

        // fluid: drift when idle or on touch, nothing automatic for reduced motion
        const now = performance.now();
        const calm = sub(u, T.gTilt[0], T.gTilt[1]);
        const drift = f.reduced ? 0 : (coarse ? (f.mobile ? 0.55 : 1) : now - lastInput > 2600 ? 0.8 : 0) * calm;
        const t0 = now;
        m.frame(f.dt || 1 / 60, drift);
        if (performance.now() - t0 > 7) slow++;
        else slow = Math.max(0, slow - 1);
        if (slow > 50 && dprCap > 1) {
          dprCap = 1;
          slow = 0;
          layout(f.vw, f.vh, f.mobile);
        }
      },
    });
    return () => {
      alive = false;
      window.clearTimeout(pre);
      un();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      m.destroy();
    };
  }, [p]);

  return (
    <section className={`${s.scene} ${s.gScene}`} ref={sceneRef} id="craft-alive" data-anchor="craft-alive" aria-labelledby="h-craft">
      <h2 id="h-craft" className={s.mast}>
        <b>2</b> {chapters.craft}
        <span className={s.mastNo}>i / iii</span>
      </h2>
      <p className={s.sr}>
        {p.before} {p.accent}
        {p.after ? ` ${p.after}` : ""}
      </p>
      <div className={s.rig} ref={rigRef} aria-hidden>
        <div className={s.gGround} ref={groundRef} />
        <div className={s.gTray} ref={trayRef}>
          <span className={s.gShadow} />
          <span className={`${s.gSide} ${s.gFront}`} />
          <span className={`${s.gSide} ${s.gLeft}`} />
          <span className={`${s.gSide} ${s.gRight}`} />
          <div className={s.gBath}>
            <canvas ref={canvasRef} className={s.gCanvas} />
            <p className={s.gFallback}>
              {p.before} <em>{p.accent}</em>
            </p>
          </div>
          <span className={s.gRim} />
        </div>
      </div>
      {p.hint && (
        <p className={s.gHint} aria-hidden>
          <span className={s.gHintComb} />
          {p.hint}
        </p>
      )}
    </section>
  );
}
