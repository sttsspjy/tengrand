// DOM camera: maps scroll to the story position, damps it, and drives every DOM layer that travels with the
// WebGL camera (perspective content planes, the hero name dolly, transit typography, HUD, act switches).
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { chapters } from "@/content/profile";
import { scene, lenisRef, HINTS } from "./state";
import { actOf, actParams, clamp01, cubicOut, ramp, smooth } from "./timeline";

const CHAPTERS = [chapters.intro, chapters.about, chapters.skills, chapters.work, chapters.contact];

type Plane = { el: HTMLElement; st: ScrollTrigger; ax: number; ay: number; az: number; dz: number; last: string };

const num = (el: HTMLElement, k: string, d = 0) => {
  const v = el.dataset[k];
  return v === undefined ? d : parseFloat(v);
};
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 91.7 + k * 13.3) * 43758.5453;
  return x - Math.floor(x);
};

export function startDirector(root: HTMLElement) {
  const reduce = scene.reduced;
  const narrow = window.innerWidth < 760;
  const touch = window.matchMedia("(hover: none)").matches;
  const q = <T extends HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
  const one = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);

  // ── story marks (scroll px → u) ──
  const stAbout = ScrollTrigger.create({ trigger: "#v5-about", start: "top 12%" });
  const stCore = ScrollTrigger.create({ trigger: "#v5-core", start: "top top", end: "bottom bottom" });
  const stShatter = ScrollTrigger.create({ trigger: "#v5-shatter", start: "top top", end: "bottom bottom" });
  const stWorkFallback = ScrollTrigger.create({ trigger: "#v5-work", start: "top 40%", end: "bottom 60%" });
  const stHero = ScrollTrigger.create({ trigger: "#v5-top", start: "top top", end: "bottom top" });
  // Chapter heads: each fires when its section heading (top padding below the section top) enters the viewport.
  const heads = ["#v5-about", "#v5-capabilities", "#v5-work", "#v5-contact"].map((sel) => {
    const sec = root.querySelector<HTMLElement>(sel)!;
    return ScrollTrigger.create({
      trigger: sec,
      start: () => `top+=${parseFloat(getComputedStyle(sec).paddingTop) || 0} bottom`,
    });
  });
  const debug = new URLSearchParams(window.location.search).has("debug");
  let marks: [number, number][] = [];
  let maxY = 1;
  const build = () => {
    maxY = ScrollTrigger.maxScroll(window);
    const pin = ScrollTrigger.getById("v5-work-pin");
    const w = pin ?? stWorkFallback;
    const raw: [number, number][] = [
      [0, 0],
      [stAbout.start, 1],
      [stCore.start, 2],
      [stCore.end, 3],
      [w.start, 4],
      [w.end, 5],
      [stShatter.start, 5],
      [stShatter.end, 6],
      [ScrollTrigger.maxScroll(window), 7],
    ];
    for (let i = 1; i < raw.length; i++) raw[i][0] = Math.max(raw[i][0], raw[i - 1][0]);
    marks = raw;
    if (debug) (window as unknown as { __v5marks?: [number, number][] }).__v5marks = raw;
  };
  build();
  ScrollTrigger.addEventListener("refresh", build);

  const uAt = (y: number) => {
    if (y <= marks[0][0]) return 0;
    for (let i = 1; i < marks.length; i++) {
      const [y1, u1] = marks[i];
      if (y < y1) {
        const [y0, u0] = marks[i - 1];
        return u0 + ((u1 - u0) * (y - y0)) / Math.max(1, y1 - y0);
      }
    }
    return 7;
  };

  // ── content planes ──
  const planes: Plane[] = q<HTMLElement>("[data-plane]").map((el) => ({
    el,
    st: ScrollTrigger.create({ trigger: el, start: "top bottom", end: "bottom top" }),
    ax: num(el, "ax"),
    ay: num(el, "ay"),
    az: num(el, "az"),
    dz: num(el, "dz", 160),
    last: "",
  }));
  const dolly = q<HTMLElement>("[data-dolly]");

  // ── transit layers ──
  const coreEl = one<HTMLElement>('[data-transit="core"]')!;
  const shatterEl = one<HTMLElement>('[data-transit="shatter"]')!;
  const coreStick = coreEl.firstElementChild as HTMLElement;
  const shatterStick = shatterEl.firstElementChild as HTMLElement;
  let lastCoreVis = -1;
  let lastShatterVis = -1;
  const words = q<HTMLElement>("[data-tw]");
  const card = one<HTMLElement>("[data-ti]")!;
  const from = q<HTMLElement>("[data-sl]");
  const to = q<HTMLElement>("[data-as]");
  const fromWrap = one<HTMLElement>('[data-word="from"]')!;
  const toWrap = one<HTMLElement>('[data-word="to"]')!;
  const hudChapter = one<HTMLElement>("[data-hud-chapter]");
  const hudHint = one<HTMLElement>("[data-hud-hint]");
  const hudBar = one<HTMLElement>("[data-hud-bar]");

  const amp = narrow ? 0.55 : 1;
  let cu = -1;
  let act = 0;
  let chapter = -1;
  let lean = 0;
  let tpx = 0;
  let tpy = 0;
  let coreInk = false;
  let heroFlag = false;
  let dimFlag = false;

  const tick = (_t: number, dtMs: number) => {
    const dt = Math.min(dtMs / 1000, 0.05);
    let u = uAt(window.scrollY);
    if (reduce) {
      if (u > 2 && u < 3) u = u < 2.5 ? 2 : 3;
      if (u > 5 && u < 6) u = u < 5.5 ? 5 : 6;
    }
    scene.u = u;
    if (cu < 0 || reduce) cu = u;
    else cu += (u - cu) * (1 - Math.exp(-dt * 6.5));
    if (Math.abs(cu - u) < 0.0004) cu = u;
    scene.cu = cu;

    const dim = narrow && cu > 3.06 && cu < 4.96;
    if (dim !== dimFlag) {
      dimFlag = dim;
      root.toggleAttribute("data-dim", dim);
    }
    const inHero = cu < 0.42;
    if (inHero !== heroFlag) {
      heroFlag = inHero;
      root.toggleAttribute("data-hero", inHero);
    }
    const a = actOf(cu);
    if (a !== act) {
      act = a;
      root.dataset.act = String(a);
      scene.act = a;
      if (hudHint) {
        hudHint.textContent = HINTS[a][touch ? 1 : 0];
        hudHint.classList.remove("v5-flash");
        void hudHint.offsetWidth;
        hudHint.classList.add("v5-flash");
      }
    }
    // Skills also starts when its title card arrives in the core transit.
    let ch = 0;
    const y = window.scrollY;
    heads.forEach((h, i) => {
      if (y >= h.start || (i === 1 && cu >= 2.7)) ch = i + 1;
    });
    if (ch !== chapter) {
      chapter = ch;
      if (hudChapter) hudChapter.textContent = `${String(ch).padStart(2, "0")} ${CHAPTERS[ch]}`;
    }
    if (hudBar) hudBar.style.transform = `scaleX(${(cu / 7).toFixed(4)})`;
    if (reduce) return;

    // velocity lean + pointer tilt shared by every plane
    const v = lenisRef.current?.velocity ?? 0;
    lean += (Math.max(-5, Math.min(5, v * 0.09)) - lean) * (1 - Math.exp(-dt * 5));
    tpx += (scene.px - tpx) * (1 - Math.exp(-dt * 3));
    tpy += (scene.py - tpy) * (1 - Math.exp(-dt * 3));

    for (const p of planes) {
      // Planes already on screen at load stay flat until they start leaving.
      // Planes near the page end flatten at the furthest reachable progress instead of mid-screen.
      const span = Math.max(1, p.st.end - p.st.start);
      const p0 = p.st.start < 0 ? -p.st.start / span : 0;
      const mid = Math.min(0.5, ((maxY - p.st.start) / span) * 0.85);
      const pr = p.st.progress;
      const c = p0 > 0 ? (pr <= p0 ? 0 : -(pr - p0) / (1 - p0)) : pr < mid ? 1 - pr / mid : -(pr - mid) / (1 - mid);
      const e = Math.sign(c) * smooth((Math.abs(c) - 0.1) / 0.9);
      const rx = (p.ax * e + lean + -tpy * 1.4) * amp;
      const ry = (p.ay * e + tpx * 1.8) * amp;
      const rz = p.az * e * amp;
      const z = -p.dz * Math.abs(e) * amp;
      const str = `perspective(1600px) translate3d(0,0,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
      if (str !== p.last) {
        p.el.style.transform = str;
        p.last = str;
      }
    }

    // hero name: the camera dollies through the letters as the hero leaves
    const hp = stHero.progress;
    dolly.forEach((el, k) => {
      const r = rnd(k, 1);
      const off = k - (dolly.length - 1) / 2;
      const z = hp * (260 + 1100 * r);
      el.style.transform =
        hp < 0.001
          ? ""
          : `perspective(900px) translate3d(${(off * hp * 90).toFixed(1)}px, ${(-hp * (120 + r * 260)).toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${(off * hp * 9).toFixed(2)}deg)`;
      el.style.opacity = String(1 - smooth(hp * 1.5 - r * 0.2));
    });

    const A = actParams(cu);

    // core transit: words pass the camera in sequence, rolling with the barrel spin
    const coreVis = ramp(cu, 1.88, 2.02) * (1 - ramp(cu, 3.02, 3.16));
    const shatterVis = ramp(cu, 4.9, 5.02) * (1 - ramp(cu, 6.02, 6.16));
    if (Math.abs(coreVis - lastCoreVis) > 0.001) coreStick.style.opacity = (lastCoreVis = coreVis).toFixed(3);
    if (Math.abs(shatterVis - lastShatterVis) > 0.001) shatterStick.style.opacity = (lastShatterVis = shatterVis).toFixed(3);
    if (cu > 1.86 && cu < 3.2) {
      const spin = (scene.out.roll * 180) / Math.PI;
      // Words sit on the tunnel wall evenly spaced around it: far away they converge on the vanishing point,
      // close up perspective throws them outward past the lens.
      const R = window.innerHeight * 0.2;
      words.forEach((w, k) => {
        const pass = 2.34 + k * 0.09;
        const z = (cu - pass) * 5200;
        const o = clamp01((z + 2600) / 700) * (1 - clamp01((z - 200) / 420));
        w.style.opacity = o.toFixed(3);
        w.style.transform = `perspective(800px) translate3d(-50%, -50%, ${Math.min(z, 700).toFixed(0)}px) rotateZ(${(-spin + (k * 360) / words.length - 20).toFixed(2)}deg) translateY(${(-R).toFixed(0)}px)`;
      });
      const ct = ramp(cu, 2.7, 2.98);
      card.style.opacity = ct.toFixed(3);
      card.style.transform = `perspective(1000px) translate3d(0, 0, ${(-(1 - ct) * 2600).toFixed(0)}px) rotateX(${((1 - ct) * 28).toFixed(2)}deg)`;
      const ink = A.flood1 > 0.55;
      if (ink !== coreInk) {
        coreInk = ink;
        coreEl.toggleAttribute("data-ink", ink);
      }
    }

    // shatter transit: the outgoing chapter word trembles and scatters with the blades, the name reassembles from debris
    if (cu > 4.88 && cu < 6.2) {
      const sc = cubicOut((cu - 5.12) / 0.3);
      const tr = A.tremble;
      const fo = 1 - ramp(cu, 5.3, 5.46);
      fromWrap.style.opacity = (ramp(cu, 4.8, 4.98) * fo).toFixed(3);
      const tnow = performance.now() / 1000;
      from.forEach((el, i) => {
        const jx = Math.sin(tnow * 47 + i * 3) * tr * 6;
        const jy = Math.sin(tnow * 41 + i * 5) * tr * 4;
        const x = (rnd(i, 2) - 0.5) * 1400 * sc + jx;
        const y = (rnd(i, 3) - 0.5) * 900 * sc + jy;
        const z = (200 + rnd(i, 4) * 900) * sc;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(0)}px) rotateX(${(rnd(i, 5) * 540 * sc).toFixed(1)}deg) rotateY(${((rnd(i, 6) - 0.5) * 540 * sc).toFixed(1)}deg) rotateZ(${((rnd(i, 7) - 0.5) * 240 * sc).toFixed(1)}deg)`;
      });
      const as = smooth((cu - 5.6) / 0.36);
      toWrap.style.opacity = ramp(cu, 5.54, 5.7).toFixed(3);
      to.forEach((el, i) => {
        const k = 1 - smooth(as * 1.25 - rnd(i + 20, 1) * 0.25);
        const x = (rnd(i + 20, 2) - 0.5) * 1600 * k;
        const y = (rnd(i + 20, 3) - 0.5) * 1000 * k;
        const z = (300 + rnd(i + 20, 4) * 900) * k;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(0)}px) rotateX(${(rnd(i + 20, 5) * 400 * k).toFixed(1)}deg) rotateY(${((rnd(i + 20, 6) - 0.5) * 400 * k).toFixed(1)}deg) rotateZ(${((rnd(i + 20, 7) - 0.5) * 200 * k).toFixed(1)}deg)`;
      });
      shatterEl.toggleAttribute("data-acid", A.flood2 > 0.6);
    }
  };

  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    ScrollTrigger.removeEventListener("refresh", build);
    [stAbout, stCore, stShatter, stWorkFallback, stHero, ...heads, ...planes.map((p) => p.st)].forEach((s) => s.kill());
  };
}
