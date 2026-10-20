"use client";

import { useEffect, useRef, useState } from "react";
import { capabilities, chapters, projects } from "@/content/profile";
import { BY_ID, backlinks, itemId, search, slug, stackOf } from "../_lib/kb";
import { registerPart, sub, easeInOut, smooth, lerp, type Frame } from "../_lib/stage";
import { Track, mix, type Pose, type Seg } from "../_lib/track";
import { goTo } from "../_lib/scroll";
import { Machine, U, type Cam } from "./machine";
import s from "../act2.module.css";

// Act II controller: scroll → camera track over the machine, portal camera during the dive (t1),
// top-down feed during the press (t2), drag-to-orbit with inertia, query pulses with a camera override.

const PRESETS = ["GraphRAG", "Local LLMs", "Electron", "React", "Vercel"];

const stackH = (i: number) => 520 + (capabilities[i].items.length - 1) * 148;

const station = (i: number, mobile: boolean): Pose => {
  const H = stackH(i);
  return {
    tx: i * U,
    ty: H * 0.5,
    tz: 0,
    yaw: i % 2 ? 0.58 : -0.58,
    pitch: 0.3,
    dist: mobile ? Math.max(2000, H * 1.75) : Math.max(1750, H * 1.6),
    ex: 1,
    ux: i,
    sx: mobile ? 0.5 : 0.36,
    sy: mobile ? 0.44 : 0.54,
  };
};
const INTRO = (m: boolean): Pose => ({ tx: 2.3 * U, ty: 120, tz: 0, yaw: -0.85, pitch: 0.48, dist: m ? 9800 : 6200, ex: 0, ux: -1.6, sx: 0.5, sy: m ? 0.6 : 0.6 });
const FAR: Pose = { tx: 2.5 * U, ty: 0, tz: 0, yaw: -2.9, pitch: 1.25, dist: 30000, ex: 0, ux: -1.6, sx: 0.5, sy: 0.5 };
const OUT = (m: boolean): Pose => ({ tx: 2.45 * U, ty: 0, tz: 0, yaw: 0, pitch: 1.42, dist: m ? 15000 : 6600, ex: 0, ux: 6.6, sx: 0.5, sy: 0.5 });
const OVERVIEW = (m: boolean): Pose => ({ tx: 2.4 * U, ty: 260, tz: 0, yaw: -0.42, pitch: 0.62, dist: m ? 10500 : 6000, ex: 0.35 });

export default function Act2() {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const machineRef = useRef<Machine | null>(null);
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ lines: { text: string; anchor?: string }[] } | null>(null);
  const [hitKeys, setHitKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const layer = layerRef.current!;
    const canvas = canvasRef.current!;
    const cs = getComputedStyle(layer);
    const font = cs.getPropertyValue("--f-tech").trim() || "monospace";
    const m = new Machine(canvas, font);
    // cyanotype mottle + paper grain, tiled; drawn to small canvases instead of SVG turbulence
    const paper = layer.querySelector<HTMLElement>("[data-paper]");
    if (paper) {
      const tile = (size: number, paint: (c: CanvasRenderingContext2D) => void) => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        paint(c.getContext("2d")!);
        return `url(${c.toDataURL()})`;
      };
      let seed = 11;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const mottle = tile(300, (c) => {
        for (let i = 0; i < 70; i++) {
          const x = rnd() * 300;
          const y = rnd() * 300;
          const r = 30 + rnd() * 90;
          const a = 0.05 + rnd() * 0.12;
          for (const dx of [-300, 0, 300])
            for (const dy of [-300, 0, 300]) {
              const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
              g.addColorStop(0, `rgba(5,22,56,${a})`);
              g.addColorStop(1, "rgba(5,22,56,0)");
              c.fillStyle = g;
              c.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
            }
        }
      });
      const grain = tile(200, (c) => {
        const img = c.createImageData(200, 200);
        for (let i = 0; i < img.data.length; i += 4) {
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = rnd() * 22;
        }
        c.putImageData(img, 0, 0);
      });
      paper.style.setProperty("--mottle", mottle);
      paper.style.setProperty("--grain", grain);
    }
    machineRef.current = m;
    const units = Array.from(layer.querySelectorAll<HTMLElement>("[data-unit]"));
    const lis = units.map((u) => Array.from(u.querySelectorAll<HTMLElement>("li[data-k]")));
    const intro = layer.querySelector<HTMLElement>("[data-intro]");
    let track: Track | null = null;
    let mobile = false;
    let size = { w: 0, h: 0 };
    let on = -1;
    let phase = "";
    let introOn = false;
    // orbit
    const orbit = { yaw: 0, pitch: 0, vy: 0, vp: 0, drag: null as null | { id: number; x: number; y: number; t: number; touch: boolean } };
    let override = 0;
    let slowFrames = 0;
    let dprCap = 1.5;

    const build = (vh: number, mob: boolean) => {
      const segs: Seg[] = [{ kind: "hold", a: INTRO(mob), len: 0.65 * vh, id: "skills" }];
      for (let i = 0; i < 6; i++) {
        segs.push(
          i === 0
            ? { kind: "fly", len: 0.62 * vh, arc: { pitch: 0.12, yaw: -0.3 } }
            : { kind: "fly", len: 0.52 * vh, arc: { ex: -1, dist: 900, pitch: i % 2 ? 0.16 : -0.1, ty: 120 } }
        );
        segs.push({ kind: "hold", a: station(i, mob), len: 0.5 * vh, id: `entry-${capabilities[i].id}` });
      }
      segs.push({ kind: "fly", len: 0.8 * vh, arc: { dist: 1400 } });
      segs.push({ kind: "hold", a: OUT(mob), len: 0.12 * vh, id: "a2-out" });
      return new Track(segs);
    };

    const onDown = (e: PointerEvent) => {
      orbit.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== "mouse" };
      orbit.vy = orbit.vp = 0;
      if (e.pointerType === "mouse") canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      const d = orbit.drag;
      if (!d || d.id !== e.pointerId) return;
      const now = performance.now();
      const dts = Math.max(0.008, (now - d.t) / 1000);
      const dx = (e.clientX - d.x) * 0.0042;
      const dy = d.touch ? 0 : (e.clientY - d.y) * 0.003;
      orbit.yaw += dx;
      orbit.pitch = Math.max(-0.25, Math.min(0.7, orbit.pitch + dy));
      orbit.vy = dx / dts;
      orbit.vp = dy / dts;
      d.x = e.clientX;
      d.y = e.clientY;
      d.t = now;
    };
    const onUp = (e: PointerEvent) => {
      if (!orbit.drag || orbit.drag.id !== e.pointerId) return;
      if (performance.now() - orbit.drag.t > 90) orbit.vy = orbit.vp = 0;
      orbit.drag = null;
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    const un = registerPart("act2", {
      owns: "a2",
      measure: (vw, vh, mob) => {
        mobile = mob;
        track = build(vh, mob);
        size = { w: vw, h: vh };
        m.resize(vw, vh, dprCap);
        const anchors: Record<string, number> = { skills: 0 };
        capabilities.forEach((g) => (anchors[`entry-${g.id}`] = track!.startOf(`entry-${g.id}`) + 0.08 * vh));
        return { len: track.total, anchors };
      },
      update: (f: Frame) => {
        if (!track) return;
        const { L, y } = f;
        // visible a little before the dive so the canvas and layer are painted ahead of the portal
        const visible = y >= L.t1.start - 0.7 * f.vh && y < L.t2.start + L.t2.len;
        if (!visible) return;
        if (size.w !== f.vw || size.h !== f.vh) {
          size = { w: f.vw, h: f.vh };
          m.resize(f.vw, f.vh, dprCap);
        }
        // pose by phase
        let pose: Pose;
        let ph: string;
        if (y < L.a2.start) {
          ph = "portal";
          const e = f.reduced ? 1 : easeInOut(sub(f.p1, 0.12, 1));
          pose = mix(FAR, INTRO(mobile), e);
          pose.yaw += (1 - e) * 1.2;
        } else if (y >= L.t2.start) {
          ph = "press";
          pose = OUT(mobile);
          pose.tz -= (f.reduced ? 0 : 1) * 2400 * Math.pow(f.p2, 1.4);
        } else {
          ph = "a2";
          pose = track.at(y - L.a2.start, f.reduced);
        }
        if (ph !== phase) {
          phase = ph;
          layer.dataset.phase = ph;
        }
        // orbit inertia + spring home
        if (!orbit.drag) {
          orbit.yaw += orbit.vy * f.dt;
          orbit.pitch += orbit.vp * f.dt;
          const dec = Math.exp(-f.dt * 3);
          orbit.vy *= dec;
          orbit.vp *= dec;
          const k = Math.min(1, f.dt * 0.6);
          orbit.yaw -= orbit.yaw * k;
          orbit.pitch -= orbit.pitch * k;
        }
        if (ph === "a2") {
          pose.yaw += orbit.yaw;
          pose.pitch = Math.max(-0.1, Math.min(1.45, pose.pitch + orbit.pitch));
          // idle sway so the room breathes when nothing scrolls
          if (!f.reduced) {
            pose.yaw += Math.sin(f.now / 3100) * 0.035;
            pose.ty += Math.sin(f.now / 2300) * 14;
          }
          const busy = m.pulseBusy(f.now);
          override += ((busy ? 1 : 0) - override) * Math.min(1, f.dt * (busy ? 2.2 : 1.4));
          if (override > 0.001 && !f.reduced) {
            const ov = OVERVIEW(mobile);
            const w = smooth(override);
            for (const k in ov) pose[k] = lerp(pose[k], ov[k], w);
          }
        }
        const cam = pose as unknown as Cam;
        const t0 = performance.now();
        m.draw(cam, f.now, f.dt);
        // adaptive resolution: drop DPR if the canvas alone is slow for a while
        if (performance.now() - t0 > 9) slowFrames++;
        else slowFrames = Math.max(0, slowFrames - 1);
        if (slowFrames > 40 && dprCap > 1) {
          dprCap = 1;
          slowFrames = 0;
          m.resize(f.vw, f.vh, dprCap);
        }

        // active unit + label placement
        let next = -1;
        if (ph === "a2" && cam.ex > 0.55) {
          const r = Math.round(cam.ux);
          if (r >= 0 && r < 6 && Math.abs(cam.ux - r) < 0.3) next = r;
        }
        if (next !== on) {
          if (on >= 0) units[on].removeAttribute("data-on");
          if (next >= 0) units[next].setAttribute("data-on", "");
          on = next;
        }
        if (on >= 0 && !mobile) {
          for (const a of m.anchors) {
            if (a.unit !== on) continue;
            const el = lis[on][a.k];
            if (el) el.style.transform = `translate3d(${Math.round(a.x)}px, ${Math.round(a.y)}px, 0)`;
          }
        }
        const io = ph === "a2" && y - L.a2.start < 0.9 * f.vh;
        m.quiet = io && mobile;
        if (io !== introOn) {
          introOn = io;
          intro?.toggleAttribute("data-on", io);
        }
      },
    });
    return () => {
      un();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ---- query machine -------------------------------------------------------------------

  const fire = (raw: string) => {
    const m = machineRef.current;
    const hits = search(raw, 8);
    const keys = new Set<string>();
    const unitsHit = new Set<number>();
    const lines: { text: string; anchor?: string }[] = [];
    const addItem = (id: string) => {
      const e = BY_ID.get(id);
      if (!e || e.kind !== "item") return;
      const g = capabilities[e.index];
      keys.add(`${e.index}:${g.items.indexOf(e.label)}`);
      unitsHit.add(e.index);
    };
    for (const h of hits) {
      const e = h.entity;
      if (e.kind === "item") {
        addItem(e.id);
        lines.push({ text: `→ ${e.label} · ${capabilities[e.index].title}`, anchor: `entry-${capabilities[e.index].id}` });
      } else if (e.kind === "group") {
        unitsHit.add(e.index);
        lines.push({ text: `→ ${e.label}`, anchor: e.anchor });
      } else if (e.kind === "project") {
        const parts = stackOf(e.id).filter((x) => x.entity?.kind === "item");
        parts.forEach((x) => addItem(x.entity!.id));
        lines.push({ text: `→ ${e.label}${parts.length ? ` · ${parts.map((x) => x.name).join(", ")}` : ""}`, anchor: e.anchor });
      } else if (e.kind === "term") {
        lines.push({ text: `→ ${e.label} · ${projects[e.index].name}`, anchor: e.anchor });
      }
    }
    setHitKeys(keys);
    if (m) {
      m.hits = keys;
      m.hitUnits = unitsHit;
      const to = unitsHit.size ? Math.max(...unitsHit) * U : -1;
      m.pulse = to >= 0 ? { t0: performance.now(), to } : null;
    }
    setLog({ lines: lines.length ? lines.slice(0, 5) : [{ text: "No match" }] });
    return lines.find((l) => l.anchor)?.anchor;
  };

  useEffect(() => {
    if (!q.trim()) return;
    const id = window.setTimeout(() => fire(q.trim()), 320);
    return () => window.clearTimeout(id);
  }, [q]);

  const clear = () => {
    setQ("");
    setLog(null);
    setHitKeys(new Set());
    const m = machineRef.current;
    if (m) {
      m.hits = new Set();
      m.hitUnits = new Set();
      m.pulse = null;
    }
  };

  const setHover = (key: string | null) => {
    if (machineRef.current) machineRef.current.hover = key;
  };

  return (
    <div className={s.layer} data-layer="a2" ref={layerRef}>
      <div className={s.world} data-portal>
        <div className={s.paper} data-paper aria-hidden />
        <canvas ref={canvasRef} className={s.canvas} aria-hidden />
        <div className={s.frame} aria-hidden>
          {["A", "B", "C", "D"].map((z) => (
            <span key={z} className={s.zoneV}>
              {z}
            </span>
          ))}
          {["1", "2", "3", "4", "5", "6"].map((z) => (
            <span key={z} className={s.zoneH}>
              {z}
            </span>
          ))}
        </div>

        <section id="skills" className={s.cap} aria-labelledby="h-cap">
          <header className={s.intro} data-intro data-anchor="skills">
            <p className={s.introKick}>3</p>
            <h2 id="h-cap" className={s.introTitle}>
              {chapters.skills}
            </h2>
            <ol className={s.introList}>
              {capabilities.map((g, gi) => (
                <li key={g.id}>
                  <b>{String(gi + 1).padStart(2, "0")}</b> {g.title}
                </li>
              ))}
            </ol>
          </header>

          {capabilities.map((g, gi) => (
            <section key={g.id} id={`entry-${g.id}`} className={s.unit} data-unit={gi} data-anchor={`entry-${g.id}`} aria-labelledby={`h-${g.id}`}>
              <header className={s.block}>
                <div className={s.blockRow}>
                  <span>{chapters.skills}</span>
                  <span>
                    {String(gi + 1).padStart(2, "0")} / {String(capabilities.length).padStart(2, "0")}
                  </span>
                </div>
                <h3 id={`h-${g.id}`} className={s.blockTitle}>
                  {g.title}
                </h3>
                <p className={s.blockLine}>{g.line}</p>
              </header>
              <ul className={s.parts}>
                {g.items.map((it, k) => {
                  const bl = backlinks(itemId(it));
                  const key = `${gi}:${k}`;
                  return (
                    <li
                      key={it}
                      id={`entry-${slug(it)}`}
                      data-k={k}
                      data-hit={hitKeys.has(key) || undefined}
                      className={s.part}
                      tabIndex={0}
                      onPointerEnter={() => setHover(key)}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => setHover(key)}
                      onBlur={() => setHover(null)}
                    >
                      <span className={s.partNo}>{String(k + 1).padStart(2, "0")}</span>
                      <span className={s.partName}>{it}</span>
                      {bl.projects.length > 0 && (
                        <span className={s.partUsed}>{bl.projects.map((p) => p.label).join(", ")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </section>

        <div className={s.console} role="search" aria-label={chapters.skills}>
          <form
            className={s.feed}
            onSubmit={(e) => {
              e.preventDefault();
              if (!q.trim()) return;
              const first = fire(q.trim());
              if (first) goTo(first);
            }}
          >
            <label htmlFor="feed-q" className={s.feedLabel} aria-label="Search">
              →
            </label>
            <input
              id="feed-q"
              className={s.feedInput}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && clear()}
              placeholder="Type a skill or project"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="feed-log"
            />
          </form>
          <div className={s.presets}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={s.preset}
                onClick={() => {
                  setQ(p);
                  fire(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <output id="feed-log" className={s.log} aria-live="polite">
            {log ? (
              <>
                {log.lines.map((l, i) => (
                  <span key={i} className={s.logLine}>
                    {l.anchor ? (
                      <button type="button" className={s.logLink} onClick={() => goTo(l.anchor!)}>
                        {l.text}
                      </button>
                    ) : (
                      l.text
                    )}
                  </span>
                ))}
              </>
            ) : null}
          </output>
        </div>
      </div>
      <svg className={s.rim} data-rim aria-hidden>
        <circle data-r="0" className={s.rimRed} />
        <circle data-r="1" className={s.rimWhite} />
        <circle data-r="2" className={s.rimInk} />
      </svg>
    </div>
  );
}
