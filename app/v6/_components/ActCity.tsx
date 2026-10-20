"use client";

import { useRef } from "react";
import { profile, chapters } from "@/content/profile";
import DecryptedText from "./DecryptedText";
import Typewriter from "./Typewriter";
import { useRides } from "./useRides";
import type { RideInfo } from "./rig";
import { SEG, CHAPTERS } from "./timeline";
import styles from "../n2.module.css";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const TOTAL = String(CHAPTERS.length).padStart(2, "0");

/** Act I, the street canyon: name, role and statement at street level, then the about paragraphs
 *  riding up the facade with the camera. */
export default function ActCity() {
  const name = useRef<HTMLDivElement>(null);
  const role = useRef<HTMLDivElement>(null);
  const statement = useRef<HTMLParagraphElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const vo = useRef<(HTMLDivElement | null)[]>([]);

  useRides(() => {
    const voRides = vo.current.map((el, k) => {
      if (!el) return null;
      const g0 = SEG.VO0 + k * SEG.VO_STEP;
      const words = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-w]"));
      const last = words.map(() => -1);
      return {
        el,
        g0,
        g1: g0 + 52,
        gin: g0 - 70,
        gout: g0 + 98,
        sx: 0.34,
        sy: 0.8,
        ax: 0.5,
        ay: 1,
        d: 7,
        m: { sx: 0.5, sy: 0.9 },
        drift: 0.08,
        swing: k % 2 ? 24 : -24,
        rollK: 0.4,
        on: (i: RideInfo) => {
          const lit = clamp01((i.g - (g0 - 30)) / 66) * (words.length + 2);
          for (let w = 0; w < words.length; w++) {
            const o = 0.14 + 0.86 * clamp01(lit - w);
            if (Math.abs(o - last[w]) > 0.01) {
              last[w] = o;
              words[w].style.opacity = o.toFixed(2);
            }
          }
        },
      };
    });
    return [
      name.current && {
        el: name.current,
        g0: -100,
        g1: 16,
        gin: -100,
        gout: 104,
        sx: 0.075,
        sy: 0.7,
        ax: 0,
        ay: 1,
        d: 9,
        m: { sx: 0.06, sy: 0.6 },
        drift: 0.03,
        rollK: 0.2,
      },
      role.current && {
        el: role.current,
        g0: -100,
        g1: 8,
        gin: -100,
        gout: 80,
        sx: 0.93,
        sy: 0.17,
        ax: 1,
        ay: 0,
        d: 5.5,
        m: { sx: 0.06, ax: 0, sy: 0.13 },
        rollK: 0.2,
      },
      statement.current && {
        el: statement.current,
        g0: -100,
        g1: 30,
        gin: -100,
        gout: 112,
        sx: 0.075,
        sy: 0.89,
        ax: 0,
        ay: 1,
        d: 4.6,
        m: { sx: 0.06, sy: 0.9 },
        rollK: 0.4,
      },
      card.current && {
        el: card.current,
        g0: SEG.CARD - 6,
        g1: SEG.CARD + 34,
        gin: SEG.CARD - 60,
        gout: SEG.CARD + 92,
        sx: 0.075,
        sy: 0.2,
        ax: 0,
        ay: 0,
        d: 9,
        m: { sx: 0.06, sy: 0.18 },
        swing: -30,
        drift: 0.05,
      },
      ...voRides,
    ];
  });

  return (
    <>
      <section id="origin" className={styles.act} data-world="city" data-poster="0" aria-labelledby="origin-title">
        <div ref={name} className={`${styles.plane} ${styles.pName}`}>
          <p className={styles.label}>
            <span>
              01 <span className={styles.labelDim}>/ {TOTAL}</span>
            </span>
            <span>{chapters.intro}</span>
          </p>
          <h1 id="origin-title" className={styles.originName}>
            <DecryptedText text={profile.name} delay={350} speed={90} />
          </h1>
        </div>

        <div ref={role} className={`${styles.plane} ${styles.pRole}`}>
          <p className={styles.roleLine}>
            <em>{profile.role}</em>
          </p>
          <p className={styles.roleAka}>
            {profile.alias} <span className={styles.labelDim}>· {profile.location}</span>
          </p>
        </div>

        <p ref={statement} className={`${styles.plane} ${styles.pStatement}`}>
          <Typewriter text={profile.statement} delay={1500} />
        </p>
      </section>

      <section id="intent" className={styles.act} data-world="city" aria-labelledby="intent-title">
        <div ref={card} className={`${styles.plane} ${styles.pCard}`}>
          <p className={styles.label}>
            <span>
              02 <span className={styles.labelDim}>/ {TOTAL}</span>
            </span>
          </p>
          <h2 id="intent-title" className={styles.cardTitle}>
            {chapters.about}
          </h2>
        </div>

        {profile.about.map((para, k) => (
          <div key={k} ref={(n) => void (vo.current[k] = n)} className={`${styles.plane} ${styles.pVO}`}>
            <p className={styles.speaker} aria-hidden="true">
              {k + 1} / {profile.about.length}
            </p>
            <p className={styles.voText}>
              {para.split(" ").map((w, i) => (
                <span key={i}>
                  <span data-w className={styles.w}>
                    {w}
                  </span>{" "}
                </span>
              ))}
            </p>
          </div>
        ))}
      </section>
    </>
  );
}
