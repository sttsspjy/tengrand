"use client";

import { useEffect, useRef } from "react";
import { profile, projects, chapters, capabilities } from "@/content/profile";
import { registerPart, sub, smooth, easeInOut, easeOut, lerp, clamp01, type Frame } from "../_lib/stage";
import { Track, type Pose, type Seg } from "../_lib/track";
import { drawHalftone } from "../_lib/halftone";
import { drawSeal, fontsOf } from "../_lib/seal";
import { stackOf, projectId } from "../_lib/kb";
import { goTo } from "../_lib/scroll";
import type { Library, LibCam, LibSpec, Slot } from "./library";
import Poster from "./Poster";
import s from "../act3.module.css";

// Act III: the press (t2) prints the title sheet in three passes; then the sheet is bound into a book and
// shelved, and the camera pulls back into an infinite hexagonal library (WebGL riso print, library.ts) and
// spirals down its well. At each project's level a book slides out, flies to the camera and opens into a
// spread (CSS 3D, crisp DOM text). Contact is a library card on the reading desk at the bottom of the well.

const INKS = { orange: "#ff5d1f", teal: "#0b8a8c", black: "#1c1a19" };
const PASS: [number, number][] = [
  [0.05, 0.4],
  [0.36, 0.67],
  [0.63, 0.93],
];
const LEVELS = [1, 2, 3, 4];
const BOT = 6;
const LH = 6;
const EYE = 2.4;

type Geo = { vw: number; vh: number; mobile: boolean; bw: number; bh: number; bt: number; top: boolean; T: number };

/** the camera pose that faces wall `wall` of `level` from across the void */
const facing = (level: number, wall: number, yaw: number, fov: number, back = 2.2): Pose => ({
  cy: -level * LH + EYE,
  ca: yaw + 180,
  cr: back,
  yaw,
  pitch: -2,
  roll: 0,
  fov,
});

export default function Act3() {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const layer = layerRef.current!;
    const canvas = canvasRef.current!;
    const root = layer.closest<HTMLElement>("[data-codex]")!;
    const footer = root.querySelector<HTMLElement>("[data-footer]");
    const passes = Array.from(layer.querySelectorAll<HTMLElement>("[data-pass]"));
    const rollers = Array.from(layer.querySelectorAll<HTMLElement>("[data-roller]"));
    const titleOrange = layer.querySelector<HTMLCanvasElement>("[data-ht-orange]");
    const titleTeal = layer.querySelector<HTMLCanvasElement>("[data-ht-teal]");
    const postmark = layer.querySelector<HTMLCanvasElement>("[data-postmark]");
    const bind = layer.querySelector<HTMLElement>("[data-bind]")!;
    const bindStage = bind.parentElement!;
    const books = Array.from(layer.querySelectorAll<HTMLElement>("[data-book]"));
    const rigs = books.map((b) => b.querySelector<HTMLElement>("[data-rig]")!);
    const leaves = books.map((b) => b.querySelector<HTMLElement>("[data-leaf]")!);
    const card = layer.querySelector<HTMLElement>("[data-card]")!;
    const cardRig = card.querySelector<HTMLElement>("[data-card-rig]")!;

    let lib: Library | null = null;
    let libLoading = false;
    let dead = false;
    let spec: LibSpec | null = null;
    let track: Track | null = null;
    let stations: { at: number; len: number }[] = [];
    let bindLen = 0;
    let deskFly = { at: 0, len: 0 };
    let contactAt = 0;
    let phase = "";
    let footOn = false;
    let lastKey = "";
    let G: Geo = { vw: 0, vh: 0, mobile: false, bw: 0, bh: 0, bt: 0, top: false, T: 0 };
    let dpr = 1;
    let slow = 0;
    const bookOn: boolean[] = books.map(() => false);
    let bindOn = true;
    let cardOn = false;
    let canvasOn = false;

    const fonts = fontsOf(root);
    document.fonts.ready.then(() => {
      if (postmark) drawSeal(postmark, postmark.offsetWidth || 180, INKS.teal, fonts, 5, `${profile.location} · ${profile.year} · ${profile.handle} · `.toUpperCase());
    });

    const paintTitle = () => {
      // pass 1: orange field that breaks into halftone toward the foot; pass 2: a halftone node (disc)
      if (titleOrange)
        drawHalftone(
          titleOrange,
          (u, v) => {
            const edge = 0.6 + 0.05 * Math.sin(u * 7.5 + 1);
            return v < edge - 0.26 ? 0 : v < edge ? ((v - edge + 0.26) / 0.26) * 1.3 : 1.3;
          },
          INKS.orange,
          Math.max(7, titleOrange.offsetWidth / 90),
          22,
          0.78,
          2
        );
      if (titleTeal)
        drawHalftone(
          titleTeal,
          (u, v) => {
            const w = titleTeal.offsetWidth;
            const h = titleTeal.offsetHeight;
            const portrait = h > w;
            const d = Math.hypot((u - (portrait ? 0.6 : 0.7)) * w, (v - (portrait ? 0.38 : 0.42)) * h) / (0.4 * Math.min(w, h));
            return d < 1 ? 1.15 - d * 0.75 : 0;
          },
          INKS.teal,
          Math.max(6, titleTeal.offsetWidth / 110),
          67,
          0.72,
          2
        );
    };
    document.fonts.ready.then(paintTitle);

    /** slots for the shelved title book and the four featured books, sized to the DOM books they stand for */
    const makeSpec = (g: Geo): LibSpec => {
      const A = g.vw / g.vh;
      const th = Math.min(0.88, 0.75 / A);
      const title: Slot = { level: 0, wall: 0, shelf: 2, u: 0.7, w: 0.11, h: th, d: Math.min(0.8, th * A) };
      const feature = LEVELS.map((L, i): Slot => {
        const wall = i % 2 ? 0 : 3;
        if (g.top) {
          const w = 0.66;
          return { level: L, wall, shelf: 2, u: -1.2, w, h: (w * g.bt) / g.bw, d: (w * g.bh) / g.bw };
        }
        const h = 0.9;
        return { level: L, wall, shelf: 2, u: -1.2, w: (h * g.bt) / g.bh, h, d: Math.min(0.8, (h * g.bw) / g.bh) };
      });
      return { title, feature };
    };

    const ensureLib = () => {
      if (lib || libLoading || !spec) return;
      libLoading = true;
      const go = () =>
        import("./library")
          .then(({ createLibrary }) => createLibrary(canvas, spec!))
          .then((l) => {
            if (dead) return l.destroy();
            lib = l;
            lib.resize(G.vw, G.vh, dpr);
            lastKey = "";
          })
          .catch(() => {
            layer.dataset.nogl = "";
          });
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(go, { timeout: 2500 });
      else window.setTimeout(go, 60);
    };

    const un = registerPart("act3", {
      owns: "a3",
      measure: (vw, vh, mobile) => {
        // book page size: side-bound spread on wide screens, top-bound (stacked pages) on phones
        const top = mobile && vh > vw;
        let bw: number;
        let bh: number;
        if (top) {
          bw = Math.min(vw - 24, 520);
          bh = Math.floor(Math.min((vh - 96) / 2, bw * 1.15));
        } else {
          bh = Math.min(vh - 132, 780);
          bw = Math.round(bh * 0.74);
          if (bw * 2 > vw - 72) {
            bw = Math.floor((vw - 72) / 2);
            bh = Math.round(bw / 0.74);
          }
        }
        const bt = Math.round(Math.max(14, (top ? bh : bw) * 0.07));
        const next: Geo = { vw, vh, mobile, bw, bh, bt, top, T: 0 };
        const sp = makeSpec(next);
        next.T = Math.round((vh * sp.title.w) / sp.title.h);
        const respec = !spec || G.top !== top || Math.abs(G.vw / G.vh - vw / vh) > 0.02 || G.bw !== bw || G.bh !== bh;
        G = next;
        if (respec) {
          spec = sp;
          lib?.setSpec(sp);
        }
        dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.25);
        lib?.resize(vw, vh, dpr);
        for (const b of books) {
          b.style.setProperty("--bw", `${bw}px`);
          b.style.setProperty("--bh", `${bh}px`);
          b.style.setProperty("--bt", `${bt}px`);
          b.dataset.bind = top ? "top" : "side";
        }
        bind.style.setProperty("--T", `${G.T}px`);
        bind.style.setProperty("--W", `${vw}px`);
        bind.style.setProperty("--H", `${vh}px`);

        const fov = mobile ? (vh > vw ? 66 : 54) : 50;
        const yaws = [180, 360, 540, 720];
        const shelf: Pose = { ...shelfPose(0, 0, sp.title.u - 0.3, mobile ? 3.4 : 3.3, 2.75), fov };
        const atrium: Pose = { cy: 7.2, ca: 172, cr: 2.6, yaw: 22, pitch: 9, roll: 0, fov: fov + 10 };
        const shaft: Pose = { cy: 9.5, ca: 270, cr: 0.35, yaw: 90, pitch: -86, roll: 0, fov: Math.min(96, fov + 36) };
        const deskYaw = top ? 1080 : 1170;
        const desk: Pose = { cy: -BOT * LH + (top ? 5.6 : 6.0), ca: deskYaw + 180, cr: 0.01, yaw: deskYaw, pitch: -90, roll: 0, fov: top ? 62 : 46 };
        const segs: Seg[] = [
          { kind: "hold", a: shelf, b: { ...shelf, cr: shelf.cr - 0.25 }, len: 1.2 * vh, id: "projects" },
          { kind: "fly", len: 1.05 * vh, arc: { roll: -5, cy: 1.2 }, ease: (t) => easeInOut(t) },
          { kind: "hold", a: atrium, b: { ...atrium, yaw: atrium.yaw + 6 }, len: 0.3 * vh, id: "atrium" },
          { kind: "fly", len: 0.95 * vh, arc: { roll: 6 } },
          { kind: "hold", a: shaft, b: { ...shaft, yaw: shaft.yaw + 10, cy: shaft.cy - 0.6 }, len: 0.3 * vh, id: "shaft" },
          { kind: "fly", len: 1.0 * vh, arc: { roll: -8, pitch: 10 } },
        ];
        projects.forEach((p, i) => {
          if (i > 0) segs.push({ kind: "fly", len: 1.0 * vh, arc: { pitch: -52, fov: 18, roll: i % 2 ? 9 : -9, cr: 0.5 } });
          const a = facing(LEVELS[i], i % 2 ? 0 : 3, yaws[i], fov);
          segs.push({ kind: "hold", a, b: { ...a, yaw: a.yaw + 2.5, cy: a.cy - 0.12 }, len: 1.5 * vh, id: `entry-${p.id}` });
        });
        segs.push({ kind: "fly", len: 1.45 * vh, arc: { pitch: -30, roll: 10, fov: 10 }, ease: (t) => easeInOut(t) });
        segs.push({ kind: "hold", a: desk, b: { ...desk, yaw: desk.yaw + 3 }, len: 0.9 * vh, id: "contact" });
        track = new Track(segs);
        bindLen = 1.2 * vh;
        stations = projects.map((p) => {
          const at = track!.startOf(`entry-${p.id}`);
          return { at, len: 1.5 * vh };
        });
        contactAt = track.startOf("contact");
        deskFly = { at: contactAt - 1.45 * vh, len: 1.45 * vh };
        lastKey = "";
        paintTitle();
        const anchors: Record<string, number> = { projects: 0, contact: contactAt + 0.1 * vh };
        projects.forEach((p, i) => (anchors[`entry-${p.id}`] = stations[i].at + 0.45 * stations[i].len));
        return { len: track.total, anchors };
      },
      update: (f: Frame) => {
        if (!track) return;
        const { y, L, vw, vh } = f;
        // build the library once the visitor reaches Skills (idle callback; off the scroll path)
        if (y >= L.a2.start) ensureLib();
        if (y < L.t2.start) return;
        const press = y < L.a3.start;
        const ly = y - L.a3.start;
        const ph = press ? "press" : "lib";
        if (ph !== phase) {
          phase = ph;
          layer.dataset.phase = ph;
          if (!press) for (const el of passes) el.style.clipPath = "none";
        }
        // ---- press passes: each ink is revealed above its roller as the roller travels down the sheet
        if (press) {
          const RH = rollers[0]?.offsetHeight ?? 100;
          PASS.forEach(([a, b], k) => {
            const u = sub(f.p2, a, b);
            const e = easeInOut(u);
            const yy = -RH / 2 + (vh + RH) * e;
            const el = passes[k];
            if (f.reduced) el.style.clipPath = f.p2 >= 0.5 ? "none" : "inset(0 0 100% 0)";
            else {
              const cut = Math.max(0, Math.min(100, (1 - yy / vh) * 100));
              el.style.clipPath = u >= 1 ? "none" : `inset(0 0 ${cut.toFixed(2)}% 0)`;
            }
            const r = rollers[k];
            if (r) {
              const show = !f.reduced && u > 0 && u < 1;
              r.style.visibility = show ? "visible" : "hidden";
              if (show) {
                r.style.transform = `translate3d(0, ${(yy - RH / 2).toFixed(1)}px, 0)`;
                r.style.backgroundPositionY = `0px, ${(e * 1400).toFixed(0)}px`;
              }
            }
          });
        } else for (const r of rollers) r.style.visibility = "hidden";

        const cam = track.at(Math.max(0, ly), f.reduced) as unknown as LibCam;

        // ---- the title sheet becomes a book and is shelved
        const bu = press ? 0 : ly / bindLen;
        const showBind = bu < 1;
        if (showBind !== bindOn) {
          bindOn = showBind;
          bindStage.style.display = showBind ? "" : "none";
        }
        let titleIn = bu >= 0.97;
        if (showBind) {
          if (bu <= 0.0001) {
            bind.style.transform = "none";
            bindStage.style.opacity = "1";
            bind.style.setProperty("--t", "0");
          } else if (lib && spec) {
            const rect = lib.spineRect(spec.title, cam, vw, vh);
            const b1 = smooth(sub(bu, 0.08, 0.52));
            const b2 = easeInOut(sub(bu, 0.5, 0.95));
            const sCover = G.mobile ? 0.5 : 0.44;
            const sSlot = rect.h / vh;
            const sc = f.reduced ? lerp(1, sSlot, b2) : Math.exp(lerp(Math.log(lerp(1, sCover, b1)), Math.log(sSlot), b2));
            const cx = lerp(0, rect.x + rect.w / 2 - vw / 2, b2);
            const cy2 = lerp(0, rect.y + rect.h / 2 - vh / 2, b2) - Math.sin(Math.PI * b2) * vh * 0.08;
            const ry = f.reduced ? 90 * b2 : lerp(-26 * b1, 90, b2);
            const rx = f.reduced ? 0 : 10 * Math.sin(Math.PI * Math.min(1, bu * 1.1));
            bind.style.setProperty("--t", b1.toFixed(3));
            bind.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy2.toFixed(1)}px, 0) scale(${sc.toFixed(4)}) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
            bindStage.style.opacity = bu > 0.94 ? String(clamp01((1 - bu) / 0.06)) : "1";
          } else {
            // library not built yet: keep the sheet as a closing cover
            titleIn = false;
            const b1 = smooth(sub(bu, 0.08, 0.9));
            bind.style.setProperty("--t", b1.toFixed(3));
            bind.style.transform = `scale(${lerp(1, 0.4, b1).toFixed(4)}) rotateY(${(-20 * b1).toFixed(2)}deg)`;
            bindStage.style.opacity = String(1 - sub(bu, 0.85, 1));
          }
        }

        // ---- library canvas
        const wantCanvas = !press && !!lib;
        if (wantCanvas !== canvasOn) {
          canvasOn = wantCanvas;
          canvas.style.visibility = wantCanvas ? "visible" : "hidden";
          lastKey = "";
        }

        // ---- featured books
        const hide = new Set<number>();
        stations.forEach((st, i) => {
          const u = (ly - st.at) / st.len;
          const on = !press && u > 0 && u < 1;
          if (on !== bookOn[i]) {
            bookOn[i] = on;
            books[i].toggleAttribute("data-on", on);
            if (!on) {
              rigs[i].style.transform = "";
              leaves[i].style.transform = "";
            }
          }
          if (!on) return;
          hide.add(i);
          const fly = f.reduced ? (u < 0.9 ? 1 : 0) : u < 0.28 ? easeInOut(sub(u, 0.02, 0.28)) : u < 0.9 ? 1 : 1 - easeInOut(sub(u, 0.92, 1));
          const open = f.reduced ? (u < 0.9 ? 1 : 0) : u < 0.86 ? easeInOut(sub(u, 0.27, 0.42)) : 1 - easeInOut(sub(u, 0.86, 0.93));
          bookPose(i, fly, open, cam, vw, vh, f.reduced);
          books[i].toggleAttribute("data-open", open > 0.96);
        });

        // ---- contact card on the desk
        const cu = (ly - deskFly.at) / deskFly.len;
        const co = !press && cu > 0.55;
        if (co !== cardOn) {
          cardOn = co;
          card.toggleAttribute("data-on", co);
        }
        if (co) {
          const k = f.reduced ? 1 : easeOut(sub(cu, 0.55, 1));
          cardRig.style.transform = `translate3d(0, ${((1 - k) * vh * 0.5).toFixed(1)}px, 0) rotate(${lerp(-24, -1.5, k).toFixed(2)}deg) scale(${lerp(1.35, 1, k).toFixed(4)})`;
          cardRig.style.opacity = String(clamp01(k * 1.6));
        }
        const fo = !press && ly > contactAt - 0.2 * vh;
        if (fo !== footOn) {
          footOn = fo;
          footer?.toggleAttribute("data-on", fo);
        }

        // ---- render the library when anything it shows changed
        if (lib && !press) {
          let hk = "";
          hide.forEach((i) => (hk += i));
          const key = `${cam.cy.toFixed(3)}|${cam.ca.toFixed(2)}|${cam.cr.toFixed(3)}|${cam.yaw.toFixed(2)}|${cam.pitch.toFixed(2)}|${cam.roll.toFixed(2)}|${cam.fov.toFixed(2)}|${hk}|${titleIn}|${vw}|${vh}`;
          if (key !== lastKey || f.fresh) {
            lastKey = key;
            lib.hide = hide;
            lib.titleOn = titleIn;
            const t0 = performance.now();
            lib.render(cam, vw, vh, 0.37);
            // adaptive resolution when the print pass is slow
            if (performance.now() - t0 > 7 || f.dt > 0.024) slow++;
            else slow = Math.max(0, slow - 1);
            if (slow > 45 && dpr > 0.8) {
              dpr = Math.max(0.8, dpr - 0.2);
              slow = 0;
              lib.resize(vw, vh, dpr);
              lastKey = "";
            }
          }
        }
      },
    });

    /** pose of the camera framing a shelf at `dist` in front of it, centred on tangential `u` */
    function shelfPose(level: number, wall: number, u: number, dist: number, eye: number): Pose {
      const th = (wall * Math.PI) / 3;
      const a = 11.5 - 0.88 - dist;
      const x = Math.cos(th) * a + Math.sin(th) * u;
      const z = Math.sin(th) * a - Math.cos(th) * u;
      return { cy: -level * LH + eye, ca: (Math.atan2(z, x) * 180) / Math.PI, cr: Math.hypot(x, z), yaw: wall * 60, pitch: -3, roll: 0, fov: 50 };
    }

    /** the DOM book i, from its shelf slot (fly 0, spine out) to the screen centre (fly 1), opened by `open` */
    function bookPose(i: number, fly: number, open: number, cam: LibCam, vw: number, vh: number, reduced: boolean) {
      const rig = rigs[i];
      const leaf = leaves[i];
      const { bw, bh, top } = G;
      if (reduced || !lib || !spec) {
        rig.style.transform = `translate3d(${top ? 0 : bw / 2}px, ${top ? bh / 2 : 0}px, 0)`;
        leaf.style.transform = top ? `translateZ(${G.bt / 2}px) rotateX(180deg)` : `translateZ(${G.bt / 2}px) rotateY(-180deg)`;
        return;
      }
      const rect = lib.spineRect(spec.feature[i], cam, vw, vh);
      const s0 = top ? rect.w / bw : rect.h / bh;
      const sc = Math.exp(lerp(Math.log(Math.max(0.01, s0)), 0, fly));
      const ox = top ? 0 : (bw / 2) * open;
      const oy = top ? (bh / 2) * open : 0;
      const x = lerp(rect.x + rect.w / 2 - vw / 2, ox, fly);
      const y = lerp(rect.y + rect.h / 2 - vh / 2, oy, fly) - Math.sin(Math.PI * fly) * vh * 0.1;
      const turn = 1 - smooth(sub(fly, 0.12, 0.85));
      const wob = Math.sin(Math.PI * fly);
      if (fly >= 1 && (open <= 0 || open >= 1)) {
        rig.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      } else if (top) {
        rig.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sc.toFixed(4)}) rotateX(${(-90 * turn).toFixed(2)}deg) rotateZ(${(wob * 5).toFixed(2)}deg)`;
      } else {
        rig.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sc.toFixed(4)}) rotateY(${(90 * turn).toFixed(2)}deg) rotateX(${(wob * 12).toFixed(2)}deg) rotateZ(${(wob * -4).toFixed(2)}deg)`;
      }
      leaf.style.transform = top ? `translateZ(${G.bt / 2}px) rotateX(${(180 * open).toFixed(2)}deg)` : `translateZ(${G.bt / 2}px) rotateY(${(-180 * open).toFixed(2)}deg)`;
    }

    return () => {
      dead = true;
      un();
      lib?.destroy();
    };
  }, []);

  const gh = profile.contact.github.replace(/^https?:\/\//, "");

  return (
    <div className={s.layer} data-layer="a3" ref={layerRef}>
      <canvas ref={canvasRef} className={s.lib} aria-hidden />

      {/* the title sheet the press prints; in Act III it is bound into a book (front = the sheet) and shelved */}
      <div className={s.bindStage}>
        <div className={s.bind} data-bind>
          <section className={s.titleSheet} data-anchor="projects" id="projects" aria-labelledby="h-works">
            <div className={s.passOrange} data-pass="0">
              <canvas className={s.htFill} data-ht-orange aria-hidden />
            </div>
            <div className={s.passTeal} data-pass="1" aria-hidden>
              <canvas className={s.htFill} data-ht-teal />
              <span className={s.tealRing} />
              <span className={`${s.tealRing} ${s.tealRing2}`} />
            </div>
            <div className={s.passKey} data-pass="2">
              <p className={s.tKick}>4</p>
              <h2 id="h-works" className={s.tTitle}>
                {chapters.work}
              </h2>
              <ol className={s.tList}>
                {projects.map((p, i) => (
                  <li key={p.id}>
                    <b>{String(i + 1).padStart(2, "0")}</b> {p.name}
                  </li>
                ))}
              </ol>
              <span className={`${s.reg} ${s.regTL}`} aria-hidden />
              <span className={`${s.reg} ${s.regTR}`} aria-hidden />
              <span className={`${s.reg} ${s.regBL}`} aria-hidden />
              <span className={s.bars} aria-hidden>
                <i style={{ background: INKS.orange }} />
                <i style={{ background: INKS.teal }} />
                <i style={{ background: INKS.black }} />
                <i style={{ background: "#3b2a1d" }} />
              </span>
            </div>
          </section>
          <span className={s.bSpine} aria-hidden>
            <b>{chapters.work}</b>
          </span>
          <span className={s.bFore} aria-hidden />
          <span className={s.bTop} aria-hidden />
          <span className={s.bBottom} aria-hidden />
          <span className={s.bBack} aria-hidden />
        </div>
      </div>

      <div className={s.rollers} aria-hidden>
        <div className={s.roller} data-roller data-ink="orange" />
        <div className={s.roller} data-roller data-ink="teal" />
        <div className={s.roller} data-roller data-ink="black" />
      </div>

      <div className={s.books}>
        {projects.map((p, i) => {
          const num = String(i + 1).padStart(2, "0");
          return (
            <section key={p.id} className={s.book} data-book={i} data-anchor={`entry-${p.id}`} id={`entry-${p.id}`} aria-labelledby={`h-${p.id}`}>
              <div className={s.rig} data-rig>
                <span className={s.fBack} aria-hidden />
                <span className={s.fSpine} aria-hidden>
                  <b>{p.name}</b>
                  <i>{num}</i>
                </span>
                <span className={s.fFore} aria-hidden />
                <span className={s.fTop} aria-hidden />
                <span className={s.fBottom} aria-hidden />
                <article className={s.pageR}>
                  <p className={s.runHead} aria-hidden>
                    <span>{chapters.work}</span>
                    <span>{num}</span>
                  </p>
                  <h3 id={`h-${p.id}`} className={s.bName} style={{ ["--len" as string]: Math.max(p.name.length, 5) } as React.CSSProperties}>
                    {p.name}
                  </h3>
                  <p className={s.bKind}>
                    {p.kind} · {p.year}
                  </p>
                  <p className={s.bDesc}>{p.desc}</p>
                  {/* the stack as a book index: item, dotted leader, the skill group it is shelved under */}
                  <ul className={s.bStack}>
                    {stackOf(projectId(p.id)).map(({ name, entity }) => (
                      <li key={name}>
                        {entity?.kind === "item" ? (
                          <a
                            href={`#${entity.anchor}`}
                            onClick={(e) => {
                              e.preventDefault();
                              goTo(entity.anchor);
                            }}
                          >
                            {name}
                          </a>
                        ) : (
                          <span>{name}</span>
                        )}
                        <i aria-hidden />
                        <small>{entity?.kind === "item" ? capabilities[entity.index].title : "—"}</small>
                      </li>
                    ))}
                  </ul>
                  <div className={s.bFoot}>
                    {p.link ? (
                      <a href={p.link} className={s.bLink} target="_blank" rel="noreferrer">
                        {p.link.replace(/^https?:\/\//, "")}
                        <span aria-hidden> ↗</span>
                      </a>
                    ) : (
                      p.status && <p className={s.bStatus}>{p.status}</p>
                    )}
                    <span className={s.folio} aria-hidden>
                      {i * 2 + 2}
                    </span>
                  </div>
                </article>
                <div className={s.leaf} data-leaf>
                  <div className={s.cover} aria-hidden>
                    <span className={s.coverNum}>{num}</span>
                    <span className={s.coverName}>{p.name}</span>
                    <span className={s.coverKind}>{p.kind}</span>
                    <span className={s.coverDisc} />
                  </div>
                  <div className={s.pageL}>
                    <Poster p={p} i={i} />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className={s.card} data-card data-anchor="contact" id="contact" aria-labelledby="h-corr">
        <div className={s.cardRig} data-card-rig>
          <div className={s.cardInner}>
            <p className={s.cardHead}>
              <span className={s.cardKick}>5</span>
              <span>{profile.name}</span>
              <span>{profile.year}</span>
            </p>
            <h2 id="h-corr" className={s.cardTitle}>
              {chapters.contact}
            </h2>
            <a href={`mailto:${profile.contact.email}`} className={s.cardEmail}>
              {profile.contact.email}
            </a>
            <p className={s.cardAlt}>
              <span className={s.cardLabel}>GitHub</span>
              <a href={profile.contact.github} target="_blank" rel="noreferrer">
                {gh}
                <span aria-hidden> ↗</span>
              </a>
            </p>
            <p className={s.cardFrom}>
              {profile.role} · {profile.location}
            </p>
            <span className={s.cardHole} aria-hidden />
          </div>
          <div className={s.postage} aria-hidden>
            <span className={s.postJ}>J</span>
            <span className={s.postVal}>{profile.year}</span>
          </div>
          <canvas className={s.postmark} data-postmark aria-hidden />
        </div>
      </section>
    </div>
  );
}
