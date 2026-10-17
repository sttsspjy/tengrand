"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { setLenis } from "../_lib/scroll";

/** Lenis smooth scrolling (skipped for reduced motion and touch-first devices). */
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const l = new Lenis({ lerp: 0.11, smoothWheel: true, autoRaf: true });
    setLenis(l);
    return () => {
      setLenis(null);
      l.destroy();
    };
  }, []);
  return null;
}
