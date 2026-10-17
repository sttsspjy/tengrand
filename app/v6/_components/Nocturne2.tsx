"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { startDirector, onFrame, director, scrollToG } from "./director";
import { evaluate, SEG, W, live, ACTS } from "./timeline";
import { updateRig } from "./rig";
import { startInteract } from "./interact";
import Chrome from "./Chrome";
import ActNight from "./ActNight";
import ActSalt from "./ActSalt";
import ActDark from "./ActDark";
import { Signal, Credits } from "./Coda";
import SaltLabels from "./SaltLabels";
import DevelopOverlay from "./DevelopOverlay";
import styles from "../n2.module.css";

const World = dynamic(() => import("./World"), { ssr: false });

// Timeline position of each chapter's content, for keyboard focus jumps.
const FOCUS_G: Record<string, number> = {
  origin: 0,
  intent: 150,
  instruments: SEG.SHOT0 + 52,
  works: SEG.PRINT0 + 100,
  signal: SEG.SIGNAL0 + 30,
};

/** Client root: one timeline drives the shader world and the CSS 3D rig that carries the text. */
export default function Nocturne2() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rig = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMotion(!reduced);
    const stop = startDirector();
    if (reduced) return stop;

    const unEval = onFrame((f) => evaluate(f.g, f.time, f.dt), 0);
    let ready = false;
    let act = -1;
    const unRig = onFrame(() => {
      if (stage.current && rig.current) updateRig(stage.current, rig.current, W.rig);
      if (W.act !== act) {
        act = W.act;
        if (stage.current) stage.current.dataset.cursor = act === 1 ? "sun" : "water";
        live.hoverSlab = -1;
      }
    }, 50);
    const unReady = onFrame(() => {
      if (!ready && stage.current) {
        ready = true;
        stage.current.setAttribute("data-ready", "");
      }
    }, 90);
    const unInteract = stage.current ? startInteract(stage.current) : () => {};

    // keyboard focus inside a plane: travel to where that plane is readable
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !stage.current?.contains(t)) return;
      const sec = t.closest<HTMLElement>("[data-world]");
      const article = t.closest<HTMLElement>("[aria-labelledby^='work-']");
      let g = sec?.id ? FOCUS_G[sec.id] : undefined;
      if (article) {
        const idx = Array.from(document.querySelectorAll("[aria-labelledby^='work-']")).indexOf(article);
        g = SEG.PRINT0 + idx * SEG.PRINT_LEN + 100;
      }
      if (t.closest("footer")) g = SEG.END;
      if (g !== undefined && Math.abs(director.g - g) > 40) scrollToG(g, { immediate: true });
    };
    document.addEventListener("focusin", onFocus);
    // test hook for probe scripts, only with ?debug: jump to a timeline position
    if (new URLSearchParams(window.location.search).has("debug"))
      (window as unknown as { __n2go?: (g: number) => void }).__n2go = (g: number) => scrollToG(g, { immediate: true });

    return () => {
      unEval();
      unRig();
      unReady();
      unInteract();
      document.removeEventListener("focusin", onFocus);
      stop();
    };
  }, []);

  return (
    <div ref={root} className={styles.film} data-n2-root="" data-act={ACTS[0]}>
      <div className={styles.poster} aria-hidden="true" />
      {motion ? <World /> : null}
      <Chrome />
      <div ref={stage} className={styles.stage} data-n2-stage="">
        <div ref={rig} className={styles.rig}>
          <main className={styles.main}>
            <ActNight />
            <ActSalt />
            <ActDark />
            <Signal />
          </main>
          <Credits />
        </div>
      </div>
      <SaltLabels />
      <DevelopOverlay />
      <div className={styles.spacer} style={{ ["--len" as string]: SEG.END }} aria-hidden="true" />
    </div>
  );
}
