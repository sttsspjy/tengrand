"use client";

import { useEffect, useRef } from "react";
import { projects, chapters } from "@/content/profile";
import { isReduced } from "./director";
import { SEG, CHAPTERS, live } from "./timeline";
import { type Ride, type RideInfo } from "./rig";
import { useRides } from "./useRides";
import styles from "../n2.module.css";

const TOTAL = String(CHAPTERS.length).padStart(2, "0");
const pad = (n: number) => String(n).padStart(2, "0");

/** Projects as constellations: the pictograms are drawn in the shader's sky; each project's notes
 *  ride beside its constellation while the camera holds on it. Hovering the notes brightens it. */
export default function ActStars() {
  const title = useRef<HTMLDivElement>(null);
  const notes = useRef<(HTMLElement | null)[]>([]);

  useRides(() => {
    const out: (Ride | null)[] = [];
    if (title.current)
      out.push({
        el: title.current,
        g0: SEG.P_TITLE,
        g1: SEG.CON0 + 12,
        gin: SEG.P_TITLE - 40,
        gout: SEG.CON0 + 44,
        sx: 0.5,
        sy: 0.56,
        ax: 0.5,
        ay: 0.5,
        d: 7,
        m: { sy: 0.6 },
        tilt: 30,
        rollK: 1,
      });
    notes.current.forEach((el, k) => {
      if (!el) return;
      const g0 = SEG.CON0 + k * SEG.CON_LEN;
      let hov = false;
      out.push({
        el,
        g0: g0 + 56,
        g1: g0 + 132,
        gin: g0 + 30,
        gout: g0 + SEG.CON_LEN + 10,
        sx: 0.62,
        sy: 0.22,
        ax: 0,
        ay: 0,
        d: 7,
        m: { sx: 0.06, sy: 0.5 },
        swing: 34,
        drift: 0.04,
        rollK: 1,
        on: (_i: RideInfo) => {
          const h = live.hoverCon === k;
          if (h !== hov) {
            hov = h;
            el.toggleAttribute("data-hover", h);
          }
        },
      });
    });
    return out;
  });

  useEffect(() => {
    if (isReduced()) return;
    const offs = notes.current.map((el, k) => {
      if (!el) return () => {};
      const on = () => (live.hoverCon = k);
      const off = () => {
        if (live.hoverCon === k) live.hoverCon = -1;
      };
      el.addEventListener("pointerenter", on);
      el.addEventListener("pointerleave", off);
      return () => {
        el.removeEventListener("pointerenter", on);
        el.removeEventListener("pointerleave", off);
      };
    });
    return () => offs.forEach((u) => u());
  }, []);

  return (
    <section id="works" className={styles.act} data-world="stars" data-poster="5" aria-labelledby="works-title">
      <div ref={title} className={`${styles.plane} ${styles.pStarTitle}`}>
        <p className={styles.label}>
          <span>
            05 <span className={styles.labelDim}>/ {TOTAL}</span>
          </span>
          <span>
            {pad(projects.length)} {chapters.work}
          </span>
        </p>
        <h2 id="works-title" className={styles.starTitle}>
          {chapters.work}
        </h2>
      </div>

      {projects.map((p, i) => (
        <article
          key={p.id}
          ref={(n) => void (notes.current[i] = n)}
          className={`${styles.plane} ${styles.pNote}`}
          aria-labelledby={`work-${p.id}`}
          data-focus-g={SEG.CON0 + i * SEG.CON_LEN + 100}
        >
          <p className={styles.noteKind}>
            <span>{pad(i + 1)}</span>
            <span>{p.kind}</span>
            <span className={styles.labelDim}>{p.year}</span>
          </p>
          <h3 id={`work-${p.id}`} className={styles.noteName}>
            {p.name}
          </h3>
          <p className={styles.noteDesc}>{p.desc}</p>
          <ul className={styles.noteStack} aria-label="Stack">
            {p.stack.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {p.link ? (
            <a className={styles.noteLink} href={p.link} target="_blank" rel="noreferrer">
              <span>Visit</span>
              <span className={styles.noteUrl}>{p.link.replace(/^https?:\/\//, "")}</span>
              <span aria-hidden="true">↗</span>
            </a>
          ) : p.status ? (
            <p className={styles.noteStatus}>{p.status}</p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
