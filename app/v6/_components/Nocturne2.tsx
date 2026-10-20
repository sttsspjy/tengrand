"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { startDirector, onFrame, director, scrollToG, worldState, releaseTitle } from "./director";
import { evaluate, SEG, W, ACTS, arrival, arrivalT } from "./timeline";
import { updateRig } from "./rig";
import { startInteract } from "./interact";
import Chrome from "./Chrome";
import ActCity from "./ActCity";
import ActCraft from "./ActCraft";
import ActSkills from "./ActSkills";
import ActStars from "./ActStars";
import { Signal, Credits } from "./Coda";
import styles from "../n2.module.css";

const World = dynamic(() => import("./World"), { ssr: false });

const ENTRY = "nocturne";

// Timeline position where each chapter's content is readable, for keyboard focus jumps.
const FOCUS_G: Record<string, number> = {
  origin: 0,
  intent: 160,
  craft: 720,
  instruments: SEG.SHOT0 + 60,
  works: SEG.CON0 + 100,
  signal: SEG.SIGNAL0 + 40,
};

type Mode = "init" | "motion" | "still";

/** Client root: one timeline drives the shader world and the CSS 3D rig that carries the text. */
export default function Nocturne2() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rig = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("init");

  useEffect(() => {
    const html = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const params = new URLSearchParams(window.location.search);
    if (params.has("entry")) html.dataset.entry = ENTRY;
    const entry = html.dataset.entry === ENTRY;
    if (entry) root.current?.setAttribute("data-entered", "");
    setMode(reduced ? "still" : "motion");
    const stop = startDirector();
    const timers: number[] = [];
    const endEntry = () => {
      if (html.dataset.entry === ENTRY) delete html.dataset.entry;
      root.current?.removeAttribute("data-arriving");
    };

    if (reduced) {
      releaseTitle();
      if (entry) {
        // calm version: a short crossfade from black
        root.current?.setAttribute("data-arriving", "fade");
        timers.push(window.setTimeout(endEntry, 900));
      }
      return () => {
        timers.forEach((t) => window.clearTimeout(t));
        endEntry();
        stop();
      };
    }

    // "Lights out" arrival: wait for the shader (<= 2.5 s), then a struck light at the centre,
    // the camera pulls back from it and the windows come on outward from it.
    let unWait = () => {};
    if (entry) {
      arrival.active = true;
      arrival.at = -1;
      const t0 = performance.now();
      root.current?.setAttribute("data-arriving", "wait");
      unWait = onFrame(() => {
        if (arrival.at < 0 && (worldState.ready || worldState.failed || performance.now() - t0 > 2500)) {
          arrival.at = performance.now() + 60;
          root.current?.setAttribute("data-arriving", "play");
        }
        const at = arrivalT();
        if (at > 0.62 && root.current?.getAttribute("data-arriving") === "play") root.current.setAttribute("data-arriving", "title");
        if (at > 0.66) releaseTitle();
        if (at >= 1) {
          arrival.active = false;
          unWait();
          endEntry();
        }
      }, 5);
    } else {
      arrival.active = false;
      releaseTitle();
    }

    const unEval = onFrame((f) => evaluate(f.g, f.time, f.dt), 0);
    let ready = false;
    let act = -1;
    const unRig = onFrame(() => {
      if (stage.current && rig.current) updateRig(stage.current, rig.current, W.rig);
      if (W.act !== act) {
        act = W.act;
        root.current?.setAttribute("data-act", ACTS[act]);
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
      const at = t.closest<HTMLElement>("[data-focus-g]");
      const sec = t.closest<HTMLElement>("[data-world]");
      let g = at ? Number(at.dataset.focusG) : sec?.id ? FOCUS_G[sec.id] : undefined;
      if (t.closest("footer")) g = SEG.END;
      if (g !== undefined && Math.abs(director.g - g) > 40) scrollToG(g, { immediate: true });
    };
    document.addEventListener("focusin", onFocus);
    // test hook for probe scripts, only with ?debug: jump to a timeline position
    if (params.has("debug")) (window as unknown as { __n2go?: (g: number) => void }).__n2go = (g: number) => scrollToG(g, { immediate: true });

    return () => {
      unWait();
      unEval();
      unRig();
      unReady();
      unInteract();
      document.removeEventListener("focusin", onFocus);
      arrival.active = false;
      endEntry();
      stop();
    };
  }, []);

  return (
    <div ref={root} className={styles.film} data-n2-root="" data-act={ACTS[0]}>
      <div className={styles.cover} aria-hidden="true" />
      <div className={styles.poster} aria-hidden="true" />
      {mode === "motion" ? <World /> : mode === "still" ? <World still /> : null}
      <Chrome />
      <div ref={stage} className={styles.stage} data-n2-stage="">
        <div ref={rig} className={styles.rig}>
          <main className={styles.main}>
            <ActCity />
            <ActCraft />
            <ActSkills />
            <ActStars />
            <Signal />
          </main>
          <Credits />
        </div>
      </div>
      <div className={styles.spacer} style={{ ["--len" as string]: SEG.END }} aria-hidden="true" />
    </div>
  );
}
