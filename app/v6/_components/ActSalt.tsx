"use client";

import { useRef } from "react";
import { capabilities, chapters } from "@/content/profile";
import { useRides } from "./useRides";
import type { RideInfo, Ride } from "./rig";
import { SEG, SHOTS } from "./timeline";
import styles from "../n2.module.css";

const N = capabilities.length;
const WORD = chapters.skills;
const pad = (n: number) => String(n).padStart(2, "0");
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Salt noon: the Skills title hangs in the white, then one capability plate rides with the camera per
 *  monolith shot and is left standing in the salt when the camera moves on. */
export default function ActSalt() {
  const card = useRef<HTMLDivElement>(null);
  const plates = useRef<(HTMLElement | null)[]>([]);

  useRides(() => {
    const out: (Ride | null)[] = [];
    const c = card.current;
    if (c) {
      const letters = Array.from(c.querySelectorAll<HTMLSpanElement>("[data-l]"));
      const n = letters.length;
      const seeds = letters.map((_, i) => [Math.sin(i * 12.9898) * 0.5 + 0.5, Math.sin(i * 78.233) * 0.5 + 0.5]);
      let lastK = -1;
      out.push({
        el: c,
        g0: 604,
        g1: 676,
        gin: 590,
        gout: 716,
        sx: 0.5,
        sy: 0.5,
        ax: 0.5,
        ay: 0.5,
        d: 7,
        rollK: 0.85,
        on: (i: RideInfo) => {
          const k = Math.round((i.approach * 1000 + i.leave * 1000) * 1) / 1000;
          if (k === lastK) return;
          lastK = k;
          for (let j = 0; j < n; j++) {
            const off = j - (n - 1) / 2;
            const a = i.approach;
            const l = i.leave * i.leave;
            const tx = off * (a * 34 + l * (60 + seeds[j][0] * 90));
            const ty = l * (seeds[j][1] - 0.5) * 120;
            const s = 1 + a * 0.35 + l * (1.6 + seeds[j][0] * 2.4);
            letters[j].style.transform = `translate3d(${tx.toFixed(1)}%, ${ty.toFixed(1)}%, 0) scale(${s.toFixed(3)})`;
            letters[j].style.opacity = (1 - clamp01(l * (1.1 + seeds[j][1]))).toFixed(3);
          }
        },
      });
    }
    plates.current.forEach((el, i) => {
      if (!el) return;
      const g0 = SEG.SHOT0 + i * SEG.SHOT_LEN + 28;
      const left = SHOTS[i].sx[0] > 0.5;
      const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-row]"));
      const last = rows.map(() => -1);
      out.push({
        el,
        g0,
        g1: g0 + 62,
        gin: g0 - 26,
        gout: g0 + 84,
        sx: left ? 0.11 : 0.575,
        sy: 0.2,
        ax: 0,
        ay: 0,
        d: 6,
        m: { sx: 0.055, sy: 0.4 },
        swing: left ? -38 : 38,
        drift: 0.05,
        rollK: 0.75,
        on: (inf: RideInfo) => {
          const p = clamp01((inf.g - (g0 - 12)) / 50);
          for (let k = 0; k < rows.length; k++) {
            const v = clamp01((p - (k / rows.length) * 0.6) / 0.25);
            if (Math.abs(v - last[k]) > 0.004) {
              last[k] = v;
              rows[k].style.setProperty("--rp", v.toFixed(3));
            }
          }
        },
      });
    });
    return out;
  });

  return (
    <section id="instruments" className={styles.act} data-world="noon" aria-labelledby="instruments-title">
      <div ref={card} className={`${styles.plane} ${styles.pSaltCard}`}>
        <p className={styles.saltKicker}>
          <span>03 / 05</span>
          <span>
            01 — {pad(N)}
          </span>
        </p>
        <h2 id="instruments-title" className={styles.saltWord} aria-label={WORD}>
          {Array.from(WORD).map((ch, i) => (
            <span key={i} data-l className={styles.saltLetter} aria-hidden="true">
              {ch}
            </span>
          ))}
        </h2>
      </div>

      {capabilities.map((c, i) => (
        <article
          key={c.id}
          ref={(n) => void (plates.current[i] = n)}
          className={`${styles.plane} ${styles.pPlate}`}
          aria-labelledby={`cap-${c.id}`}
        >
          <p className={styles.plateMeta} aria-hidden="true">
            <span>
              {pad(i + 1)} / {pad(N)}
            </span>
            <span>{chapters.skills}</span>
          </p>
          <h3 id={`cap-${c.id}`} className={styles.plateTitle}>
            {c.title}
          </h3>
          <p className={styles.plateLine}>{c.line}</p>
          <ul className={styles.survey} aria-label={c.title}>
            {c.items.map((it, k) => (
              <li key={it} data-row className={styles.surveyRow}>
                <span className={styles.surveyNum}>{pad(k + 1)}</span>
                <span className={styles.surveyName}>{it}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
