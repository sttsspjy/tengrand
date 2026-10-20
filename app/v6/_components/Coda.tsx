"use client";

import { useRef, useState } from "react";
import { profile, chapters } from "@/content/profile";
import { RESTART_HREF } from "@/content/quiz";
import DecryptedText from "./DecryptedText";
import { useRides } from "./useRides";
import { SEG, CHAPTERS } from "./timeline";
import styles from "../n2.module.css";

const GH = profile.contact.github.replace(/^https?:\/\//, "");
const TOTAL = String(CHAPTERS.length).padStart(2, "0");

/** Coda at first light over the cloud sea: the contact plate, then a closing credit roll and the link
 *  back to the questionnaire. */
export function Signal() {
  const [copied, setCopied] = useState(false);
  const t = useRef(0);
  const plate = useRef<HTMLDivElement>(null);
  const email = profile.contact.email;

  useRides(() => [
    plate.current && {
      el: plate.current,
      g0: SEG.SIGNAL0,
      g1: SEG.SIGNAL0 + 72,
      gin: SEG.SIGNAL0 - 50,
      gout: SEG.SIGNAL0 + 112,
      sx: 0.085,
      sy: 0.2,
      ax: 0,
      ay: 0,
      d: 7,
      m: { sx: 0.055, sy: 0.17 },
      drift: 0.05,
      swing: 24,
      rollK: 0.6,
    },
  ]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.clearTimeout(t.current);
      t.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the mailto link still works */
    }
  };

  return (
    <section id="signal" className={styles.act} data-world="dawn" data-poster="6" aria-labelledby="signal-title">
      <div ref={plate} className={`${styles.plane} ${styles.pSignal}`}>
        <p className={styles.label}>
          <span>
            06 <span className={styles.labelDim}>/ {TOTAL}</span>
          </span>
        </p>
        <h2 id="signal-title" className={styles.signalTitle}>
          {chapters.contact}
        </h2>
        <div className={styles.emailRow}>
          <a className={styles.email} href={`mailto:${email}`}>
            <DecryptedText text={email} delay={null} hover />
            <span className={styles.emailLine} aria-hidden="true" />
          </a>
          <button type="button" className={styles.copy} onClick={copy} aria-live="polite">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <a className={styles.gh} href={profile.contact.github} target="_blank" rel="noreferrer">
          <span className={styles.labelDim}>GitHub</span>
          <span>{GH}</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}

export function Credits() {
  const roll = useRef<HTMLDivElement>(null);
  const fin = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useRides(() => [
    roll.current && {
      el: roll.current,
      g0: SEG.CREDITS0,
      g1: SEG.CREDITS0 + 120,
      gin: SEG.CREDITS0 - 25,
      gout: SEG.CREDITS0 + 150,
      sx: 0.36,
      sy: 0.95,
      syEnd: -0.05,
      ax: 0.5,
      m: { sx: 0.06, ax: 0 },
      ay: 0,
      d: 7,
      rollK: 1,
    },
    fin.current && {
      el: fin.current,
      g0: SEG.END - 60,
      g1: SEG.END + 20,
      gin: SEG.END - 95,
      gout: SEG.END + 60,
      sx: 0.5,
      sy: 0.34,
      ax: 0.5,
      ay: 0.5,
      d: 7,
      swing: -20,
      rollK: 1,
    },
    bar.current && {
      el: bar.current,
      g0: SEG.END - 40,
      g1: SEG.END + 20,
      gin: SEG.END - 60,
      gout: SEG.END + 60,
      sx: 0.5,
      sy: 0.94,
      ax: 0.5,
      ay: 1,
      d: 3,
      rollK: 1,
    },
  ]);

  return (
    <footer className={styles.act} data-world="dawn">
      <div ref={roll} className={`${styles.plane} ${styles.roll}`}>
        <p className={styles.rollName}>{profile.name}</p>
        <dl className={styles.rollList}>
          <div>
            <dt>Email</dt>
            <dd>
              {Array.from(profile.contact.email).map((c, i) =>
                /\d/.test(c) ? (
                  <span key={i} className={styles.dDigit}>
                    {c}
                  </span>
                ) : (
                  c
                ),
              )}
            </dd>
          </div>
          <div>
            <dt>GitHub</dt>
            <dd>{GH}</dd>
          </div>
        </dl>
      </div>
      <div ref={bar} className={`${styles.plane} ${styles.footBar}`}>
        <span>
          © {profile.year} {profile.name}
        </span>
      </div>
      <div ref={fin} className={`${styles.plane} ${styles.fin}`}>
        <a href={RESTART_HREF} className={styles.restart}>
          <span aria-hidden="true" className={styles.restartArrow}>
            ←
          </span>
          <span className={styles.restartText}>
            {chapters.restart}
            <span className={styles.emailLine} aria-hidden="true" />
          </span>
        </a>
      </div>
    </footer>
  );
}
