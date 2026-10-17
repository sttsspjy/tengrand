"use client";

import { useEffect, useRef } from "react";
import { onFrame, isReduced } from "./director";
import { SEG } from "./timeline";
import { smooth } from "./camera";
import styles from "../n2.module.css";

/** Salt noon -> darkroom: two strips of sprocketed film slide in at the frame edges and scroll past. */
export default function DevelopOverlay() {
  const root = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const holesL = useRef<HTMLDivElement>(null);
  const holesR = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isReduced()) return;
    let on = true;
    return onFrame((f) => {
      const g = f.g;
      const want = g > SEG.T2a - 5 && g < 1515;
      if (want !== on) {
        on = want;
        root.current?.toggleAttribute("data-on", want);
      }
      if (!want) return;
      const inn = smooth(SEG.T2a, 1365, g) * (1 - smooth(1470, 1510, g));
      const x = (1 - inn) * 110;
      if (left.current) left.current.style.transform = `translate3d(${-x}%, 0, 0)`;
      if (right.current) right.current.style.transform = `translate3d(${x}%, 0, 0)`;
      const period = 34;
      const y = -(((g - SEG.T2a) * 9) % period);
      if (holesL.current) holesL.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      if (holesR.current) holesR.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    }, 75);
  }, []);

  return (
    <div ref={root} className={styles.devOverlay} aria-hidden="true" data-on="">
      <div ref={left} className={`${styles.filmEdge} ${styles.filmL}`}>
        <div ref={holesL} className={styles.holes} />
      </div>
      <div ref={right} className={`${styles.filmEdge} ${styles.filmR}`}>
        <div ref={holesR} className={styles.holes} />
      </div>
    </div>
  );
}
