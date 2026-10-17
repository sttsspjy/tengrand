"use client";

import { useEffect, useRef } from "react";
import { ORDER, allParts, anchors, current, onPartsChange, clamp01, type Frame, type Layout, type PartId } from "../_lib/stage";
import { goTo, yFor, getLenis } from "../_lib/scroll";

// Owns the timeline: measures parts, sizes the scroll spacer, maps scrollY to every part each frame,
// toggles act layers and the root's data-act. One rAF loop for the whole page (rAF pauses when hidden).

const FIXED: Partial<Record<PartId, number>> = { t1: 1.75, t2: 2.3 }; // in viewport heights

export default function Director() {
  const spacer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = spacer.current!.closest<HTMLElement>("[data-codex]")!;
    const layers = {
      a1: root.querySelector<HTMLElement>('[data-layer="a1"]'),
      a2: root.querySelector<HTMLElement>('[data-layer="a2"]'),
      a3: root.querySelector<HTMLElement>('[data-layer="a3"]'),
    };
    const prog = root.querySelector<HTMLElement>("[data-progress]");
    const rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = rmq.matches;
    let L: Layout | null = null;
    let vw = 0;
    let vh = 0;
    let mobile = false;
    let dirty = true;
    let fresh = true;
    let raf = 0;
    let last = performance.now();
    let act = "";
    let sec = "";
    let hashDone = false;
    const vis = { a1: true, a2: false, a3: false } as Record<string, boolean>;

    const layout = () => {
      dirty = false;
      fresh = true;
      vw = window.innerWidth;
      vh = window.innerHeight;
      mobile = vw < 820;
      root.toggleAttribute("data-mobile", mobile);
      const lens: Partial<Record<PartId, number>> = {};
      const local: Partial<Record<PartId, Record<string, number>>> = {};
      for (const p of allParts().values()) {
        if (!p.owns || !p.measure) continue;
        const m = p.measure(vw, vh, mobile);
        lens[p.owns] = m.len;
        local[p.owns] = { ...(local[p.owns] ?? {}), ...(m.anchors ?? {}) };
      }
      let acc = 0;
      const out = {} as Layout;
      for (const id of ORDER) {
        const len = Math.round(FIXED[id] != null ? FIXED[id]! * vh : (lens[id] ?? vh));
        out[id] = { start: acc, len };
        acc += len;
      }
      L = out;
      current.layout = out;
      anchors.clear();
      for (const id of ORDER) for (const [k, v] of Object.entries(local[id] ?? {})) anchors.set(k, Math.round(out[id].start + v));
      spacer.current!.style.height = `${acc + vh}px`;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __v7: unknown }).__v7 = {
          layout: out,
          anchors: Object.fromEntries(anchors),
          jump: (y: number) => (getLenis() ? getLenis()!.scrollTo(y, { immediate: true, force: true }) : window.scrollTo(0, y)),
        };
    };

    const setVis = (k: string, on: boolean) => {
      if (vis[k] === on) return;
      vis[k] = on;
      layers[k as "a1"]?.toggleAttribute("data-on", on);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (dirty) layout();
      if (!L) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const y = window.scrollY;
      current.y = y;
      const p1 = clamp01((y - L.t1.start) / L.t1.len);
      const p2 = clamp01((y - L.t2.start) / L.t2.len);
      setVis("a1", y < L.t1.start + L.t1.len * 0.985);
      setVis("a2", y >= L.t1.start - 0.7 * vh && y < L.t2.start + L.t2.len);
      setVis("a3", y >= L.t2.start);
      const a = y < L.t1.start + L.t1.len * 0.55 ? "1" : y < L.t2.start + L.t2.len * 0.3 ? "2" : "3";
      if (a !== act) {
        act = a;
        root.dataset.act = a;
      }
      // chapter for the HUD: the act number, or 4 once the contact station is near
      const contactY = anchors.get("contact");
      const sc = a === "3" && contactY != null && y >= contactY - 0.6 * vh ? "4" : a;
      if (sc !== sec) {
        sec = sc;
        root.dataset.sec = sc;
      }
      const total = L.a3.start + L.a3.len;
      if (prog) prog.style.transform = `scaleX(${clamp01(y / total).toFixed(4)})`;
      const f: Frame = { y, vw, vh, now, dt, reduced, mobile, L, p1, p2, fresh };
      const t0 = performance.now();
      for (const p of allParts().values()) p.update(f);
      fresh = false;
      if (process.env.NODE_ENV !== "production") {
        const st = ((window as unknown as { __v7s?: { n: number; sum: number; max: number } }).__v7s ??= { n: 0, sum: 0, max: 0 });
        const d = performance.now() - t0;
        st.n++;
        st.sum += d;
        st.max = Math.max(st.max, d);
      }
      if (!hashDone) {
        hashDone = true;
        const h = decodeURIComponent(location.hash.slice(1));
        if (h && yFor(h) != null) window.scrollTo({ top: yFor(h)!, behavior: "auto" });
      }
    };

    onPartsChange(() => {
      dirty = true;
    });
    // Mobile URL-bar show/hide changes innerHeight by a little; don't relayout the whole timeline for it.
    const onResize = () => {
      if (window.innerWidth === vw && mobile && Math.abs(window.innerHeight - vh) < 160) return;
      dirty = true;
    };
    const onRm = () => {
      reduced = rmq.matches;
      dirty = true;
    };
    // Keyboard focus inside the stage flies the camera to the element's station.
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      const host = t.closest<HTMLElement>("[data-anchor]");
      const a = host?.dataset.anchor;
      if (!a || !anchors.has(a)) return;
      const y = anchors.get(a)!;
      const span = Number(host!.dataset.span ?? 0) * window.innerHeight;
      const sy = window.scrollY;
      if (sy < y - 4 || sy > y + span + window.innerHeight * 0.4) goTo(a, { flash: false });
    };
    window.addEventListener("resize", onResize);
    rmq.addEventListener("change", onRm);
    root.addEventListener("focusin", onFocus);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      onPartsChange(null);
      window.removeEventListener("resize", onResize);
      rmq.removeEventListener("change", onRm);
      root.removeEventListener("focusin", onFocus);
    };
  }, []);

  return <div ref={spacer} style={{ height: "2600vh" }} aria-hidden />;
}
