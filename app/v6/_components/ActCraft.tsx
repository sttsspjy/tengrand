"use client";

import { useRef } from "react";
import { craft, chapters } from "@/content/profile";
import { useRides } from "./useRides";
import type { Ride, RideInfo } from "./rig";
import { SEG, W, CHAPTERS, STRIKE_G } from "./timeline";
import { smooth } from "./camera";
import styles from "../n2.module.css";

const TOTAL = String(CHAPTERS.length).padStart(2, "0");
const ROMAN = ["i", "ii", "iii"];

/** Craft: three phrases, three scenes on the ascent — the city answering the pointer (top-down),
 *  a sky of lanterns breathing together (looking up), and a storm whose lightning speaks the words. */
export default function ActCraft() {
  const planes = useRef<(HTMLDivElement | null)[]>([]);

  useRides(() => {
    const out: (Ride | null)[] = [];
    const [pa, pb, pc] = planes.current;
    if (pa)
      out.push({
        el: pa,
        g0: SEG.D0 + 12,
        g1: SEG.D1 - 10,
        gin: SEG.D0 - 30,
        gout: SEG.D1 + 22,
        sx: 0.075,
        sy: 0.1,
        ax: 0,
        ay: 0,
        d: 7,
        m: { sx: 0.06, sy: 0.08 },
        swing: -30,
        tilt: 20,
        rollK: 1,
      });
    if (pb) {
      const acc = pb.querySelector<HTMLElement>("[data-acc]");
      const sub = pb.querySelector<HTMLElement>("[data-sub]");
      let last = -1;
      out.push({
        el: pb,
        g0: SEG.E0,
        g1: SEG.E1 - 12,
        gin: SEG.E0 - 40,
        gout: SEG.E1 + 8,
        sx: 0.5,
        sy: 0.5,
        ax: 0.5,
        ay: 0.5,
        d: 7,
        m: { sy: 0.46 },
        tilt: -26,
        rollK: 1,
        on: () => {
          const b = Math.round(W.breath * 200) / 200;
          if (b === last) return;
          last = b;
          if (acc) acc.style.transform = `scale(${(0.97 + b * 0.06).toFixed(4)})`;
          if (sub) sub.style.opacity = (0.55 + b * 0.45).toFixed(3);
        },
      });
    }
    if (pc) {
      const groups = Array.from(pc.querySelectorAll<HTMLElement>("[data-strike]"));
      const lastO = groups.map(() => -1);
      let lastF = -1;
      out.push({
        el: pc,
        g0: SEG.F0,
        g1: SEG.F1 - 8,
        gin: SEG.F0 - 30,
        gout: SEG.F1 + 8,
        sx: 0.5,
        sy: 0.47,
        ax: 0.5,
        ay: 0.5,
        d: 7,
        m: { sy: 0.45 },
        rollK: 1,
        on: (i: RideInfo) => {
          groups.forEach((el, k) => {
            const gs = STRIKE_G[Math.min(k, STRIKE_G.length - 1)] + (k >= STRIKE_G.length ? 14 : 0);
            const o = smooth(gs - 1, gs + 3, i.g);
            if (Math.abs(o - lastO[k]) > 0.01) {
              lastO[k] = o;
              el.style.opacity = o.toFixed(3);
              el.style.transform = `scale(${(1.08 - 0.08 * o).toFixed(4)})`;
            }
          });
          const f = Math.round(Math.min(1, W.storm[0]) * 50) / 50;
          if (f !== lastF) {
            lastF = f;
            pc.style.setProperty("--fl", String(f));
          }
        },
      });
    }
    return out;
  });

  return (
    <section id="craft" className={styles.act} data-world="craft" data-poster="1" aria-labelledby="craft-title">
      <h2 id="craft-title" className={styles.srOnly}>
        {chapters.craft}
      </h2>
      {craft.map((c, i) => (
        <div
          key={c.id}
          ref={(n) => void (planes.current[i] = n)}
          className={`${styles.plane} ${styles.pCraft}`}
          data-craft={c.id}
          data-poster={i === 0 ? undefined : i === 1 ? 2 : 3}
          data-focus-g={[720, 930, 1120][i]}
        >
          <p className={styles.label}>
            <span>
              03 <span className={styles.labelDim}>/ {TOTAL}</span>
            </span>
            <span>
              {chapters.craft} <span className={styles.labelDim}>· {ROMAN[i]}</span>
            </span>
          </p>
          {c.id === "louder" ? (
            <p className={styles.craftLine}>
              <span data-strike className={styles.strike}>
                {c.before}
              </span>{" "}
              <em data-strike className={`${styles.strike} ${styles.craftAcc}`}>
                {c.accent}
              </em>{" "}
              <span data-strike className={styles.strike}>
                {c.after}
              </span>
            </p>
          ) : (
            <p className={styles.craftLine}>
              {c.before}{" "}
              <em data-acc className={styles.craftAcc}>
                {c.accent}
              </em>
              {c.after ? ` ${c.after}` : null}
            </p>
          )}
          {c.sub ? (
            <p data-sub data-strike={c.id === "louder" ? "" : undefined} className={styles.craftSub}>
              {c.sub}
            </p>
          ) : null}
          {c.hint ? (
            <p className={styles.craftHint}>
              <span className={styles.hintDot} aria-hidden="true" />
              {c.hint}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
