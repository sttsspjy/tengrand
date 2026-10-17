"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type MouseEvent } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import { chapters, profile } from "@/content/profile";
import { scene, lenisRef, HINTS } from "./state";
import { startDirector } from "./director";
import Hero from "./Hero";
import About from "./About";
import Capabilities from "./Capabilities";
import Work from "./Work";
import Contact, { Footer } from "./Contact";
import { Core, Shatter } from "./Transit";
import s from "../v5.module.css";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const Sculpture = dynamic(() => import("./Sculpture"), { ssr: false });

const NAV = [
  ["01", chapters.about, "#v5-about"],
  ["02", chapters.skills, "#v5-capabilities"],
  ["03", chapters.work, "#v5-work"],
  ["04", chapters.contact, "#v5-contact"],
] as const;

const INTERACTIVE = "a, button, input, textarea, select, label, [data-nodrag]";

export default function Monolith() {
  const root = useRef<HTMLDivElement>(null);
  const stageWrap = useRef<HTMLDivElement>(null);

  // Smooth scroll (Lenis on GSAP's ticker) + pointer: drag to turn, click to strike.
  useEffect(() => {
    const el = root.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scene.reduced = reduce;
    scene.narrow = window.innerWidth < 760;

    let down: {
      x: number;
      y: number;
      lx: number;
      ly: number;
      t: number;
      id: number;
      type: string;
      drag: boolean;
      strike: boolean;
    } | null = null;
    const setGrab = (on: boolean) => el.toggleAttribute("data-grabbing", on);
    scene.onOver = (over) => el.toggleAttribute("data-over", over);

    const onMove = (e: PointerEvent) => {
      scene.px = (e.clientX / window.innerWidth) * 2 - 1;
      scene.py = (e.clientY / window.innerHeight) * 2 - 1;
      scene.mx = e.clientX;
      scene.my = e.clientY;
      if (!down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!down.drag && down.type !== "mouse" && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        down.drag = true;
        scene.dragging = true;
      }
      if (Math.hypot(dx, dy) > 6) down.strike = false;
      if (down.drag) {
        scene.dragDX += e.clientX - down.lx;
        scene.dragDY += down.type === "mouse" ? e.clientY - down.ly : 0;
      }
      down.lx = e.clientX;
      down.ly = e.clientY;
    };
    const onDown = (e: PointerEvent) => {
      scene.lastInput = performance.now();
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest(INTERACTIVE)) return;
      const drag = e.pointerType === "mouse" && scene.out.over;
      down = {
        x: e.clientX,
        y: e.clientY,
        lx: e.clientX,
        ly: e.clientY,
        t: performance.now(),
        id: e.pointerId,
        type: e.pointerType,
        drag,
        strike: true,
      };
      if (drag) {
        scene.dragging = true;
        setGrab(true);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId) return;
      const d = down;
      down = null;
      scene.dragging = false;
      setGrab(false);
      scene.lastInput = performance.now();
      if (!d.strike || performance.now() - d.t > 450 || reduce) return;
      if (window.getSelection()?.toString()) return;
      scene.strikes.push({ x: e.clientX, y: e.clientY, amp: 1 });
      ripple(e.clientX, e.clientY);
    };
    const onCancel = () => {
      down = null;
      scene.dragging = false;
      setGrab(false);
    };
    const onLeave = () => {
      scene.mx = -1e4;
      scene.my = -1e4;
    };
    const noSelect = (e: globalThis.MouseEvent) => {
      if (scene.out.over && !(e.target as HTMLElement).closest(INTERACTIVE)) e.preventDefault();
    };
    const ripple = (x: number, y: number) => {
      const r = document.createElement("span");
      r.className = s.ripple;
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      el.appendChild(r);
      r.animate(
        [
          { transform: "translate(-50%,-50%) scale(0.1)", opacity: 1 },
          { transform: "translate(-50%,-50%) scale(1)", opacity: 0 },
        ],
        { duration: 900, easing: "cubic-bezier(0.16,1,0.3,1)" }
      ).onfinish = () => r.remove();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    document.documentElement.addEventListener("pointerleave", onLeave);
    el.addEventListener("mousedown", noSelect);

    let lenis: Lenis | null = null;
    let tick: ((t: number) => void) | null = null;
    if (!reduce) {
      lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
      lenisRef.current = lenis;
      lenis.on("scroll", ScrollTrigger.update);
      tick = (t: number) => lenis!.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }
    return () => {
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("mousedown", noSelect);
      scene.onOver = null;
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
      lenisRef.current = null;
    };
  }, []);

  useGSAP(
    (_ctx, contextSafe) => {
      const el = root.current!;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scene.reduced = reduce;

      // Created after the children so the Work pin is already measured.
      const stop = startDirector(el);

      // Nav hides while scrolling down, returns on scroll up; gains a backing once off the top.
      const nav = el.querySelector<HTMLElement>("nav")!;
      let hidden = false;
      let solid = false;
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          const y = self.scroll();
          const h = self.direction === 1 && y > 160;
          const sd = y > 40;
          if (h !== hidden) nav.toggleAttribute("data-hidden", (hidden = h));
          if (sd !== solid) nav.toggleAttribute("data-solid", (solid = sd));
        },
      });

      const finish = () => el.setAttribute("data-intro", "done");
      if (reduce) {
        finish();
        scene.introAt = performance.now();
        return stop;
      }

      const start = contextSafe!(() => {
        const split = SplitText.create("[data-statement]", { type: "lines", mask: "lines", linesClass: s.line });
        const tl = gsap.timeline({ onComplete: finish, defaults: { ease: "expo.out" } });
        tl.set(el, { attr: { "data-intro": "run" } })
          .fromTo(
            "[data-gridline]",
            { scaleY: 0 },
            { scaleY: 1, duration: 1.5, ease: "expo.inOut", stagger: { each: 0.045, from: "start" } },
            0
          )
          .call(() => (scene.introAt = performance.now()), [], 0.35)
          .fromTo(
            "[data-letter]",
            { yPercent: 108, y: 0 },
            { yPercent: 0, y: 0, duration: 1.6, stagger: { each: 0.07, from: "center" } },
            0.45
          )
          .fromTo("[data-meta]", { yPercent: 110, y: 0 }, { yPercent: 0, y: 0, duration: 1.1, stagger: 0.05 }, 0.9)
          .fromTo(split.lines, { yPercent: 105 }, { yPercent: 0, duration: 1.2, stagger: 0.08 }, 1.05)
          .fromTo("[data-nav]", { yPercent: -120, y: 0 }, { yPercent: 0, y: 0, duration: 1, stagger: 0.05 }, 1.1)
          .fromTo("[data-hud]", { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "power2.out" }, 1.6);
      });

      let fired = false;
      const go = () => {
        if (fired) return;
        fired = true;
        start();
      };
      document.fonts?.ready.then(go);
      const t = window.setTimeout(go, 1200);
      return () => {
        window.clearTimeout(t);
        stop();
      };
    },
    { scope: root }
  );

  useEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, []);

  const onNav = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    const target = document.querySelector<HTMLElement>(href);
    if (!target) return;
    e.preventDefault();
    if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 2.2 });
    else target.scrollIntoView({ behavior: "smooth" });
    target.focus({ preventScroll: true });
  };

  return (
    <div ref={root} className={s.page} data-intro="pending" data-act="1">
      <a className={s.skip} href="#v5-about">
        Skip to content
      </a>
      <div ref={stageWrap} className={s.stage} aria-hidden="true">
        <Sculpture onReady={() => stageWrap.current?.setAttribute("data-ready", "")} />
      </div>
      <div className={`${s.grid} ${s.gridLines}`} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} data-gridline />
        ))}
      </div>

      <nav className={`${s.grid} ${s.nav}`} aria-label="Primary">
        <a href="#v5-top" className={`${s.navBrand} ${s.mask}`} onClick={(e) => onNav(e, "#v5-top")}>
          <span data-nav>
            <i className={s.dot} aria-hidden="true" />
            {profile.name}
            <span className={s.navWorld}>Monolith</span>
          </span>
        </a>
        <ul className={s.navList}>
          {NAV.map(([n, label, href]) => (
            <li key={href} className={s.mask}>
              <a data-nav href={href} onClick={(e) => onNav(e, href)} className={s.navLink}>
                <span className={s.navNum}>{n}</span>
                <span className={s.navText}>{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={`${s.grid} ${s.hud}`} data-hud aria-hidden="true">
        <p className={s.hudAct}>
          <span className={s.hudLabel}>Monolith</span>
          <span data-hud-chapter>00 {chapters.intro}</span>
        </p>
        <span className={s.hudTrack}>
          <span data-hud-bar />
          <i style={{ left: `${(2.5 / 7) * 100}%` }} />
          <i style={{ left: `${(5.5 / 7) * 100}%` }} />
        </span>
        <p className={s.hudHint}>
          <span data-hud-hint>{HINTS[1][0]}</span>
        </p>
      </div>

      <main className={s.main}>
        <Hero />
        <About />
        <Core />
        <Capabilities />
        <Work />
        <Shatter />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
