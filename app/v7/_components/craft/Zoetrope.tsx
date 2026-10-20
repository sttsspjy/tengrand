"use client";

import { useEffect, useMemo, useRef } from "react";
import { chapters, type Phrase } from "@/content/profile";
import {
  registerPart,
  sub,
  easeInOut,
  lerp,
  type Frame,
} from "../../_lib/stage";
import { T, localU } from "./timeline";
import s from "../../craft.module.css";

// H · motion: a slotted zoetrope drum in a dark room. The camera rises out of the ink at eye level,
// peers through the slits at the breathing figure, then cranes up and over to look straight down into
// the drum, where the phrase is printed on its floor and runs round the inner strip. Spin follows scroll speed.

const P = 900;
const DEG = Math.PI / 180;

export default function Zoetrope({ p }: { p: Phrase }) {
  const sceneRef = useRef<HTMLElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const drumRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ring = useMemo(
    () => [...`${p.before} ${p.accent} · `.toUpperCase()],
    [p.before, p.accent],
  );
  const N = ring.length;

  useEffect(() => {
    const scene = sceneRef.current!;
    const rig = rigRef.current!;
    const drum = drumRef.current!;
    const ghost = ghostRef.current!;
    let on = false;
    let R = 0;
    let Hw = 0;
    let vw0 = 0;
    let vh0 = 0;
    let spin = 0;
    let omega = 30;
    let lastY = 0;
    let lastKey = "";
    let filt = "";

    const layout = (vw: number, vh: number, mobile: boolean) => {
      vw0 = vw;
      vh0 = vh;
      R = Math.round(
        mobile ? Math.min(vw * 0.44, vh * 0.26) : Math.min(vw * 0.3, vh * 0.56),
      );
      Hw = Math.round(R * 0.56);
      const pw = 2 * R * Math.sin(Math.PI / N);
      scene.style.setProperty("--R", `${R}px`);
      scene.style.setProperty("--Hw", `${Hw}px`);
      scene.style.setProperty("--pw", `${pw.toFixed(2)}px`);
      lastKey = "";
    };

    const un = registerPart("craft-h", {
      update: (f: Frame) => {
        const u = localU(f);
        const vis = u > T.hOut[0] - 0.05 && u < T.whip[1] + 0.02;
        if (vis !== on) {
          on = vis;
          scene.toggleAttribute("data-on", vis);
          lastY = f.y;
        }
        if (!vis) return;
        if (vw0 !== f.vw || vh0 !== f.vh) layout(f.vw, f.vh, f.mobile);
        const { vw, vh } = f;

        // spin: a base turn plus scroll speed
        const v = f.dt > 0 ? Math.abs(f.y - lastY) / f.dt : 0;
        lastY = f.y;
        const target = f.reduced ? 0 : 34 + Math.min(560, v * 0.32);
        omega +=
          (target - omega) * Math.min(1, f.dt * (target > omega ? 6 : 1.6));
        spin = (spin + omega * f.dt) % 360;

        // breath: 4.2 s cycle
        const b = f.reduced
          ? 0.6
          : 0.5 - 0.5 * Math.cos(((f.now / 1000) * Math.PI * 2) / 4.2);

        // camera: out of the ink (close at a slit) → eye level → crane up and over to top-down
        const ySlit = -Hw / 2 + Hw * 0.26;
        const out = easeInOut(sub(u, T.hOut[0], T.hOut[1]));
        const cr = easeInOut(sub(u, T.hCrane[0], T.hCrane[1]));
        const near = R + Math.max(90, R * 0.55);
        // top-down distance that fits the drum's rim (the nearest ring) in the viewport
        const top = (2 * R * P) / Math.min(vw * 0.94, vh - 110) + Hw * 0.5;
        let D = lerp(lerp(R + 34, near, out), top, cr);
        let pitch = lerp(lerp(1, 2, out), 90, cr);
        let ty = lerp(ySlit, 0, cr);
        // the crane swings wide: lifts and pulls back mid-move
        D += Math.sin(Math.PI * cr) * R * 0.9;
        ty -= Math.sin(Math.PI * cr) * Hw * 0.6;
        if (f.reduced) {
          D = lerp(near, top, cr);
          pitch = lerp(5, 90, cr);
          ty = lerp(ySlit, 0, cr);
        }
        // whip-pan: H leaves left while I arrives from the right at the same speed
        const w = sub(u, T.whip[0], T.whip[1]);
        const wx = f.reduced ? 0 : -easeInOut(w) * vw * 1.15;
        const key = `${D.toFixed(1)}|${pitch.toFixed(2)}|${ty.toFixed(1)}|${wx.toFixed(1)}|${vw}|${vh}`;
        if (key !== lastKey || f.fresh) {
          lastKey = key;
          rig.style.transform = `translate3d(${(vw / 2 + wx).toFixed(1)}px, ${vh / 2}px, 0) translateZ(${(P - D).toFixed(1)}px) rotateX(${(-pitch).toFixed(3)}deg) translate3d(0, ${(-ty).toFixed(1)}px, 0)`;
        }
        const bl = f.reduced ? 0 : Math.round(Math.sin(Math.PI * w) * 44);
        const fs = bl > 0 ? `blur(${(bl * 0.45).toFixed(0)}px)` : "";
        if (fs !== filt) {
          filt = fs;
          scene.style.filter = fs;
        }
        drum.style.transform = `rotateY(${spin.toFixed(2)}deg)`;
        // the figure inside faces the camera; as the camera tops out it settles onto the floor
        const lay = pitch * DEG;
        const gy = lerp(ySlit + Hw * 0.02, Hw / 2 - 2, cr);
        ghost.style.transform = `translate3d(0, ${gy.toFixed(1)}px, 0) rotateX(${pitch.toFixed(2)}deg) scale(${lerp(0.52, 1, cr).toFixed(4)})`;
        scene.style.setProperty("--b", b.toFixed(3));
        scene.style.setProperty(
          "--fig",
          Math.max(0, Math.cos(lay) * 1.15 - 0.15).toFixed(3),
        );
        scene.style.setProperty("--halo", sub(cr, 0.25, 0.75).toFixed(3));
      },
    });
    return un;
  }, [N]);

  // static strip art: each panel holds one frame of the breath (sequential) and one letter of the phrase
  const frames = ring.map((ch, i) => {
    const ph = 0.5 - 0.5 * Math.cos((i / N) * Math.PI * 2 * 2);
    return { ch, ph, a: (i * 360) / N };
  });

  return (
    <section
      className={`${s.scene} ${s.hScene}`}
      ref={sceneRef}
      id="craft-motion"
      data-anchor="craft-motion"
      aria-labelledby="h-craft-motion"
    >
      <p className={s.mast} aria-hidden>
        <b>2</b> {chapters.craft}
        <span className={s.mastNo}>ii / iii</span>
      </p>
      <h3 id="h-craft-motion" className={s.sr}>
        {p.before} {p.accent}
        {p.after ? ` ${p.after}` : ""}
      </h3>
      {p.sub && <p className={s.sr}>{p.sub}</p>}
      <div className={s.hLamp} aria-hidden />
      <div className={s.hView}>
        <div className={s.rig3} ref={rigRef} aria-hidden>
          <div className={s.hTable} />
          <div className={s.hFloor}>
            <div className={s.hFloorText}>
              <p className={s.hLine1}>{p.before}</p>
              <p className={s.hLine2}>{p.accent}</p>
              {p.after && <p className={s.hLine1}>{p.after}</p>}
              {p.sub && <p className={s.hSub}>{p.sub}</p>}
            </div>
          </div>
          <div className={s.hGhost} ref={ghostRef}>
            <span className={s.hHalo} />
            <span className={s.hRing} />
            <svg className={s.hFig} viewBox="0 0 100 100">
              <circle cx="50" cy="30" r="8" />
              <path
                className={s.hTorso}
                d="M50 40 C 40 42 38 60 41 74 L 59 74 C 62 60 60 42 50 40 Z"
              />
              <path className={s.hArmL} d="M44 46 L 30 62" />
              <path className={s.hArmR} d="M56 46 L 70 62" />
            </svg>
          </div>
          <div className={s.drum} ref={drumRef}>
            {frames.map((fr, i) => (
              <div
                key={i}
                className={s.hPanel}
                style={
                  { ["--a" as string]: `${fr.a}deg` } as React.CSSProperties
                }
              >
                <span className={s.hSlat} />
                <span className={s.hOuter} />
                <span className={s.hInner}>
                  <i
                    className={s.hFrame}
                    style={
                      {
                        ["--ph" as string]: fr.ph.toFixed(3),
                      } as React.CSSProperties
                    }
                  />
                  <b className={s.hLetter}>{fr.ch}</b>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
