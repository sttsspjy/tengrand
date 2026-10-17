"use client";

import { useEffect, useRef } from "react";
import { profile } from "@/content/profile";
import { director, onFrame, scrollToG } from "./director";
import { CHAPTERS, ACTS, SEG, W } from "./timeline";
import styles from "../n2.module.css";

const WORLD = "Nocturne";

const HINTS = [
  ["Click the water", "Drag to look"],
  ["Drag to move the sun", "Click a monolith"],
  ["Hover a print to develop", "Drag a print to swing"],
  ["Click the water", "Drag to look"],
];
const HINTS_TOUCH = [
  ["Tap the water", "Swipe to look"],
  ["Swipe to move the sun", "Tap a monolith"],
  ["Tap a print to develop", "Tap the tray"],
  ["Tap the water", "Swipe to look"],
];

/** Fixed chrome: header with world + current chapter, chapter rail, scrub bar, per-act hint, letterbox intro. */
export default function Chrome() {
  const chNum = useRef<HTMLSpanElement>(null);
  const chLabel = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const rail = useRef<HTMLOListElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const hintA = useRef<HTMLSpanElement>(null);
  const hintB = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let active = -1;
    let act = -1;
    let hintOn = true;
    const touch = window.matchMedia("(hover: none)").matches;

    const unFrame = onFrame((f) => {
      const p = Math.min(1, Math.max(0, f.g / SEG.END));
      if (fill.current) fill.current.style.transform = `scaleX(${p.toFixed(4)})`;
      if (head.current) head.current.style.transform = `translateX(${(p * 100).toFixed(3)}cqw)`;

      let a = 0;
      for (let i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].g <= f.g + 30) a = i;
      if (a !== active) {
        active = a;
        if (chNum.current) chNum.current.textContent = CHAPTERS[a].n;
        if (chLabel.current) chLabel.current.textContent = CHAPTERS[a].label;
        rail.current?.querySelectorAll("li").forEach((li, i) => li.toggleAttribute("data-active", i === a));
      }
      const ac = director.reduced ? actFromSections(f.g) : W.act;
      if (ac !== act) {
        act = ac;
        const h = (touch ? HINTS_TOUCH : HINTS)[ac];
        if (hintA.current) hintA.current.textContent = h[0];
        if (hintB.current) hintB.current.textContent = h[1];
        hint.current?.setAttribute("data-flash", String(ac));
        document.querySelector<HTMLElement>("[data-n2-root]")?.setAttribute("data-act", ACTS[ac]);
      }
      // hint shows during the playable stretches of each act
      const g = f.g;
      const wantHint =
        !director.reduced &&
        ((g > 10 && g < 440) || (g > SEG.SHOT0 + 20 && g < SEG.T2a) || (g > SEG.PRINT0 && g < SEG.T3a) || (g > SEG.SIGNAL0 && g < SEG.END - 80) || g < 2);
      if (wantHint !== hintOn && hint.current) {
        hintOn = wantHint;
        hint.current.toggleAttribute("data-on", wantHint);
      }
    }, 10);

    return () => unFrame();
  }, []);

  return (
    <>
      <div className={styles.letterbox} aria-hidden="true">
        <span className={styles.lbTop} />
        <span className={styles.lbBottom} />
        <span className={styles.lbCard}>
          {WORLD} · {profile.year}
        </span>
      </div>

      <header className={styles.chromeTop}>
        <a href="#origin" className={styles.brand} onClick={(e) => (e.preventDefault(), scrollToG(0))}>
          <span className={styles.brandName}>{profile.name}</span>
          <span className={styles.brandRole}>{profile.role}</span>
        </a>
        <div className={styles.tcBlock} aria-hidden="true">
          <span className={styles.tcRow}>{WORLD}</span>
          <span className={styles.tcRow}>
            <span className={styles.recDot} />
            <span ref={chNum}>{CHAPTERS[0].n}</span>
            <span ref={chLabel}>{CHAPTERS[0].label}</span>
          </span>
        </div>
      </header>

      <nav className={styles.rail} aria-label="Chapters">
        <span className={styles.railLine} aria-hidden="true" />
        <ol ref={rail}>
          {CHAPTERS.map((c, i) => (
            <li key={c.id} data-active={i === 0 ? "" : undefined}>
              <a
                href={`#${c.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (director.reduced) document.getElementById(c.id)?.scrollIntoView();
                  else scrollToG(c.g + 20);
                }}
              >
                <span className={styles.railNum}>{c.n}</span>
                <span className={styles.railLabel}>{c.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.scrub} aria-hidden="true">
        <div className={styles.scrubTrack}>
          <span ref={fill} className={styles.scrubFill} />
          <span className={styles.scrubTicks}>
            {CHAPTERS.map((c) => (
              <span key={c.id} className={styles.scrubTick} style={{ left: `${((c.g / SEG.END) * 100).toFixed(2)}%` }}>
                <i>{c.n}</i>
              </span>
            ))}
            {[SEG.SWAP1, 1420, SEG.SWAP3].map((g) => (
              <span key={g} className={styles.scrubCut} style={{ left: `${((g / SEG.END) * 100).toFixed(2)}%` }} />
            ))}
          </span>
          <span ref={head} className={styles.scrubHead} />
        </div>
      </div>

      <div ref={hint} className={styles.hint} aria-hidden="true" data-on="">
        <span ref={hintA}>Click the water</span>
        <span ref={hintB} className={styles.hintDim}>
          Drag to look
        </span>
      </div>
    </>
  );
}

/** Reduced motion: act from the section nearest the viewport centre. */
function actFromSections(_g: number) {
  const mid = window.innerHeight / 2;
  const order = ["night", "noon", "dark", "coda"];
  let found = 0;
  document.querySelectorAll<HTMLElement>("[data-world]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top <= mid) {
      const k = el.dataset.world === "night" && el.id === "signal" ? 3 : order.indexOf(el.dataset.world ?? "night");
      if (k >= 0) found = Math.max(found, k);
    }
  });
  return found;
}
