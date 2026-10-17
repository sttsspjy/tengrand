// Link whose letters ride a slow travelling wave while hovered or keyboard-focused.
// The wave fades in and out gradually and swells around the cursor; it drives transform only.
"use client";

import { useEffect, useRef } from "react";
import { useFitText } from "./useFitText";
import s from "../v5.module.css";

type Props = { text: string; href: string; className?: string };

const SPEED = 1.7; // wave phase, rad/s
const STEP = 0.42; // phase offset between neighbouring letters, rad
const RISE = 0.9; // amplitude ease-in time constant, s
const FALL = 1.3; // amplitude ease-out time constant, s
const FOLLOW = 0.45; // cursor-follow time constant, s

export default function WaveLink({ text, href, className }: Props) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  useFitText(textRef);
  const chars = Array.from(text);

  useEffect(() => {
    const link = linkRef.current!;
    const spans = Array.from(link.querySelectorAll<HTMLSpanElement>("[data-ch]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let centers: number[] = [];
    let radius = 300;
    let px = 0; // pointer x
    let sx = 0; // smoothed pointer x
    let pointer = false; // pointer inside (focus waves the whole word evenly)
    let on = false;
    let amp = 0;
    let phase = 0;
    let last = 0;
    let raf = 0;

    const measure = () => {
      centers = spans.map((sp) => {
        const r = sp.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      radius = Math.max(160, link.getBoundingClientRect().width * 0.3);
    };

    const loop = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      amp += ((on ? 1 : 0) - amp) * (1 - Math.exp(-dt / (on ? RISE : FALL)));
      sx += (px - sx) * (1 - Math.exp(-dt / FOLLOW));
      phase += dt * SPEED;
      if (!on && amp < 0.02) {
        for (const sp of spans) sp.style.transform = "";
        amp = 0;
        last = 0;
        raf = 0;
        return;
      }
      for (let i = 0; i < spans.length; i++) {
        const d = (sx - centers[i]) / radius;
        const local = amp * (pointer ? 0.4 + 0.6 * Math.exp(-d * d) : 1);
        const a = phase - i * STEP;
        spans[i].style.transform = `translateY(${(-Math.sin(a) * local * 0.09).toFixed(4)}em) rotate(${(Math.cos(a) * local * 3.2).toFixed(2)}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onEnter = (e: PointerEvent) => {
      measure();
      if (!on || !pointer) sx = e.clientX;
      px = e.clientX;
      pointer = true;
      on = true;
      wake();
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
    };
    const onLeave = () => {
      on = link.matches(":focus-visible");
      pointer = false;
      wake();
    };
    const onFocus = () => {
      if (!link.matches(":focus-visible")) return;
      measure();
      on = true;
      wake();
    };
    const onBlur = () => {
      on = pointer;
      wake();
    };
    link.addEventListener("pointerenter", onEnter);
    link.addEventListener("pointermove", onMove);
    link.addEventListener("pointerleave", onLeave);
    link.addEventListener("focus", onFocus);
    link.addEventListener("blur", onBlur);
    return () => {
      cancelAnimationFrame(raf);
      link.removeEventListener("pointerenter", onEnter);
      link.removeEventListener("pointermove", onMove);
      link.removeEventListener("pointerleave", onLeave);
      link.removeEventListener("focus", onFocus);
      link.removeEventListener("blur", onBlur);
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
