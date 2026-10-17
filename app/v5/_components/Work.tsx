"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { chapters, projects } from "@/content/profile";
import s from "../v5.module.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const pad = (n: number) => String(n).padStart(2, "0");

export default function Work() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const years = projects.map((p) => p.year);
  const first = Math.min(...years);
  const last = Math.max(...years);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
        const el = track.current!;
        const dist = () => el.scrollWidth - window.innerWidth;
        const plates = gsap.utils.toArray<HTMLElement>("[data-swing]", el);
        let centers: number[] = [];
        const measure = () => {
          centers = plates.map((p) => p.offsetLeft + p.offsetWidth / 2);
        };
        // Plates swing on a curved stage: rotateY and depth follow each plate's distance from screen centre.
        const swing = () => {
          const x = gsap.getProperty(el, "x") as number;
          const vw = window.innerWidth;
          plates.forEach((p, i) => {
            const c = (centers[i] + x - vw / 2) / vw;
            const k = Math.max(-1.4, Math.min(1.4, c));
            p.style.transform = `perspective(1500px) translate3d(0,0,${(-Math.abs(k) * 260).toFixed(1)}px) rotateY(${(-k * 30).toFixed(2)}deg)`;
          });
        };
        let shown = -1;
        const move = gsap.to(el, {
          x: () => -dist(),
          ease: "none",
          onUpdate: swing,
          scrollTrigger: {
            id: "v5-work-pin",
            trigger: root.current,
            start: "top top",
            end: () => `+=${dist()}`,
            pin: true,
            scrub: 0.8,
            invalidateOnRefresh: true,
            onRefresh: () => {
              measure();
              swing();
            },
            onUpdate: (self) => {
              bar.current!.style.transform = `scaleX(${self.progress})`;
              const idx = Math.min(projects.length, Math.max(1, Math.round(self.progress * (projects.length - 1)) + 1));
              if (idx !== shown && counter.current) {
                shown = idx;
                counter.current.textContent = pad(idx);
              }
            },
          },
        });
        measure();
        swing();
        gsap.utils.toArray<HTMLElement>("[data-numeral]").forEach((n) => {
          gsap.fromTo(
            n,
            { xPercent: 28 },
            {
              xPercent: -28,
              ease: "none",
              scrollTrigger: { trigger: n.parentElement, containerAnimation: move, start: "left right", end: "right left", scrub: true },
            }
          );
        });
        gsap.utils.toArray<HTMLElement>("[data-plate-rule]").forEach((r) => {
          gsap.fromTo(
            r,
            { scaleY: 0 },
            {
              scaleY: 1,
              ease: "none",
              scrollTrigger: { trigger: r.parentElement, containerAnimation: move, start: "left 95%", end: "left 45%", scrub: true },
            }
          );
        });
        return () => plates.forEach((p) => (p.style.transform = ""));
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section tabIndex={-1} id="v5-work" ref={root} className={`${s.act2} ${s.work}`} aria-labelledby="v5-work-h">
      <header className={`${s.grid} ${s.secHead} ${s.workHead}`}>
        <span className={s.label}>(03)</span>
        <h2 id="v5-work-h" className={s.secTitle}>
          {chapters.work}
        </h2>
        <span className={`${s.label} ${s.secAside} ${s.workCount}`}>
          <span>
            <span ref={counter}>01</span> / {pad(projects.length)}
          </span>
          <span className={s.workBar} aria-hidden="true">
            <span ref={bar} />
          </span>
        </span>
      </header>

      <div ref={track} className={s.track}>
        <div className={s.workIntro} data-swing>
          <p className={s.workIntroBig}>
            {last}
            <br />—{first}
          </p>
        </div>
        {projects.map((p, i) => (
          <article key={p.id} className={s.plate} aria-labelledby={`v5-p-${p.id}`} data-swing>
            <span className={s.plateRule} data-plate-rule aria-hidden="true" />
            <div className={s.plateNumWrap} aria-hidden="true">
              <span className={s.plateNum} data-numeral>
                {pad(i + 1)}
              </span>
            </div>
            <div className={s.plateBody}>
              <p className={s.plateMeta}>
                <span>{p.kind}</span>
                <span>{p.year}</span>
              </p>
              <h3 id={`v5-p-${p.id}`} className={s.plateName}>
                {p.name}
              </h3>
              <p className={s.plateDesc}>{p.desc}</p>
              <p className={s.plateStack}>{p.stack.join(", ")}</p>
              {p.link && (
                <a className={s.plateLink} href={p.link} target="_blank" rel="noreferrer">
                  <span>{p.link.replace(/^https?:\/\//, "")}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {!p.link && p.status && <p className={s.plateStatus}>{p.status}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
