"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Project } from "@/content/profile";
import { plateFor, W, H } from "../_lib/plates";
import { drawHalftone, plateDensity } from "../_lib/halftone";
import s from "../act3.module.css";

// One riso print (a book's illustration page): teal halftone (canvas), orange engraved linework, black key type.
// Pointer movement pushes the two colour plates out of register; they spring back on leave.

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
    const st = { ...REST, target: { ...REST } };
    let raf = 0;
    let last = 0;
    const apply = () => {
      orangeRef.current!.style.transform = `translate3d(${st.ox.toFixed(2)}px, ${st.oy.toFixed(2)}px, 0)`;
      tealLayer.current!.style.transform = `translate3d(${st.tx.toFixed(2)}px, ${st.ty.toFixed(2)}px, 0)`;
    };
    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000 || 0.016);
      last = now;
      const k = Math.min(1, dt * 9);
      st.ox += (st.target.ox - st.ox) * k;
      st.oy += (st.target.oy - st.oy) * k;
      st.tx += (st.target.tx - st.tx) * k;
      st.ty += (st.target.ty - st.ty) * k;
      apply();
      const d = Math.abs(st.ox - st.target.ox) + Math.abs(st.oy - st.target.oy) + Math.abs(st.tx - st.target.tx) + Math.abs(st.ty - st.target.ty);
      raf = d < 0.1 ? 0 : requestAnimationFrame(loop);
    };
    const kick = () => {
      if (reduced) return;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = sheet.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const my = ((e.clientY - r.top) / r.height) * 2 - 1;
      st.target = { ox: REST.ox + mx * 13, oy: REST.oy + my * 9, tx: REST.tx - mx * 11, ty: REST.ty - my * 8 };
      kick();
    };
    const onLeave = () => {
      st.target = { ...REST };
      kick();
    };
    sheet.addEventListener("pointermove", onMove);
    sheet.addEventListener("pointerleave", onLeave);
    apply();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sheet.removeEventListener("pointermove", onMove);
      sheet.removeEventListener("pointerleave", onLeave);
    };
  }, [art, i]);

  const num = String(i + 1).padStart(2, "0");
  return (
    <div className={s.print} ref={sheetRef} aria-hidden>
      <div className={s.inkTeal} ref={tealLayer}>
        <canvas ref={tealRef} className={s.tealCanvas} />
        <span className={s.tealBar} />
      </div>
      <div className={s.inkOrange} ref={orangeRef}>
        <svg viewBox={`0 0 ${W} ${H}`} className={s.orangeArt} preserveAspectRatio="xMidYMid slice">
          {art.paths.map((pp, k) => (
            <path key={k} d={pp.d} className={pp.dash ? s.oDash : undefined} style={{ strokeWidth: (pp.w ?? 0.8) * (pp.accent ? 3.6 : 2.6) }} />
          ))}
        </svg>
        <span className={s.bigNum}>{num}</span>
      </div>
      <div className={s.inkKey}>
        <p className={s.pTop}>
          <span>{num}</span>
          <span className={s.pRule} />
          <span>{p.year}</span>
        </p>
        <p className={s.pName} style={{ ["--len" as string]: Math.max(p.name.replace(".", "").length, 5) } as React.CSSProperties}>
          {p.name}
        </p>
        <p className={s.pKind}>{p.kind}</p>
        <span className={`${s.reg} ${s.regTL}`} />
        <span className={`${s.reg} ${s.regBR}`} />
      </div>
    </div>
  );
}
