"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Project } from "@/content/profile";
import { plateFor, W, H } from "../_lib/plates";
import { drawHalftone, plateDensity } from "../_lib/halftone";
import s from "../act3.module.css";

// One riso print: teal halftone (canvas), orange linework (the parent's engraved plate), black key type.
// Hover pushes the two colour layers out of register; drag swings the print on its pin (damped
// pendulum); a click re-pulls it (a registration jolt). Physics runs in its own rAF only while moving.

const REST = { ox: 3, oy: -2, tx: -2.5, ty: 2 };

export default function Poster({ p, i }: { p: Project; i: number }) {
  const art = useMemo(() => plateFor(p.id, p.name), [p.id, p.name]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const tealRef = useRef<HTMLCanvasElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const tealLayer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = tealRef.current!;
    const dens = plateDensity(art.paths, W, H);
    const cx = [0.3, 0.55, 0.75, 0.45][i % 4];
    const cy = [0.55, 0.45, 0.35, 0.5][i % 4];
    const field = (u: number, v: number) => {
      const d = Math.hypot((u - cx) * 1.4, v - cy);
      return Math.max(0, 0.62 - d * 1.2) + dens(u, v) * 0.55;
    };
    const paint = () => drawHalftone(cv, field, "#0b8a8c", Math.max(5, cv.offsetWidth / 58), 15 + i * 7, 0.7);
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(cv);

    const sheet = sheetRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const st = { th: 0, om: 0, ...REST, target: { ...REST }, drag: null as null | { id: number; x0: number; cx0: number; L: number; lastTh: number; t: number } };
    let raf = 0;
    let last = 0;
    const apply = () => {
      sheet.style.transform = `rotate(${st.th.toFixed(3)}deg)`;
      orangeRef.current!.style.transform = `translate3d(${st.ox.toFixed(2)}px, ${st.oy.toFixed(2)}px, 0)`;
      tealLayer.current!.style.transform = `translate3d(${st.tx.toFixed(2)}px, ${st.ty.toFixed(2)}px, 0)`;
    };
    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000 || 0.016);
      last = now;
      if (!st.drag) {
        const acc = -42 * st.th - 2.6 * st.om;
        st.om += acc * dt;
        st.th += st.om * dt;
      }
      const k = Math.min(1, dt * 9);
      st.ox += (st.target.ox - st.ox) * k;
      st.oy += (st.target.oy - st.oy) * k;
      st.tx += (st.target.tx - st.tx) * k;
      st.ty += (st.target.ty - st.ty) * k;
      apply();
      const settled =
        !st.drag &&
        Math.abs(st.th) < 0.02 &&
        Math.abs(st.om) < 0.05 &&
        Math.abs(st.ox - st.target.ox) + Math.abs(st.oy - st.target.oy) + Math.abs(st.tx - st.target.tx) + Math.abs(st.ty - st.target.ty) < 0.1;
      if (settled) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (reduced) {
        st.th = 0;
        Object.assign(st, st.target);
        apply();
        return;
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = sheet.getBoundingClientRect();
      if (st.drag && e.pointerId === st.drag.id) {
        const dx = e.clientX - st.drag.x0;
        const th = (Math.atan2(dx, st.drag.L) * 180) / Math.PI;
        const now = performance.now();
        const dts = Math.max(0.008, (now - st.drag.t) / 1000);
        st.om = (th - st.drag.lastTh) / dts;
        st.th = Math.max(-34, Math.min(34, th));
        st.drag.lastTh = st.th;
        st.drag.t = now;
        kick();
        return;
      }
      if (e.pointerType !== "mouse") return;
      const mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const my = ((e.clientY - r.top) / r.height) * 2 - 1;
      st.target = { ox: REST.ox + mx * 13, oy: REST.oy + my * 9, tx: REST.tx - mx * 11, ty: REST.ty - my * 8 };
      kick();
    };
    const onLeave = () => {
      if (st.drag) return;
      st.target = { ...REST };
      kick();
    };
    const onDown = (e: PointerEvent) => {
      const r = sheet.getBoundingClientRect();
      const L = Math.max(60, e.clientY - r.top + 20);
      st.drag = { id: e.pointerId, x0: e.clientX - Math.tan((st.th * Math.PI) / 180) * L, cx0: e.clientX, L, lastTh: st.th, t: performance.now() };
      if (e.pointerType === "mouse") sheet.setPointerCapture(e.pointerId);
      sheet.dataset.grab = "";
    };
    const onUp = (e: PointerEvent) => {
      const d = st.drag;
      if (!d || d.id !== e.pointerId) return;
      st.drag = null;
      delete sheet.dataset.grab;
      if (performance.now() - d.t > 120) st.om *= 0.2;
      if (Math.abs(e.clientX - d.cx0) < 4 && Math.abs(st.th) < 1.5) {
        // a click: re-pull the print, knocking the inks out of register
        const j = () => (Math.random() - 0.5) * 30;
        st.ox += j();
        st.oy += j() * 0.6;
        st.tx += j();
        st.ty += j() * 0.6;
        st.om += (Math.random() - 0.5) * 90;
        sheet.animate([{ scale: "1" }, { scale: "0.985" }, { scale: "1" }], { duration: 260, easing: "ease-out" });
      }
      kick();
    };
    sheet.addEventListener("pointermove", onMove);
    sheet.addEventListener("pointerleave", onLeave);
    sheet.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    apply();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sheet.removeEventListener("pointermove", onMove);
      sheet.removeEventListener("pointerleave", onLeave);
      sheet.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [art, i]);

  const num = String(i + 1).padStart(2, "0");
  return (
    <div className={s.poster} data-poster>
      <span className={s.pin} aria-hidden />
      <div className={s.sheet} ref={sheetRef}>
        <div className={s.inkTeal} ref={tealLayer} aria-hidden>
          <canvas ref={tealRef} className={s.tealCanvas} />
          <span className={s.tealBar} />
        </div>
        <div className={s.inkOrange} ref={orangeRef} aria-hidden>
          <svg viewBox={`0 0 ${W} ${H}`} className={s.orangeArt} preserveAspectRatio="xMidYMid slice">
            {art.paths.map((pp, k) => (
              <path key={k} d={pp.d} className={pp.dash ? s.oDash : undefined} style={{ strokeWidth: (pp.w ?? 0.8) * (pp.accent ? 3.6 : 2.6) }} />
            ))}
          </svg>
          <span className={s.bigNum}>{num}</span>
        </div>
        <div className={s.inkKey}>
          <p className={s.pTop} aria-hidden>
            <span>{num}</span>
            <span className={s.pRule} />
            <span>{p.year}</span>
          </p>
          <h3 id={`h-${p.id}`} className={s.pName} style={{ ["--len" as string]: Math.max(p.name.replace(".", "").length, 5) } as React.CSSProperties}>
            {p.name}
          </h3>
          <p className={s.pKind}>{p.kind}</p>
          <span className={`${s.reg} ${s.regTL}`} aria-hidden />
          <span className={`${s.reg} ${s.regBR}`} aria-hidden />
        </div>
      </div>
    </div>
  );
}
