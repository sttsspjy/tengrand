// Adapted from React Bits (MIT) — TextPressure: per-letter response to cursor proximity.
// Reworked to drive transform only: letters near the cursor stretch, lean back in 3D and turn away from it.
"use client";

import { useEffect, useRef } from "react";
import { useFitText } from "./useFitText";
import s from "../v5.module.css";

type Props = { text: string; href: string; className?: string };

export default function PressureLink({ text, href, className }: Props) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  useFitText(textRef);
  const chars = Array.from(text);

  useEffect(() => {
    const link = linkRef.current!;
    const spans = Array.from(link.querySelectorAll<HTMLSpanElement>("[data-ch]"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const cur = spans.map(() => 0);
    let centers: number[] = [];
    let radius = 200;
    let px = -1e4;
    let active = false;
    let sweep = -1; // performance.now() start of a keyboard-focus sweep
    let raf = 0;

    const measure = () => {
      centers = spans.map((sp) => {
        const r = sp.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      const box = link.getBoundingClientRect();
      radius = Math.max(120, box.width * 0.16);
    };

    const loop = (now: number) => {
      let x = px;
      if (sweep > 0) {
        const t = (now - sweep) / 1400;
        const box = link.getBoundingClientRect();
        x = box.left - radius + t * (box.width + radius * 2);
        if (t >= 1) sweep = -1;
      }
      let moving = false;
      for (let i = 0; i < spans.length; i++) {
        const d = (x - centers[i]) / radius;
        const target = active || sweep > 0 ? Math.max(0, 1 - d * d) : 0;
        const v = cur[i] + (target - cur[i]) * 0.16;
        if (Math.abs(v - cur[i]) > 0.0005 || Math.abs(target - v) > 0.002) moving = true;
        cur[i] = v;
        const lean = Math.max(-1, Math.min(1, d)) * v;
        spans[i].style.transform =
          v < 0.001
            ? ""
            : `perspective(6em) rotateX(${(-v * 34).toFixed(2)}deg) rotateY(${(lean * 22).toFixed(2)}deg) scaleY(${(1 + v * 0.7).toFixed(4)}) translateY(${(-v * 0.04).toFixed(4)}em)`;
      }
      raf = moving || active || sweep > 0 ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onEnter = (e: PointerEvent) => {
      measure();
      active = true;
      px = e.clientX;
      wake();
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      wake();
    };
    const onLeave = () => {
      active = false;
      wake();
    };
    const onFocus = () => {
      if (!link.matches(":focus-visible")) return;
      measure();
      sweep = performance.now();
      wake();
    };
    link.addEventListener("pointerenter", onEnter);
    link.addEventListener("pointermove", onMove);
    link.addEventListener("pointerleave", onLeave);
    link.addEventListener("focus", onFocus);
    return () => {
      cancelAnimationFrame(raf);
      link.removeEventListener("pointerenter", onEnter);
      link.removeEventListener("pointermove", onMove);
      link.removeEventListener("pointerleave", onLeave);
      link.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <a ref={linkRef} href={href} className={`${s.pressure} ${className ?? ""}`}>
      <span ref={textRef} className={s.pressureText} aria-hidden="true">
        {chars.map((c, i) => (
          <span key={i} data-ch className={s.pressureCh}>
            {c}
          </span>
        ))}
      </span>
      <span className={s.srOnly}>Email {text}</span>
    </a>
  );
}
