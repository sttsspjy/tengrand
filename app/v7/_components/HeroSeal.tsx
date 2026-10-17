"use client";

import { useEffect, useRef } from "react";
import { drawSeal, fontsOf } from "../_lib/seal";
import s from "../act1.module.css";

/** Vermilion seal drawn onto the hero leaf. */
export default function HeroSeal() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive) drawSeal(c, c.offsetWidth || 200, "#C8361D", fontsOf(c), 7);
    });
    return () => {
      alive = false;
    };
  }, []);
  return <canvas ref={ref} className={s.heroSeal} aria-hidden />;
}
