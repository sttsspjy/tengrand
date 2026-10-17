// Link whose letters swell in weight, one after another, while hovered or keyboard-focused.
// The swell fades in and out gradually; it drives the font's wght axis per letter.
"use client";

import { useEffect, useRef } from "react";
import { useFitText } from "./useFitText";
import s from "../v5.module.css";

type Props = { text: string; href: string; className?: string };

const REST = 800; // wght at rest
const PEAK = 900; // wght at the crest of the swell
const SPEED = 1.1; // swell phase, rad/s
const SPAN = 6; // phase across the whole word, rad
const RISE = 1.1; // amplitude ease-in time constant, s
const FALL = 1.6; // amplitude ease-out time constant, s

export default function BreatheLink({ text, href, className }: Props) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  useFitText(textRef);
  const chars = Array.from(text);

  useEffect(() => {
    const link = linkRef.current!;
    const spans = Array.from(link.querySelectorAll<HTMLSpanElement>("[data-ch]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let hover = false;
    let focus = false;
    let amp = 0;
    let phase = 0;
    let last = 0;
    let raf = 0;

    const loop = (now: number) => {
      const on = hover || focus;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      amp += ((on ? 1 : 0) - amp) * (1 - Math.exp(-dt / (on ? RISE : FALL)));
      phase += dt * SPEED;
      if (!on && amp < 0.01) {
        for (const sp of spans) sp.style.fontVariationSettings = "";
        amp = 0;
        last = 0;
        raf = 0;
        return;
      }
      for (let i = 0; i < spans.length; i++) {
        const k = (Math.sin(phase - ((i + 0.5) / spans.length) * SPAN) * 0.5 + 0.5) * amp;
        spans[i].style.fontVariationSettings = `"wght" ${(REST + (PEAK - REST) * k).toFixed(0)}`;
      }
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onEnter = () => {
      hover = true;
      wake();
    };
    const onLeave = () => {
      hover = false;
      wake();
    };
    const onFocus = () => {
      focus = link.matches(":focus-visible");
      wake();
    };
    const onBlur = () => {
      focus = false;
      wake();
    };
    link.addEventListener("pointerenter", onEnter);
    link.addEventListener("pointerleave", onLeave);
    link.addEventListener("focus", onFocus);
    link.addEventListener("blur", onBlur);
    return () => {
      cancelAnimationFrame(raf);
      link.removeEventListener("pointerenter", onEnter);
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
