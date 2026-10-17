// Adapted from React Bits (MIT): TextType. Single pass with a human cadence (pauses on punctuation).
// All glyphs are laid out up front and revealed by opacity, so centred lines never shift while typing.
"use client";

import { useEffect, useRef } from "react";
import styles from "../n2.module.css";

type Props = { text: string; delay?: number; min?: number; max?: number; className?: string };

export default function Typewriter({ text, delay = 0, min = 16, max = 46, className }: Props) {
  const root = useRef<HTMLSpanElement>(null);
  const words = text.split(" ");

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const cells = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-c]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cells.forEach((c) => (c.style.opacity = "1"));
      return;
    }
    cells.forEach((c) => (c.style.opacity = "0"));
    let i = 0;
    let t = 0;
    let prev: HTMLSpanElement | null = null;
    const step = () => {
      const c = cells[i];
      c.style.opacity = "1";
      prev?.removeAttribute("data-caret");
      c.setAttribute("data-caret", "");
      prev = c;
      i += 1;
      if (i >= cells.length) {
        t = window.setTimeout(() => prev?.removeAttribute("data-caret"), 2600);
        return;
      }
      const ch = c.textContent ?? "";
      let d = min + Math.random() * (max - min);
      if (ch === "," || ch === ":") d += 160;
      if (ch === ".") d += 380;
      if (cells[i].dataset.ws !== undefined) d += 20;
      t = window.setTimeout(step, d);
    };
    t = window.setTimeout(step, delay);
    return () => window.clearTimeout(t);
  }, [text, delay, min, max]);

  return (
    <span ref={root} className={`${styles.typed} ${className ?? ""}`}>
      <span className={styles.srOnly}>{text}</span>
      <span aria-hidden="true">
        {words.map((w, wi) => (
          <span key={wi}>
            <span className={styles.word}>
              {Array.from(w).map((ch, ci) => (
                <span key={ci} data-c data-ws={ci === 0 ? "" : undefined} className={styles.tChar}>
                  {ch}
                </span>
              ))}
            </span>
            {wi < words.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </span>
  );
}
