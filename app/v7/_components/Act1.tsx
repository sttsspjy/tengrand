"use client";

import { useEffect, useRef } from "react";
import { registerPart, requestLayout, sub, smooth, easeInOut, type Frame } from "../_lib/stage";
import { Track, type Pose } from "../_lib/track";
import { graphHandle } from "./GraphPlate";
import s from "../act1.module.css";

// Act I camera: the manuscript is one vast sheet laid in 3D. Regions (hero, about, plate) sit on it at
// their own angles; scroll flies a camera between them (pan + crane + bank), then dives into the
// graph's centre node, whose disc becomes the portal into Act II.

type Reg = { cx: number; cy: number; w: number; h: number; rot: number };

const DEG = Math.PI / 180;

export default function Act1({ children }: { children: React.ReactNode }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const routeSvg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const sheet = sheetRef.current!;
    const rig = rigRef.current!;
    const root = sheet.closest<HTMLElement>("[data-codex]")!;
    const portal = root.querySelector<HTMLElement>("[data-portal]");
    const rimSvg = root.querySelector<SVGSVGElement>("[data-rim]");
    const rims = rimSvg ? Array.from(rimSvg.querySelectorAll<SVGCircleElement>("circle")) : [];
    if (window.scrollY > 40) rig.style.animation = "none";

    let track: Track | null = null;
    let graphPose: Pose = { cx: 0, cy: 0, s: 1, tilt: 0, rot: 0 };
    let C = { x: 0, y: 0 };
    let lastKey = "";
    let clip = "";
    let fade = "";
    const setClip = (v: string, op = "1") => {
      if (!portal) return;
      if (v !== clip) {
        clip = v;
        portal.style.clipPath = v;
      }
      if (op !== fade) {
        fade = op;
        portal.style.opacity = op;
        // while pre-painted under the plate, Act II must not swallow the sphere's pointer input
        const layer = portal.parentElement;
        if (layer) layer.style.pointerEvents = op === "1" ? "" : "none";
      }
    };

    const regionOf = (name: string): { el: HTMLElement; r: Reg } => {
      const el = sheet.querySelector<HTMLElement>(`[data-region="${name}"]`)!;
      // the leaf's own angle comes from CSS (`rotate`), which differs per breakpoint and is off for reduced motion
      const rv = getComputedStyle(el).rotate;
      const rot = !rv || rv === "none" ? 0 : parseFloat(rv);
      return { el, r: { cx: el.offsetLeft + el.offsetWidth / 2, cy: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth, h: el.offsetHeight, rot } };
    };
    /** camera pose that frames a region upright, offset `dy` along its own vertical axis */
    const poseFor = (r: Reg, dy = 0): Pose => ({
      cx: r.cx - Math.sin(r.rot * DEG) * dy,
      cy: r.cy + Math.cos(r.rot * DEG) * dy,
      s: 1,
      tilt: 0,
      rot: -r.rot,
    });
    /** point given in region-local px (from its top-left), in sheet coordinates */
    const local = (r: Reg, lx: number, ly: number) => {
      const dx = lx - r.w / 2;
      const dy = ly - r.h / 2;
      const c = Math.cos(r.rot * DEG);
      const sn = Math.sin(r.rot * DEG);
      return { x: r.cx + dx * c - dy * sn, y: r.cy + dx * sn + dy * c };
    };

    let track2: Track | null = null;
    let a1Len = 0;
    const plate = { len: 0, anchors: {} as Record<string, number> };

    const un = registerPart("act1", {
      owns: "a1",
      measure: (vw, vh, mobile) => {
        const hero = regionOf("hero");
        const about = regionOf("about");
        const graph = regionOf("graph");
        const extra = Math.max(0, about.r.h - vh * 0.9);
        const aboutEnd = poseFor(about.r, extra / 2);
        // exit into Craft: the camera drops to a grazing angle over the manuscript and rushes forward
        const graze: Pose = { ...poseFor(about.r, extra / 2 - vh * (mobile ? 0.9 : 0.75)), tilt: 76, s: mobile ? 1.15 : 1.5 };
        const segs = [
          { kind: "hold" as const, a: poseFor(hero.r), len: 0.3 * vh, id: "top" },
          { kind: "fly" as const, len: 1.0 * vh, arc: { tilt: 38, s: -0.42, rot: -7 } },
          { kind: "hold" as const, a: poseFor(about.r, -extra / 2), b: aboutEnd, len: 0.4 * vh + extra * 1.15, id: "about" },
          { kind: "fly" as const, len: 0.95 * vh, ease: (t: number) => t * t * (1.6 - 0.6 * t) },
          { kind: "hold" as const, a: graze, len: 0 },
        ];
        track = new Track(segs);
        a1Len = track.total;
        // the plate part: Craft's last scene hands back to the manuscript from high overhead, spinning in
        graphPose = poseFor(graph.r);
        const entry: Pose = { ...graphPose, s: mobile ? 0.16 : 0.2, rot: graphPose.rot + 150, tilt: 18 };
        track2 = new Track([
          { kind: "hold", a: entry, len: 0 },
          { kind: "fly", len: 1.05 * vh, ease: (t: number) => 1 - Math.pow(1 - t, 3), arc: { tilt: 26 } },
          { kind: "hold", a: graphPose, len: 0.85 * vh, id: "plate" },
        ]);
        plate.len = track2.total;
        plate.anchors = { plate: track2.startOf("plate") + 0.1 * vh };
        hero.el.dataset.span = "0.3";
        about.el.dataset.span = String(segs[2].len / vh);
        graph.el.dataset.span = "0.95";
        // centre of the graph canvas, in sheet coordinates (offsets are untransformed layout)
        const cv = graph.el.querySelector("canvas");
        if (cv) {
          let lx = cv.offsetWidth / 2;
          let ly = cv.offsetHeight / 2;
          let n: HTMLElement | null = cv as unknown as HTMLElement;
          while (n && n !== graph.el) {
            lx += n.offsetLeft;
            ly += n.offsetTop;
            n = n.offsetParent as HTMLElement | null;
          }
          C = local(graph.r, lx, ly);
        }
        // atlas route between the three stations
        const a = local(hero.r, hero.r.w * 0.5, hero.r.h + 30);
        const b = local(about.r, about.r.w * 0.3, -30);
        const c2 = local(about.r, about.r.w + 30, about.r.h * 0.35);
        const d = local(graph.r, -30, graph.r.h * 0.62);
        routeRef.current?.setAttribute(
          "d",
          `M${a.x} ${a.y}C${a.x} ${a.y + 260} ${b.x} ${b.y - 260} ${b.x} ${b.y}M${c2.x} ${c2.y}C${c2.x + 320} ${c2.y} ${d.x - 320} ${d.y} ${d.x} ${d.y}`
        );
        routeSvg.current?.setAttribute("viewBox", `0 0 ${sheet.offsetWidth} ${sheet.offsetHeight}`);
        lastKey = "";
        return { len: track.total, anchors: { top: 0, about: track.startOf("about") } };
      },
      update: (f: Frame) => {
        if (!track || !track2) return;
        const { y, L, vw, vh } = f;
        const active = y >= L.pl.start - vh * 0.6 && y < L.t1.start + L.t1.len * 0.4;
        if (active !== graphHandle.active) {
          graphHandle.active = active;
          graphHandle.engine?.setActive(active);
        }
        if (y >= L.t1.start + L.t1.len) {
          setClip("none");
          if (rimSvg) rimSvg.style.visibility = "hidden";
          return;
        }
        // off-stage while Craft plays
        if (y >= L.cr.start + 0.45 * vh && y < L.pl.start - 0.7 * vh) {
          setClip("circle(0px at 50% 50%)");
          return;
        }
        let pose: Pose;
        let R = 0;
        const p = f.p1;
        if (y < L.pl.start - 0.7 * vh) {
          pose = track.at(Math.min(y, a1Len), f.reduced);
          // past the end of Act I keep the grazing rush going at the exit speed
          if (y > a1Len && !f.reduced) {
            const prev = track.at(a1Len - 8);
            const k = (y - a1Len) / 8;
            for (const key in pose) pose[key] += (pose[key] - prev[key]) * k;
            pose.tilt = Math.min(80, pose.tilt);
          }
        } else if (y < L.t1.start) pose = track2.at(y - L.pl.start, f.reduced);
        else {
          const k = f.reduced ? 0 : smooth(sub(p, 0, 0.22));
          const zoom = f.reduced ? 1 : Math.pow(70, Math.pow(p, 1.9));
          pose = {
            cx: graphPose.cx + (C.x - graphPose.cx) * k,
            cy: graphPose.cy + (C.y - graphPose.cy) * k,
            s: zoom,
            tilt: f.reduced ? 0 : 10 * Math.sin(Math.PI * p),
            rot: graphPose.rot + (f.reduced ? 0 : 34 * easeInOut(p)),
          };
          const cover = Math.hypot(vw, vh) / 2 + 30;
          R = f.reduced ? (p >= 0.5 ? cover + 10 : 0) : 6 * zoom * k + cover * Math.pow(smooth(sub(p, 0.5, 0.97)), 1.4);
        }
        const key = `${pose.cx.toFixed(1)}|${pose.cy.toFixed(1)}|${pose.s.toFixed(4)}|${pose.tilt.toFixed(2)}|${pose.rot.toFixed(2)}|${vw}|${vh}`;
        if (key !== lastKey || f.fresh) {
          lastKey = key;
          sheet.style.transform = `translate3d(${vw / 2}px, ${vh / 2}px, 0) rotateX(${pose.tilt.toFixed(3)}deg) rotateZ(${pose.rot.toFixed(3)}deg) scale(${pose.s.toFixed(5)}) translate3d(${(-pose.cx).toFixed(2)}px, ${(-pose.cy).toFixed(2)}px, 0)`;
        }
        // portal into Act II through the centre node
        // just before the dive Act II is painted unclipped at near-zero opacity, so the portal opens on a warm layer
        if (y >= L.t1.start) setClip(`circle(${R.toFixed(1)}px at 50% 50%)`);
        else if (y >= L.t1.start - 0.7 * vh) setClip("none", "0.001");
        else setClip("circle(0px at 50% 50%)");
        if (rimSvg) {
          const show = y >= L.t1.start && R > 1 && R < Math.hypot(vw, vh) / 2 + 20 && !f.reduced;
          rimSvg.style.visibility = show ? "visible" : "hidden";
          if (show) {
            const ring = 4.5 * pose.s;
            rims[0]?.setAttribute("r", R.toFixed(1));
            rims[1]?.setAttribute("r", Math.max(0, R - 7).toFixed(1));
            rims[2]?.setAttribute("r", (R + ring).toFixed(1));
            for (const c of rims) {
              c.setAttribute("cx", String(vw / 2));
              c.setAttribute("cy", String(vh / 2));
            }
          }
        }
      },
    });
    // the plate's own span (pl); Act I's update above drives both spans
    const unPlate = registerPart("act1-plate", { owns: "pl", measure: () => ({ len: plate.len, anchors: plate.anchors }), update: () => {} });
    const ro = new ResizeObserver(() => requestLayout());
    sheet.querySelectorAll("[data-region]").forEach((el) => ro.observe(el));
    return () => {
      un();
      unPlate();
      ro.disconnect();
    };
  }, []);

  return (
    <div className={s.layer} data-layer="a1" data-on ref={layerRef}>
      <div className={s.desk} aria-hidden />
      <div className={s.rig} ref={rigRef}>
        <div className={s.sheet} ref={sheetRef}>
          <div className={s.sheetDeco} aria-hidden>
            <span className={s.bigNumeral}>I</span>
            <span className={s.compass} />
          </div>
          <svg className={s.route} ref={routeSvg} aria-hidden preserveAspectRatio="none">
            <path ref={routeRef} className={s.routePath} />
          </svg>
          {children}
        </div>
      </div>
    </div>
  );
}
