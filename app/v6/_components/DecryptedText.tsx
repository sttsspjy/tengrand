// Adapted from React Bits (MIT): DecryptedText. Rewritten to write glyphs straight to the DOM
// (no per-tick React state) and to keep each cell at its final glyph width so nothing reflows.
"use client";

import { useEffect, useRef } from "react";
import { onTitle } from "./director";
import styles from "../n2.module.css";

const POOL = "abcdefghijklmnopqrstuvwxyz0123456789*/";
const FLOOR = 0.14;
const PEAK = 0.7;
const LEAD = 5;

type Props = {
  text: string;
  className?: string;
  /** ms before the sequential reveal starts; null = wait for `play` via ref-less trigger (hover only). */
  delay?: number | null;
  speed?: number; // ms per tick
  /** Re-scramble on hover/focus of the closest focusable ancestor or self. */
  hover?: boolean;
};

export default function DecryptedText({ text, className, delay = 0, speed = 55, hover = false }: Props) {
  const root = useRef<HTMLSpanElement>(null);
  const chars = Array.from(text);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ghosts = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-g]"));
    const reals = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-r]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const n = ghosts.length;
    const revealed = new Array<boolean>(n).fill(delay === null);
    let timer = 0;
    let startT = 0;
    let unTitle = () => {};

    const pick = () => POOL[(Math.random() * POOL.length) | 0];
    const paint = (queuePos: number) => {
      for (let i = 0; i < n; i++) {
        const g = ghosts[i];
        const r = reals[i];
        if (revealed[i]) {
          g.style.opacity = "0";
          r.style.opacity = "1";
        } else {
          g.textContent = pick();
          const rank = i - queuePos;
          const lift = Math.max(0, 1 - rank / LEAD);
          g.style.opacity = String(FLOOR + (PEAK - FLOOR) * lift);
          r.style.opacity = "0";
        }
      }
    };

    const run = (from: number) => {
      window.clearInterval(timer);
      let pos = from;
      for (let i = 0; i < n; i++) revealed[i] = i < pos;
      paint(pos);
      timer = window.setInterval(() => {
        pos += 1;
        for (let i = 0; i < n; i++) revealed[i] = i < pos;
        paint(pos);
        if (pos >= n) window.clearInterval(timer);
      }, speed);
    };

    if (reduced) {
      revealed.fill(true);
      paint(n);
    } else if (delay !== null) {
      for (let i = 0; i < n; i++) revealed[i] = false;
      paint(-LEAD);
      unTitle = onTitle(() => {
        startT = window.setTimeout(() => run(0), delay);
      });
    } else paint(n);

    // hover: brief scramble that resolves left to right
    const host = (el.closest("a,button") as HTMLElement | null) ?? el;
    let busy = false;
    const onEnter = () => {
      if (!hover || reduced || busy) return;
      busy = true;
      let pos = -LEAD;
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        pos += 1;
        for (let i = 0; i < n; i++) revealed[i] = i < pos;
        paint(pos);
        if (pos >= n) {
          window.clearInterval(timer);
          busy = false;
        }
      }, 26);
    };
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("focus", onEnter);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(startT);
      unTitle();
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("focus", onEnter);
    };
  }, [text, delay, speed, hover]);

  return (
    <span ref={root} className={`${styles.decrypt} ${className ?? ""}`} data-intro={delay !== null ? "" : undefined}>
      <span className={styles.srOnly}>{text}</span>
      <span aria-hidden="true">
        {chars.map((c, i) =>
          c === " " ? (
            <span key={i} className={styles.dSpace}>
              {" "}
            </span>
          ) : (
            <span key={i} className={/\d/.test(c) ? `${styles.dCell} ${styles.dDigit}` : styles.dCell}>
              <span data-r className={styles.dReal}>
                {c}
              </span>
              <span data-g className={styles.dGhost}></span>
            </span>
          )
        )}
      </span>
    </span>
  );
}
