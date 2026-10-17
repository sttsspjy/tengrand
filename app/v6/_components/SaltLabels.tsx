"use client";

import { useEffect, useRef } from "react";
import { capabilities } from "@/content/profile";
import { director, onFrame, isReduced } from "./director";
import { W, SLABS, SEG, SHOTS, live } from "./timeline";
import { project } from "./camera";
import { cutToShot } from "./interact";
import styles from "../n2.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

/** Salt noon: capability tags tracked onto each monolith's crown; clicking one cuts to its shot. */
export default function SaltLabels() {
  const root = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isReduced()) return;
    const p = { x: 0, y: 0, d: 0 };
    const q = { x: 0, y: 0, d: 0 };
    const shown = tags.current.map(() => true);
    let on = true;
    let active = -1;
    return onFrame((f) => {
      const want = f.g > SEG.SHOT0 - 20 && f.g < SEG.T2a + 8;
      if (want !== on) {
        on = want;
        root.current?.toggleAttribute("data-on", want);
      }
      if (!want) return;
      const cur = Math.min(5, Math.max(0, Math.floor((f.g - SEG.SHOT0) / SEG.SHOT_LEN)));
      // keep tags off the capability plate while it is readable
      const local = f.g - SEG.SHOT0 - cur * SEG.SHOT_LEN;
      const plateOn = local > 8 && local < 108;
      const left = SHOTS[cur].sx[0] > 0.5;
      const mob = director.mobile;
      for (let i = 0; i < SLABS.length; i++) {
        const el = tags.current[i];
        if (!el) continue;
        const s = SLABS[i];
        project(W.cam, s[0], s[3] + 0.9, s[1], f.vw, f.vh, p);
        project(W.cam, s[0], s[3], s[1], f.vw, f.vh, q);
        let vis = p.d > 1.2 && q.d > 1.2 && p.x > -40 && p.x < f.vw + 40 && p.y > 40 && p.y < f.vh - 30;
        if (vis && plateOn) {
          const nx = p.x / f.vw,
            ny = p.y / f.vh;
          if (mob ? ny > 0.36 : ny > 0.1 && ny < 0.92 && (left ? nx < 0.52 : nx > 0.53)) vis = false;
        }
        if (vis !== shown[i]) {
          shown[i] = vis;
          el.toggleAttribute("data-off", !vis);
        }
        if (!vis) continue;
        const stem = Math.max(10, Math.min(160, q.y - p.y + 18));
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        el.style.setProperty("--stem", `${stem.toFixed(0)}px`);
      }
      if (cur !== active || live.hoverSlab >= -1) {
        if (cur !== active) {
          active = cur;
          tags.current.forEach((t, i) => t?.toggleAttribute("data-now", i === cur));
        }
        tags.current.forEach((t, i) => {
          const h = live.hoverSlab === i;
          if (t && t.hasAttribute("data-hover") !== h) t.toggleAttribute("data-hover", h);
        });
      }
    }, 70);
  }, []);

  return (
    <div ref={root} className={styles.tags} data-on="">
      {capabilities.map((c, i) => (
        <button
          key={c.id}
          type="button"
          ref={(n) => void (tags.current[i] = n)}
          className={styles.tag}
          onClick={() => cutToShot(i)}
          aria-label={`Go to ${c.title}`}
          tabIndex={-1}
        >
          <span className={styles.tagText}>
            <b>{pad(i + 1)}</b> {c.title}
          </span>
        </button>
      ))}
    </div>
  );
}
