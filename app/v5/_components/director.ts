// DOM camera: maps scroll to the story position, damps it, and drives every DOM layer that travels with the
// WebGL camera (perspective content planes, the hero name dolly, transit typography, HUD, act switches).
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { chapters } from "@/content/profile";
import { scene, lenisRef, HINTS } from "./state";
import {
  CRAFT_LEN,
  CRAFT_S0,
  STORY_END,
  actOf,
  actParams,
  breath01,
  buildCraft,
  clamp01,
  cubicOut,
  legacyU,
  ramp,
  rollAt,
  smooth,
} from "./timeline";

const CHAPTERS = [chapters.intro, chapters.about, chapters.craft, chapters.skills, chapters.work, chapters.contact];

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
  const stCraft = ScrollTrigger.create({ trigger: "#v5-craft", start: "top 70%", end: "bottom top" });
  const stCore = ScrollTrigger.create({ trigger: "#v5-core", start: "top top", end: "bottom bottom" });
  const stShatter = ScrollTrigger.create({ trigger: "#v5-shatter", start: "top top", end: "bottom bottom" });
  const stWorkFallback = ScrollTrigger.create({ trigger: "#v5-work", start: "top 40%", end: "bottom 60%" });
  const stHero = ScrollTrigger.create({ trigger: "#v5-top", start: "top top", end: "bottom top" });
  // Chapter heads: each fires when its section heading (top padding below the section top) enters the viewport.
  const heads = ["#v5-about", "#v5-craft", "#v5-capabilities", "#v5-work", "#v5-contact"].map((sel) => {
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
    const L = CRAFT_LEN;
    const raw: [number, number][] = [
      [0, 0],
      [stAbout.start, 1],
      [stCraft.start, CRAFT_S0],
      [stCraft.end, CRAFT_S0 + L],
      [stCore.start, 2 + L],
      [stCore.end, 3 + L],
      [w.start, 4 + L],
      [w.end, 5 + L],
      [stShatter.start, 5 + L],
      [stShatter.end, 6 + L],
      [ScrollTrigger.maxScroll(window), STORY_END],
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
    return STORY_END;
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

  // ── craft layers ──
  const slides = q<HTMLElement>("[data-slide]");
  const headWords = slides.map((sl) => Array.from(sl.querySelectorAll<HTMLElement>("[data-head] [data-cw]")));
  const bodyWords = slides.map((sl) => Array.from(sl.querySelectorAll<HTMLElement>("[data-cw]")).filter((el) => !el.closest("[data-head]")));
  const slideLast = slides.map(() => ({ o: -1, xf: "" }));
  const flies = q<HTMLElement>("[data-fly]");
  const finalC = one<HTMLElement>("[data-final]");
  const breathe = one<HTMLElement>("[data-breathe]");
  const hair = one<HTMLElement>("[data-hair]");
  const craftKeys = buildCraft(narrow).keys;
  const drop = one<HTMLElement>("[data-drop]");
  const hintRow = drop?.nextElementSibling as HTMLElement | null;
  let dropLast = "";
  const setSlide = (i: number, o: number, xf: string) => {
    const L = slideLast[i];
    const el = slides[i];
    if (!el) return;
    if (Math.abs(o - L.o) > 0.001) {
      el.style.visibility = o > 0.001 ? "visible" : "hidden";
      el.style.opacity = o.toFixed(3);
      L.o = o;
    }
    if (xf !== L.xf) {
      el.style.transform = xf;
      L.xf = xf;
    }
  };
  let craftIdle = false;
  const craftTick = (k: number) => {
    if (k < 0) {
      if (!craftIdle) slides.forEach((_, i) => setSlide(i, 0, ""));
      craftIdle = true;
      return;
    }
    craftIdle = false;

    // A · alive: title card over the wall; leaves by rushing past the lens as the camera dives into the ring.
    if (k > 0.2 && k < 1.09) {
      reveal(headWords[0], k, 0.22, 0.01, 0.06);
      // The headline cuts out upward before the wall rises, then re-enters at the foot of the frame once the
      // wall has cleared that band — it never crosses the wall.
      const body = bodyWords[0];
      if (k < 0.5) reveal(body, k, 0.26, 0.014, 0.08);
      else if (k < 0.66)
        body.forEach((el, j) => {
          const t = smooth((k - 0.5 - j * 0.01) / 0.07);
          el.style.transform = t <= 0 ? "" : `translate3d(0, ${(-t * 112).toFixed(1)}%, 0)`;
        });
      else reveal(body, k, 0.72, 0.014, 0.08);
      const dr = k >= 0.62 ? 1 : 0;
      if (drop) {
        const top = drop.offsetTop;
        const room = window.innerHeight - top - drop.offsetHeight - (hintRow ? window.innerHeight - hintRow.offsetTop + 22 : 90);
        const xf = dr > 0 ? `translate3d(0, ${(dr * room).toFixed(1)}px, 0)` : "";
        if (xf !== dropLast) drop.style.transform = dropLast = xf;
      }
      const out = ramp(k, 0.97, 1.08);
      setSlide(0, 1 - ramp(k, 1.0, 1.08), out > 0 ? `perspective(900px) translate3d(0, ${(-out * 6).toFixed(2)}vh, ${(out * 620).toFixed(0)}px)` : "");
    } else setSlide(0, 0, "");

    // B · motion: anchored in the ring, so it unrolls with the camera roll and shrinks as the camera pulls out.
    if (k > 1.26 && k < 2.09) {
      reveal(headWords[1], k, 1.5, 0.01, 0.06);
      reveal(bodyWords[1], k, 1.36, 0.022, 0.1);
      const pull = 1 - smooth((k - 1.32) / 0.34);
      const rot = -(Math.PI / 2 - rollAt(craftKeys, k)) * (180 / Math.PI);
      const out = ramp(k, 1.98, 2.08);
      const xf = out > 0 ? `translate3d(${(-out * 70).toFixed(2)}vw, 0, 0) skewX(${(out * 18).toFixed(2)}deg)` : "";
      setSlide(1, ramp(k, 1.28, 1.4) * (1 - ramp(k, 2.0, 2.08)), xf);
      const br = breath01(performance.now());
      const sc = (1 + 1.9 * pull * pull) * (1 + 0.022 * (br - 0.5) * 2);
      if (breathe) breathe.style.transform = `rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
      if (hair) hair.style.transform = `scaleX(${(0.3 + 0.7 * br).toFixed(3)})`;
    } else setSlide(1, 0, "");

    // C · louder: the phrase fires out of the horn word by word, then lands as one enormous line.
    if (k > 2.22 && k < 2.92) {
      reveal(headWords[2], k, 2.26, 0.01, 0.06);
      const R = window.innerHeight * 0.16;
      flies.forEach((w, j) => {
        const pass = 2.3 + j * 0.036;
        const z = (k - pass) * 16000;
        const o = clamp01((z + 800) / 300) * (1 - clamp01((z - 100) / 320));
        w.style.opacity = o.toFixed(3);
        if (o > 0) {
          const ang = (j * 2.4 + 0.6) % (Math.PI * 2);
          w.style.transform = `perspective(800px) translate3d(-50%, -50%, ${Math.min(z, 700).toFixed(0)}px) translate(${(Math.cos(ang) * R * 1.6).toFixed(0)}px, ${(Math.sin(ang) * R).toFixed(0)}px) rotate(${(((j % 3) - 1) * 4).toFixed(1)}deg)`;
        }
      });
      reveal(bodyWords[2], k, 2.47, 0.009, 0.06);
      const land = smooth((k - 2.47) / 0.1);
      const out = ramp(k, 2.78, 2.9);
      if (finalC)
        finalC.style.transform =
          out > 0
            ? `perspective(900px) translate3d(0, 0, ${(out * 520).toFixed(0)}px)`
            : land < 1
              ? `scale(${(1 + 0.16 * (1 - land)).toFixed(4)})`
              : "";
      setSlide(2, ramp(k, 2.22, 2.27) * (1 - ramp(k, 2.82, 2.9)), "");
    } else setSlide(2, 0, "");
  };
  // Words rise through their masks in order, starting at k0 and spaced `each` apart (span = rise length).
  const reveal = (els: HTMLElement[], k: number, k0: number, each: number, span: number) => {
    els.forEach((el, j) => {
      const t = smooth((k - k0 - j * each) / span);
      el.style.transform = t >= 1 ? "" : `translate3d(0, ${((1 - t) * 112).toFixed(1)}%, 0)`;
    });
  };

  const amp = narrow ? 0.55 : 1;
  let cs = -1;
  let cu = 0;
  let act = "";
  let chapter = -1;
  let lean = 0;
  let tpx = 0;
  let tpy = 0;
  let coreInk = false;
  let heroFlag = false;
  let dimFlag = false;

  const tick = (_t: number, dtMs: number) => {
    const dt = Math.min(dtMs / 1000, 0.05);
    let sp = uAt(window.scrollY);
    if (reduce) {
      // act switches and craft scenes become clean cuts
      const L = CRAFT_LEN;
      if (sp > 2 + L && sp < 3 + L) sp = sp < 2.5 + L ? 2 + L : 3 + L;
      if (sp > 5 + L && sp < 6 + L) sp = sp < 5.5 + L ? 5 + L : 6 + L;
      if (sp > CRAFT_S0 && sp < CRAFT_S0 + L) {
        const k = sp - CRAFT_S0;
        sp = CRAFT_S0 + (k < 1 ? 0.6 : k < 2 ? 1.8 : 2.6);
      }
    }
    scene.s = sp;
    scene.u = legacyU(sp);
    if (cs < 0 || reduce) cs = sp;
    else cs += (sp - cs) * (1 - Math.exp(-dt * 6.5));
    if (Math.abs(cs - sp) < 0.0004) cs = sp;
    scene.cs = cs;
    cu = legacyU(cs);
    scene.cu = cu;
    const ck = cs > CRAFT_S0 && cs < CRAFT_S0 + CRAFT_LEN ? cs - CRAFT_S0 : -1;
    scene.ck = ck;

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
    const a =
      ck < 0 ? String(actOf(cu)) : ck < 0.2 ? "1" : ck < 1.12 ? "a" : ck < 2.1 ? "b" : ck < 2.88 ? "c" : "1";
    if (a !== act) {
      act = a;
      root.dataset.act = a;
      scene.act = a;
      if (hudHint) {
        hudHint.textContent = HINTS[a][touch ? 1 : 0];
        hudHint.classList.remove("v5-flash");
        void hudHint.offsetWidth;
        hudHint.classList.add("v5-flash");
      }
    }
    // Craft starts with its first slide; Skills also starts when its title card arrives in the core transit.
    let ch = 0;
    const y = window.scrollY;
    heads.forEach((h, i) => {
      if (i === 1 ? cs >= CRAFT_S0 + 0.24 : y >= h.start || (i === 2 && cu >= 2.7 && ck < 0)) ch = i + 1;
    });
    if (ch !== chapter) {
      chapter = ch;
      if (hudChapter) hudChapter.textContent = `${String(ch).padStart(2, "0")} ${CHAPTERS[ch]}`;
    }
    if (hudBar) hudBar.style.transform = `scaleX(${(cs / STORY_END).toFixed(4)})`;
    if (reduce) return;

    craftTick(ck);

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
