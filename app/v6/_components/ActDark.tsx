"use client";

import { useEffect, useRef } from "react";
import { projects, chapters } from "@/content/profile";
import { onFrame, isReduced } from "./director";
import { SEG, DARK, W, live, addRipple } from "./timeline";
import { placeWorld, hidePlane, depthOf, type Ride } from "./rig";
import { useRides } from "./useRides";
import { smooth, clamp01, lerp } from "./camera";
import Photogram from "./Photogram";
import styles from "../n2.module.css";

const pad = (n: number) => String(n).padStart(2, "0");
const HANG_Y = DARK.LINEY - 0.03;
const HANG_Z = DARK.WALLZ - 0.3;
const TRAY_Y = 0.02;
const TRAY_Z = 4.38;

type Phys = { tx: number; vx: number; tz: number; vz: number; boost: number; arrived: boolean };

/** Darkroom: each project is a print that develops in the tray, is lifted onto the line and hangs
 *  there next to its notes. Prints swing with the camera's pans and can be dragged. */
export default function ActDark() {
  const title = useRef<HTMLDivElement>(null);
  const wire = useRef<HTMLDivElement>(null);
  const prints = useRef<(HTMLDivElement | null)[]>([]);
  const notes = useRef<(HTMLDivElement | null)[]>([]);

  // title + (mobile) notes ride with the camera
  useRides(() => {
    const out: (Ride | null)[] = [];
    if (title.current)
      out.push({
        el: title.current,
        g0: 1482,
        g1: 1532,
        gin: 1462,
        gout: 1568,
        sx: 0.085,
        sy: 0.22,
        ax: 0,
        ay: 0,
        d: 5,
        m: { sx: 0.06, sy: 0.24 },
        drift: 0.08,
        swing: -20,
      });
    if (window.matchMedia("(max-width: 760px)").matches)
      notes.current.forEach((el, i) => {
        if (!el) return;
        const g = SEG.PRINT0 + i * SEG.PRINT_LEN;
        out.push({ el, g0: g + 0.6 * SEG.PRINT_LEN, g1: g + 0.98 * SEG.PRINT_LEN, gin: g + 0.5 * SEG.PRINT_LEN, gout: g + 1.1 * SEG.PRINT_LEN, sx: 0.06, sy: 0.565, ax: 0, ay: 0, d: 4, rollK: 1 });
      });
    return out;
  });

  useEffect(() => {
    if (isReduced()) return;
    const mobileNotes = window.matchMedia("(max-width: 760px)").matches;
    const P: Phys[] = projects.map(() => ({ tx: 0, vx: 0, tz: 0, vz: 0, boost: 0, arrived: false }));
    const imgs = prints.current.map((p) => p?.querySelector<HTMLElement>("[data-img]") ?? null);
    const lats = prints.current.map((p) => p?.querySelector<HTMLElement>("[data-latent]") ?? null);
    const baths = prints.current.map((p) => p?.querySelector<HTMLElement>("[data-bath]") ?? null);
    const rows = notes.current.map((n) => (n ? Array.from(n.querySelectorAll<HTMLElement>("[data-row]")) : []));
    const lastDev = projects.map(() => -1);
    const lastNo = projects.map(() => -1);
    const shownP = projects.map(() => true);
    const shownN = projects.map(() => true);
    prints.current.forEach((p) => p && hidePlane(p));
    if (!mobileNotes) notes.current.forEach((n) => n && hidePlane(n));
    let wireOn = true;

    // camera lateral acceleration drives the swing
    let lastX = 0,
      lastV = 0,
      acc = 0;

    // drag a print: pointer events on the print plane
    let drag: { i: number; id: number; x: number; y: number; lx: number; ly: number; lt: number; vx: number; vy: number; moved: boolean } | null = null;
    const downs = prints.current.map((el, i) => {
      if (!el) return null;
      const fn = (e: PointerEvent) => {
        if (e.button !== 0) return;
        drag = { i, id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0, moved: false };
        el.setPointerCapture?.(e.pointerId);
        el.dataset.grab = "1";
      };
      const enter = () => {
        live.hoverPrint = i;
      };
      const leave = () => {
        if (live.hoverPrint === i) live.hoverPrint = -1;
      };
      el.addEventListener("pointerdown", fn);
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointerleave", leave);
      return () => {
        el.removeEventListener("pointerdown", fn);
        el.removeEventListener("pointerenter", enter);
        el.removeEventListener("pointerleave", leave);
      };
    });
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const dt = Math.max(1, now - drag.lt) / 1000;
      const mx = e.clientX - drag.lx,
        my = e.clientY - drag.ly;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
      drag.vx = drag.vx * 0.5 + (mx / dt) * 0.5;
      drag.vy = drag.vy * 0.5 + (my / dt) * 0.5;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      drag.lt = now;
      const ph = P[drag.i];
      if (ph.arrived) {
        ph.tz = Math.max(-0.9, Math.min(0.9, ph.tz + mx * 0.006));
        ph.tx = Math.max(-0.7, Math.min(0.7, ph.tx - my * 0.005));
        ph.vz = 0;
        ph.vx = 0;
      } else {
        live.agitate = Math.min(2.2, live.agitate + Math.abs(mx) * 0.004);
        ph.boost = Math.min(1, ph.boost + Math.abs(mx) * 0.0012);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const ph = P[drag.i];
      const el = prints.current[drag.i];
      if (el) delete el.dataset.grab;
      if (!drag.moved) {
        // click: expose under the enlarger
        live.flash = 1;
        ph.boost = 1;
        if (!ph.arrived) addRipple(drag.i * DARK.SP, TRAY_Z - 0.9, 1.2, 2);
      } else if (ph.arrived) {
        ph.vz = drag.vx * 0.0035;
        ph.vx = -drag.vy * 0.003;
      }
      drag = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    const unFrame = onFrame((f) => {
      const g = f.g;
      const live3 = g > SEG.DARK0 && g < SEG.SWAP3;
      if (live3 !== wireOn) {
        wireOn = live3;
        if (!live3 && wire.current) hidePlane(wire.current);
      }
      if (!live3) {
        for (let i = 0; i < prints.current.length; i++) {
          const el = prints.current[i];
          if (el && shownP[i]) {
            hidePlane(el);
            shownP[i] = false;
          }
          const n = notes.current[i];
          if (n && shownN[i] && !mobileNotes) {
            hidePlane(n);
            shownN[i] = false;
          }
        }
        return;
      }
      const cam = W.rig;
      const dt = Math.max(1e-3, f.dt);
      const v = (cam.x - lastX) / dt;
      acc += ((v - lastV) / dt - acc) * 0.25;
      lastX = cam.x;
      lastV = v;

      if (wire.current) {
        placeWorld(wire.current, -3, DARK.LINEY, HANG_Z + 0.02, 0, 0, 0, 1, 0, 0.5);
        wire.current.style.opacity = smooth(1478, 1500, g).toFixed(3);
        wire.current.removeAttribute("data-off");
      }

      for (let i = 0; i < projects.length; i++) {
        const el = prints.current[i];
        if (!el) continue;
        const ph = P[i];
        const g0 = SEG.PRINT0 + i * SEG.PRINT_LEN;
        const q = (g - g0) / SEG.PRINT_LEN;
        const X = i * DARK.SP;

        if (q < -0.3) {
          if (shownP[i]) {
            hidePlane(el);
            shownP[i] = false;
          }
          ph.boost = 0;
          ph.arrived = false;
        } else {
          // development
          if (q < 0.45) {
            if (live.hoverPrint === i) ph.boost = Math.min(1, ph.boost + dt * 0.5);
            if (q > -0.1) ph.boost = Math.min(1, ph.boost + live.agitate * dt * 0.12);
          }
          const dev = Math.max(smooth(-0.08, 0.4, q), ph.boost);
          if (Math.abs(dev - lastDev[i]) > 0.003) {
            lastDev[i] = dev;
            const img = imgs[i],
              lat = lats[i];
            if (img) img.style.opacity = Math.pow(smooth(0.18, 1, dev), 1.3).toFixed(3);
            if (lat) lat.style.opacity = (smooth(0.0, 0.45, dev) * (1 - smooth(0.55, 1, dev)) * 0.75).toFixed(3);
          }

          const u = smooth(0.42, 0.62, q);
          let x = X,
            y: number,
            z: number,
            rx: number,
            rz = 0;
          if (u <= 0) {
            ph.arrived = false;
            const bob = Math.sin(f.time * 1.3 + i) * 0.02;
            y = TRAY_Y;
            z = TRAY_Z;
            rx = Math.PI / 2 + bob;
            rz = Math.sin(f.time * 0.9 + i * 2) * 0.012;
          } else {
            const e = u * u * (3 - 2 * u);
            y = lerp(TRAY_Y, HANG_Y, e) + Math.sin(Math.PI * u) * 0.35;
            z = lerp(TRAY_Z, HANG_Z, u) - Math.sin(Math.PI * u) * 1.0;
            rx = (Math.PI / 2) * (1 - e) - Math.sin(Math.PI * u) * 0.25;
            if (u >= 1 && !ph.arrived) {
              ph.arrived = true;
              ph.vx = -2.2;
              ph.vz = 0.6;
            } else if (u < 1) ph.arrived = false;
            if (ph.arrived) {
              // pendulum on the line
              const kx = 26,
                kz = 18;
              const grabbed = drag?.i === i && drag.moved;
              if (!grabbed) {
                ph.vx += (-kx * ph.tx - 1.3 * ph.vx) * dt;
                // idle draught keeps hanging prints faintly alive
                const air = Math.sin(f.time * 0.7 + i * 1.7) * 0.25 + Math.sin(f.time * 1.9 + i) * 0.1;
                ph.vz += (-kz * ph.tz - 1.4 * ph.vz - Math.max(-60, Math.min(60, acc)) * 0.012 + air) * dt;
                ph.tx += ph.vx * dt;
                ph.tz += ph.vz * dt;
                ph.tz = Math.max(-0.32, Math.min(0.32, ph.tz));
                ph.tx = Math.max(-0.5, Math.min(0.5, ph.tx));
              }
              rx += ph.tx;
              rz += ph.tz;
            }
          }
          const op = smooth(-0.3, -0.12, q) * smooth(0.4, 1.2, depthOf(cam, x, y - 0.8, z));
          placeWorld(el, x, y, z, 0, rx, rz, mobileNotes ? 0.78 : 1, 0.5, 0);
          el.style.opacity = op.toFixed(3);
          const vis = op > 0.05;
          if (vis !== shownP[i]) {
            shownP[i] = vis;
            el.toggleAttribute("data-off", !vis);
          }
          const bath = baths[i];
          if (bath) bath.style.opacity = (1 - smooth(0.4, 0.5, q)).toFixed(3);
        }

        // notes on the wall (desktop) or riding low (mobile)
        const n = notes.current[i];
        if (!n) continue;
        if (mobileNotes) {
          const r = rows[i];
          const rp = clamp01((q - 0.52) / 0.3);
          for (let k = 0; k < r.length; k++) r[k].style.setProperty("--rp", clamp01((rp - (k / r.length) * 0.6) / 0.3).toFixed(3));
          continue;
        }
        const no = smooth(0.5, 0.64, q) * (1 - smooth(0.98, 1.1, q));
        if (no <= 0.002) {
          if (shownN[i]) {
            hidePlane(n);
            shownN[i] = false;
            lastNo[i] = -1;
          }
          continue;
        }
        placeWorld(n, X + 0.98, DARK.LINEY - 0.1, DARK.WALLZ - 0.04, 0, 0, 0, 1, 0, 0);
        if (Math.abs(no - lastNo[i]) > 0.004) {
          lastNo[i] = no;
          n.style.opacity = no.toFixed(3);
          const r = rows[i];
          const rp = clamp01((q - 0.52) / 0.3);
          for (let k = 0; k < r.length; k++) r[k].style.setProperty("--rp", clamp01((rp - (k / r.length) * 0.6) / 0.3).toFixed(3));
        }
        if (!shownN[i]) {
          shownN[i] = true;
          n.removeAttribute("data-off");
        }
      }
    }, 65);

    return () => {
      unFrame();
      downs.forEach((d) => d?.());
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <section id="works" className={styles.act} data-world="dark" aria-labelledby="works-title">
      <div ref={title} className={`${styles.plane} ${styles.pDarkTitle}`}>
        <p className={styles.label}>
          <span>
            04 <span className={styles.labelDim}>/ 05</span>
          </span>
        </p>
        <h2 id="works-title" className={styles.darkTitle}>
          {chapters.work}
        </h2>
        <ol className={styles.darkIndex}>
          {projects.map((p, i) => (
            <li key={p.id}>
              <span>{pad(i + 1)}</span> {p.name}
            </li>
          ))}
        </ol>
      </div>

      <div ref={wire} className={`${styles.plane} ${styles.wire}`} aria-hidden="true" />

      {projects.map((p, i) => (
        <article key={p.id} className={styles.work} aria-labelledby={`work-${p.id}`}>
          <div ref={(n) => void (prints.current[i] = n)} className={`${styles.plane} ${styles.print}`} data-print={i} aria-hidden="true">
            <span className={styles.clip} />
            <div className={styles.paper}>
              <div className={styles.latent} data-latent>
                <Photogram i={i} soft />
              </div>
              <div className={styles.image} data-img>
                <Photogram i={i} />
              </div>
              <div className={styles.bath} data-bath />
            </div>
            <span className={styles.edge}>
              {pad(i + 1)} · {p.name}
            </span>
          </div>

          <div ref={(n) => void (notes.current[i] = n)} className={`${styles.plane} ${styles.notes}`}>
            <p data-row className={styles.noteKind}>
              <span>
                {pad(i + 1)} / {pad(projects.length)}
              </span>
              <span>{p.kind}</span>
              <span>{p.year}</span>
            </p>
            <h3 data-row id={`work-${p.id}`} className={styles.noteName}>
              {p.name}
            </h3>
            <p data-row className={styles.noteDesc}>
              {p.desc}
            </p>
            <ul data-row className={styles.noteStack} aria-label="Stack">
              {p.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {p.link ? (
              <a data-row className={styles.noteLink} href={p.link} target="_blank" rel="noreferrer">
                see it live <span aria-hidden="true">↗</span>
                <span className={styles.noteUrl}>{p.link.replace(/^https?:\/\//, "")}</span>
              </a>
            ) : p.status ? (
              <p data-row className={styles.noteStatus}>
                {p.status}
              </p>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}
