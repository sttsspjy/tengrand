import Lenis from "lenis";

// Single rAF loop for the v6 route: drives Lenis, the shader world and every scroll-linked DOM write.
// Scroll is expressed as `g`: scroll offset in svh (1g = 1% of the small viewport height), so the
// timeline is device independent.

export type FrameInfo = {
  time: number; // seconds since start
  dt: number; // seconds, clamped
  g: number; // scroll in svh
  scroll: number;
  vw: number;
  vh: number; // stage (100lvh) height in px; projection reference
};

type Tick = (f: FrameInfo) => void;
type Entry = { fn: Tick; order: number };

/** WebGL world status: ready once the program is linked and uniforms are bound. */
export const worldState = { ready: false, failed: false };

// Title gate: intro text effects wait until the opening (normal intro or the arrival) releases them.
let titleAt = 0;
const titleWaiters = new Set<() => void>();
export function releaseTitle() {
  if (titleAt) return;
  titleAt = performance.now();
  titleWaiters.forEach((f) => f());
  titleWaiters.clear();
}
/** Runs fn once the title is released (immediately if it already was). Returns a cancel. */
export function onTitle(fn: () => void): () => void {
  if (titleAt) {
    fn();
    return () => {};
  }
  titleWaiters.add(fn);
  return () => {
    titleWaiters.delete(fn);
  };
}

const ticks: Entry[] = [];
const resizers = new Set<() => void>();

export const director = {
  scroll: 0,
  g: 0,
  unit: 9, // px per g
  vh: 900, // stage height px
  vw: 1600,
  aspect: 16 / 9,
  mobile: false,
  reduced: false,
  started: false,
  lenis: null as Lenis | null,
  pointerX: 0, // -1..1, mouse only
  pointerY: 0,
  introAt: 0,
  time: 0,
};

/** Registers a per-frame callback; lower `order` runs first. Returns an unsubscribe. */
export function onFrame(fn: Tick, order = 0): () => void {
  const e = { fn, order };
  ticks.push(e);
  ticks.sort((a, b) => a.order - b.order);
  return () => {
    const i = ticks.indexOf(e);
    if (i >= 0) ticks.splice(i, 1);
  };
}

/** Registers a layout-measure callback (resize, font load). Fires once immediately if started. */
export function onMeasure(fn: () => void): () => void {
  resizers.add(fn);
  if (director.started) fn();
  return () => {
    resizers.delete(fn);
  };
}

const easeInOutExpo = (t: number) =>
  t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;

/** Scrolls to timeline position g. `immediate` jumps (hard cut). */
export function scrollToG(g: number, opts: { immediate?: boolean; duration?: number } = {}) {
  const y = g * director.unit;
  if (director.lenis) {
    if (opts.immediate) director.lenis.scrollTo(y, { immediate: true, force: true });
    else director.lenis.scrollTo(y, { duration: opts.duration ?? 2.6, easing: easeInOutExpo, force: true });
  } else window.scrollTo({ top: y, behavior: director.reduced || opts.immediate ? "auto" : "smooth" });
}

let probe: HTMLDivElement | null = null;
let lastW = 0;

function measure() {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:-10px;top:0;width:1px;height:100svh;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
  }
  const w = window.innerWidth;
  const unit = (probe.offsetHeight || window.innerHeight) / 100;
  // ignore height-only jitter (mobile URL bar) unless large
  if (w !== lastW || Math.abs(unit - director.unit) > 1.2) {
    director.unit = unit;
    lastW = w;
  }
  director.vw = w;
  director.vh = Math.max(1, window.innerHeight);
  const lv = document.querySelector<HTMLElement>("[data-n2-stage]");
  if (lv) director.vh = lv.offsetHeight || director.vh;
  director.aspect = director.vw / director.vh;
  director.mobile = window.matchMedia("(max-width: 760px)").matches;
  resizers.forEach((fn) => fn());
}

/** Boots the loop. Returns a teardown. */
export function startDirector(): () => void {
  director.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!director.reduced) {
    director.lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.85, smoothWheel: true, autoRaf: false });
  }
  director.started = true;
  director.introAt = performance.now();
  measure();

  let raf = 0;
  let last = performance.now();
  const start = last;

  const loop = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    director.lenis?.raf(now);
    director.scroll = director.lenis ? director.lenis.scroll : window.scrollY;
    director.g = director.scroll / director.unit;
    director.time = (now - start) / 1000;
    const f: FrameInfo = {
      time: director.time,
      dt,
      g: director.g,
      scroll: director.scroll,
      vw: director.vw,
      vh: director.vh,
    };
    for (let i = 0; i < ticks.length; i++) ticks[i].fn(f);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  let resizeT = 0;
  const onResize = () => {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(measure, 120);
  };
  window.addEventListener("resize", onResize);
  document.fonts?.ready.then(measure).catch(() => {});

  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  document.addEventListener("visibilitychange", onVis);

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    director.pointerX = (e.clientX / director.vw) * 2 - 1;
    director.pointerY = (e.clientY / director.vh) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(resizeT);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", onVis);
    director.lenis?.destroy();
    director.lenis = null;
    director.started = false;
    titleAt = 0;
    probe?.remove();
    probe = null;
    lastW = 0;
  };
}

/** Live reduced-motion check (safe before the director has started). */
export const isReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
