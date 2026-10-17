import type Lenis from "lenis";
import { anchors } from "./stage";

// Shared smooth-scroll handle + in-page navigation. Anchors resolve to timeline positions
// (the stage is fixed, so element offsets mean nothing); the camera flies there.

let lenis: Lenis | null = null;
export const setLenis = (l: Lenis | null) => {
  lenis = l;
};
export const getLenis = () => lenis;

/** Timeline position for an element id, falling back to its nearest [data-anchor] ancestor. */
export const yFor = (anchor: string): number | null => {
  if (anchors.has(anchor)) return anchors.get(anchor)!;
  const el = document.getElementById(anchor);
  const host = el?.closest<HTMLElement>("[data-anchor]");
  const a = host?.dataset.anchor;
  return a && anchors.has(a) ? anchors.get(a)! : null;
};

export const goTo = (anchor: string, opts: { flash?: boolean } = {}) => {
  const y = yFor(anchor);
  if (y == null) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dist = Math.abs(y - window.scrollY);
  const duration = Math.min(3.2, 0.9 + dist / 5200);
  if (lenis && !reduced) lenis.scrollTo(y, { duration, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
  else window.scrollTo({ top: y, behavior: "auto" });
  history.replaceState(null, "", `#${anchor}`);
  const el = document.getElementById(anchor);
  if (el && opts.flash !== false) {
    el.removeAttribute("data-flash");
    void el.offsetWidth;
    el.setAttribute("data-flash", "");
    window.setTimeout(() => el.removeAttribute("data-flash"), 2600);
  }
};
