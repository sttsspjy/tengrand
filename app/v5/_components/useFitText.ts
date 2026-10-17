"use client";

import { useLayoutEffect, type RefObject } from "react";

// Sets the element's font-size so its natural (max-content) width equals its parent's content width.
export function useFitText(ref: RefObject<HTMLElement | null>, onFit?: () => void) {
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cs = getComputedStyle(parent);
        const target = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        el.style.fontSize = "100px";
        const w = el.scrollWidth;
        if (w > 0) el.style.fontSize = `${(100 * target) / w}px`;
        onFit?.();
      });
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref, onFit]);
}
