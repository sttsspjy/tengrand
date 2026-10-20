"use client";

import { useEffect, useMemo, useRef } from "react";
import { chapters, type Phrase } from "@/content/profile";
import { registerPart, requestLayout, sub, easeInOut, easeOut, lerp, type Frame } from "../../_lib/stage";
import { T, LEN, localU } from "./timeline";
import s from "../../craft.module.css";

// I · louder: a letterpress bed. Giant wood-type blocks drop one per word, slam onto the sheet (shake,
// splat, impact frame on the big words) and lift away leaving the print; the camera starts at type level
// and rises to read the finished broadside, then pulls up and rolls away into the manuscript.

type Word = { text: string; ink: "k" | "o"; row: number; big?: 1 | 2 };
type Box = { x: number; y: number; w: number; h: number };

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Ink droplets around a word box: position in % of the box, size in em of the word's height. */
function splat(k: number) {
  const r = rng(31 + k * 7);
  const out: { x: number; y: number; w: number; h: number; a: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const side = r();
    const t = r();
    const [x, y] = side < 0.3 ? [t, -0.03 - r() * 0.2] : side < 0.6 ? [t, 1.03 + r() * 0.18] : side < 0.8 ? [-0.01 - r() * 0.05, t] : [1.01 + r() * 0.05, t];
    const big = r() < 0.22;
    const w = big ? 0.035 + r() * 0.04 : 0.012 + r() * 0.022;
    out.push({ x: x * 100, y: y * 100, w, h: big ? w * (2.2 + r() * 2.4) : w * (1 + r() * 0.5), a: (Math.atan2(y - 0.5, (x - 0.5) * 3) * 180) / Math.PI + 90 });
  }
  return out;
}

export default function WoodType({ p }: { p: Phrase }) {
  const sceneRef = useRef<HTMLElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);

  const words = useMemo<Word[]>(() => {
    const w: Word[] = [];
    p.before.split(/\s+/).filter(Boolean).forEach((t) => w.push({ text: t, ink: "k", row: 0 }));
    w.push({ text: p.accent, ink: "o", row: 1, big: 1 });
    p.after
      .split(/\s+/)
      .filter(Boolean)
      .forEach((t, i) => w.push({ text: t, ink: "k", row: i === 0 ? 2 : 3, big: i === 0 ? 2 : undefined }));
    return w;
  }, [p]);
  const splats = useMemo(() => words.map((_, k) => splat(k)), [words]);

  useEffect(() => {
    const scene = sceneRef.current!;
    const rig = rigRef.current!;
    const paper = paperRef.current!;
    const ground = groundRef.current!;
    // worn-ink mask: paper showing through the solid ink in specks
    const g = document.createElement("canvas");
    g.width = g.height = 200;
    const gx = g.getContext("2d")!;
    gx.fillStyle = "#000";
    gx.fillRect(0, 0, 200, 200);
    gx.globalCompositeOperation = "destination-out";
    const rr = rng(5);
    for (let i = 0; i < 380; i++) {
      gx.globalAlpha = 0.2 + rr() * 0.6;
      gx.beginPath();
      gx.arc(rr() * 200, rr() * 200, 0.3 + rr() * rr() * 1.3, 0, Math.PI * 2);
      gx.fill();
    }
    paper.style.setProperty("--grain", `url(${g.toDataURL()})`);
    // paper fibre tile (canvas instead of SVG turbulence, which is slow to rasterise on first paint)
    const fb = document.createElement("canvas");
    fb.width = fb.height = 220;
    const fx = fb.getContext("2d")!;
    for (let i = 0; i < 2600; i++) {
      fx.fillStyle = `rgba(40, 30, 20, ${(0.02 + rr() * 0.06).toFixed(3)})`;
      fx.fillRect(rr() * 220, rr() * 220, 1 + rr() * 2, 1);
    }
    paper.style.setProperty("--fibre", `url(${fb.toDataURL()})`);
    const blur = blurRef.current;
    const prints = Array.from(paper.querySelectorAll<HTMLElement>("[data-w]"));
    const blocks = Array.from(paper.querySelectorAll<HTMLElement>("[data-blk]"));
    const splatEls = Array.from(paper.querySelectorAll<HTMLElement>("[data-splat]"));
    const subEl = paper.querySelector<HTMLElement>("[data-sub]");
    const guides = Array.from(paper.querySelectorAll<HTMLElement>("[data-guide]"));
    const n = prints.length;
    let on = false;
    let vw0 = 0;
    let vh0 = 0;
    let W = 0;
    let H = 0;
    let boxes: Box[] = [];
    let lastU = -99;
    let shakeT = -1e9;
    let shakeA = 0;
    const state = prints.map(() => false);
    let subOn = false;
    let lastKey = "";
    let filt = "";
    // impact moments, in vh from the start of Craft
    const span = T.iSlam[1] - T.iSlam[0];
    const imp = prints.map((_, k) => T.iSlam[0] + 0.16 + (k / Math.max(1, n - 1)) * (span - 0.3));
    const FALL = 0.15;
    const FLY = 0.24;
    // where each block stands on the bed before it is pulled (offset from its print position) + its resting yaw
    let rest: { dx: number; dy: number; rz: number }[] = [];
    let cluster = { x: 0, y: 0, bottom: 0 };

    const measure = (vw: number, vh: number, mobile: boolean) => {
      vw0 = vw;
      vh0 = vh;
      W = Math.round(mobile ? vw * 0.9 : Math.min(vw * 0.84, (vh - 90) * 1.62));
      H = Math.round(mobile ? Math.min(vh * 0.74, W * 1.62) : Math.min(vh * 0.8, W / 1.5));
      paper.style.width = `${W}px`;
      paper.style.height = `${H}px`;
      paper.style.setProperty("--pw", `${W}px`);
      ground.style.left = `${-W * 1.1}px`;
      ground.style.top = `${-H * 3.5}px`;
      ground.style.width = `${W * 3.2}px`;
      ground.style.height = `${H * 6}px`;
      boxes = prints.map((el) => {
        let x = 0;
        let y = 0;
        let e: HTMLElement | null = el;
        while (e && e !== paper) {
          x += e.offsetLeft;
          y += e.offsetTop;
          e = e.offsetParent as HTMLElement | null;
        }
        return { x, y, w: el.offsetWidth, h: el.offsetHeight };
      });
      blocks.forEach((b, k) => {
        const bx = boxes[k];
        const padX = bx.h * 0.08;
        const padY = bx.h * 0.02;
        b.style.left = `${(bx.x - padX).toFixed(1)}px`;
        b.style.top = `${(bx.y - padY).toFixed(1)}px`;
        b.style.width = `${(bx.w + padX * 2).toFixed(1)}px`;
        b.style.height = `${(bx.h + padY * 2).toFixed(1)}px`;
        b.style.setProperty("--d", `${Math.round(bx.h * 0.62)}px`);
        b.style.setProperty("--h", `${Math.round(bx.h)}px`);
        for (const el of [splatEls[k], guides[k]]) {
          if (!el) continue;
          el.style.left = `${bx.x}px`;
          el.style.top = `${bx.y}px`;
          el.style.width = `${bx.w}px`;
          el.style.height = `${bx.h}px`;
          el.style.fontSize = `${bx.h}px`;
        }
      });
      // the forme: blocks stand packed in rows on the bed just in front of the sheet, widest row nearest it
      const sz = boxes.map((bx) => ({ w: bx.w + bx.h * 0.16, h: bx.h * 1.04 }));
      const order = boxes.map((_, k) => k).sort((a, b) => sz[b].w - sz[a].w);
      const gap = Math.max(10, W * 0.018);
      const rows: number[][] = [];
      for (const k of order) {
        const row = rows.find((r) => r.reduce((a, j) => a + sz[j].w + gap, 0) + sz[k].w <= W * 1.06);
        if (row) row.push(k);
        else rows.push([k]);
      }
      const rr = rng(17);
      rest = boxes.map(() => ({ dx: 0, dy: 0, rz: 0 }));
      let y = H + (mobile ? 50 : 76);
      let sx = 0;
      let sy = 0;
      for (const row of rows) {
        const rw = row.reduce((a, j) => a + sz[j].w, 0) + gap * (row.length - 1);
        let x = W / 2 - rw / 2;
        const rh = Math.max(...row.map((j) => sz[j].h));
        for (const j of row) {
          const bx = boxes[j];
          const left = bx.x - bx.h * 0.08;
          const top = bx.y - bx.h * 0.02;
          const ty = y + (rh - sz[j].h) / 2 + (rr() - 0.5) * gap * 0.6;
          rest[j] = { dx: x + (rr() - 0.5) * gap * 0.5 - left, dy: ty - top, rz: (rr() - 0.5) * 5 };
          sx += x + sz[j].w / 2;
          sy += ty + sz[j].h / 2;
          x += sz[j].w + gap;
        }
        y += rh + gap * 1.4;
      }
      cluster = { x: sx / n, y: sy / n, bottom: y };
      lastKey = "";
    };

    const trigger = (k: number, now: number, reduced: boolean) => {
      if (reduced) return;
      const big = prints[k].dataset.big;
      shakeT = now;
      shakeA = big === "2" ? 26 : big === "1" ? 18 : 9;
      if (big) {
        scene.animate([{ filter: "invert(1) contrast(1.5)" }, { filter: "invert(1) contrast(1.5)", offset: 0.55 }, { filter: "none" }], { duration: big === "2" ? 120 : 80 });
      }
    };

    const un = registerPart("craft-i", {
      update: (f: Frame) => {
        const u = localU(f);
        const vis = u > T.whip[0] - 0.02 && u < LEN + 0.5;
        if (vis !== on) {
          on = vis;
          scene.toggleAttribute("data-on", vis);
        }
        if (!vis) {
          lastU = u;
          return;
        }
        if (vw0 !== f.vw || vh0 !== f.vh || f.fresh) measure(f.vw, f.vh, f.mobile);
        const { vw, vh, now } = f;

        // prints + impacts
        for (let k = 0; k < n; k++) {
          const hit = u >= imp[k];
          if (hit !== state[k]) {
            state[k] = hit;
            prints[k].toggleAttribute("data-on", hit);
            splatEls[k]?.toggleAttribute("data-on", hit);
            if (hit && lastU < imp[k] && u - lastU < 0.6) trigger(k, now, f.reduced);
          }
        }
        const so = u >= imp[n - 1] + 0.12;
        if (so !== subOn) {
          subOn = so;
          subEl?.toggleAttribute("data-on", so);
        }
        lastU = u;

        // blocks: stand on the bed, get pulled up in an arc and slam down (accelerating) onto their spot,
        // squash, then lift and slide away
        const Za = Math.max(vh * 0.36, 280);
        blocks.forEach((b, k) => {
          const tl = imp[k] - FLY;
          const r = rest[k] ?? { dx: 0, dy: 0, rz: 0 };
          let z = 0;
          let x = r.dx;
          let y = r.dy;
          let rz = r.rz;
          let sq = 1;
          const show = !f.reduced && u < imp[k] + 0.3;
          if (u >= tl && u < imp[k]) {
            const t = sub(u, tl, imp[k]);
            const e = easeInOut(t);
            x = r.dx * (1 - e);
            y = r.dy * (1 - e);
            z = Za * (1 - (2 * t - 1) * (2 * t - 1));
            rz = r.rz * (1 - e) + Math.sin(Math.PI * t) * (k % 2 ? 7 : -7);
          } else if (u >= imp[k]) {
            const t = sub(u, imp[k] + 0.03, imp[k] + 0.28);
            const e = t * t;
            z = Za * 0.9 * e;
            x = (boxes[k] && boxes[k].x + boxes[k].w / 2 > W / 2 ? 1 : -1) * W * 0.9 * e;
            y = 0;
            rz = (k % 2 ? -10 : 10) * e;
            sq = 1 - 0.12 * Math.max(0, 1 - (u - imp[k]) / 0.03);
          }
          b.style.visibility = show ? "visible" : "hidden";
          if (show) b.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateZ(${rz.toFixed(2)}deg) scale3d(1, 1, ${sq.toFixed(3)})`;
        });

        // camera: land from the whip → crane down to type level at the first word → follow the strikes
        // while rising to read the broadside overhead
        const land = easeOut(sub(u, T.whip[0], T.whip[1]));
        const down = easeInOut(sub(u, T.iDown[0], T.iDown[1]));
        const rise = easeInOut(sub(u, T.iRise[0], T.iRise[1]));
        const out = sub(u, T.out[0], T.out[1]);
        const fit = Math.min((vw * 0.96) / W, (vh - (f.mobile ? 96 : 110)) / H);
        // focus: the forme's front edge at first, then each word as its block is pulled
        let F = { x: W / 2, y: H + (cluster.bottom - H) * 0.35 };
        if (boxes.length === n) {
          const c = (k: number) => ({ x: boxes[k].x + boxes[k].w / 2, y: boxes[k].y + boxes[k].h / 2 });
          const at = imp.map((t) => t - FALL * 0.6);
          let k = 0;
          while (k < n - 1 && u > at[k + 1]) k++;
          const e = k < n - 1 ? easeInOut(sub(u, at[k], at[k + 1])) : 0;
          const a = c(k);
          const b = c(Math.min(n - 1, k + 1));
          const w = easeInOut(sub(u, at[0] - 0.24, at[0]));
          // aim between the struck word and the forme so the waiting blocks stay in the foreground
          const wx = lerp(lerp(a.x, b.x, e), W / 2, 0.3);
          const wy = lerp(lerp(a.y, b.y, e) + H * 0.12, cluster.y, 0.5);
          F = { x: lerp(F.x, wx, w), y: lerp(F.y, wy, w) };
        }
        const lw = sub(u, T.iSlam[0] - 0.1, T.iSlam[0] + 0.15);
        const low = { tilt: lerp(f.mobile ? 62 : 66, f.mobile ? 56 : 60, lw), s: lerp(f.mobile ? 1.5 : 2.1, f.mobile ? 1.15 : 1.5, lw), cx: F.x, cy: F.y, rot: 8 };
        const over = { tilt: 0, s: fit, cx: W / 2, cy: H / 2 + (f.mobile ? 6 : 8), rot: -1.2 };
        const landP = { tilt: 30, s: fit * (f.mobile ? 0.62 : 0.72), cx: W / 2, cy: (H * 0.35 + cluster.bottom) / 2, rot: -14 - 40 * (1 - land) };
        let tilt = lerp(lerp(landP.tilt, low.tilt, down), over.tilt, rise);
        let sc = lerp(lerp(landP.s, low.s, down), over.s, rise);
        let cx = lerp(lerp(landP.cx, low.cx, down), over.cx, rise);
        let cy = lerp(lerp(landP.cy, low.cy, down), over.cy, rise);
        let rot = lerp(lerp(landP.rot, low.rot, down), over.rot, rise);
        // exit: pull up and roll into the manuscript
        if (out > 0) {
          const e = out * out;
          sc *= lerp(1, 0.2, Math.min(1, easeInOut(Math.min(1, out * 1.1))));
          rot -= 150 * e;
          tilt += 22 * Math.sin(Math.PI * Math.min(1, out));
        }
        if (f.reduced) {
          tilt = lerp(30, 0, sub(u, T.iDown[0], T.iSlam[0]));
          sc = over.s;
          cx = over.cx;
          cy = over.cy;
          rot = 0;
        }
        // whip-pan in from the right, in step with H leaving
        const wv = sub(u, T.whip[0], T.whip[1]);
        const wx = f.reduced ? 0 : (1 - easeInOut(wv)) * vw * 1.15;
        // shake
        let sx = 0;
        let sy = 0;
        const st = now - shakeT;
        if (st < 420) {
          const k = shakeA * Math.exp(-st / 95);
          sx = Math.sin(st * 0.11) * k;
          sy = Math.cos(st * 0.083) * k * 0.8;
        }
        const key = `${tilt.toFixed(2)}|${sc.toFixed(4)}|${cx.toFixed(1)}|${cy.toFixed(1)}|${rot.toFixed(2)}|${(wx + sx).toFixed(1)}|${sy.toFixed(1)}|${vw}|${vh}`;
        if (key !== lastKey || f.fresh) {
          lastKey = key;
          rig.style.transform = `translate3d(${(vw / 2 + wx + sx).toFixed(1)}px, ${(vh / 2 + sy).toFixed(1)}px, 0) rotateX(${tilt.toFixed(3)}deg) rotateZ(${rot.toFixed(3)}deg) scale(${sc.toFixed(5)}) translate3d(${(-cx).toFixed(2)}px, ${(-cy).toFixed(2)}px, 0)`;
        }
        const bl = f.reduced ? 0 : Math.round(Math.sin(Math.PI * wv) * 44);
        const fs = bl > 0 ? "url(#cr-whip-i)" : "";
        if (blur && bl > 0) blur.setAttribute("stdDeviation", `${bl} 0`);
        if (fs !== filt) {
          filt = fs;
          scene.style.filter = fs;
        }
      },
    });
    const ro = new ResizeObserver(() => {
      vw0 = 0;
      requestLayout();
    });
    ro.observe(paper);
    document.fonts.ready.then(() => (vw0 = 0));
    return () => {
      un();
      ro.disconnect();
    };
  }, [words]);

  const rows = [0, 1, 2, 3].map((r) => words.map((w, k) => ({ ...w, k })).filter((w) => w.row === r));

  return (
    <section className={`${s.scene} ${s.iScene}`} ref={sceneRef} id="craft-louder" data-anchor="craft-louder" aria-labelledby="h-craft-louder">
      <p className={s.mast} aria-hidden>
        <b>2</b> {chapters.craft}
        <span className={s.mastNo}>iii / iii</span>
      </p>
      <h3 id="h-craft-louder" className={s.sr}>
        {p.before} {p.accent} {p.after}
      </h3>
      {p.sub && <p className={s.sr}>{p.sub}</p>}
      <svg className={s.defs} aria-hidden>
        <filter id="cr-whip-i" x="-20%" y="0" width="140%" height="100%">
          <feGaussianBlur ref={blurRef} stdDeviation="0 0" />
        </filter>
      </svg>
      <div className={s.rig} ref={rigRef} aria-hidden>
        <div className={s.iGround} ref={groundRef} />
        <div className={s.iPaper} ref={paperRef}>
          <span className={s.iFurnT} />
          <span className={s.iFurnB} />
          <span className={s.iFurnL} />
          <span className={s.iFurnR} />
          <div className={s.iLay}>
            <span className={`${s.iCrop} ${s.iCropTL}`} />
            <span className={`${s.iCrop} ${s.iCropTR}`} />
            <span className={`${s.iCrop} ${s.iCropBL}`} />
            <span className={`${s.iCrop} ${s.iCropBR}`} />
          </div>
          <div className={s.iPrint}>
            {rows.map((row, r) => (
              <p key={r} className={s[`iRow${r}`]}>
                {row.map((w) => (
                  <span key={w.k} className={`${s.iWord} ${w.ink === "o" ? s.iOrange : ""}`} data-w={w.k} data-big={w.big}>
                    {w.text}
                  </span>
                ))}
              </p>
            ))}
            {p.sub && (
              <p className={s.iSub} data-sub>
                {p.sub}
              </p>
            )}
          </div>
          {words.map((w, k) => (
            <span key={k} className={s.iGuide} data-guide />
          ))}
          {words.map((w, k) => (
            <div key={k} className={`${s.iSplat} ${w.ink === "o" ? s.iOrange : ""}`} data-splat>
              {splats[k].map((d, i) => (
                <i
                  key={i}
                  style={{ left: `${d.x.toFixed(1)}%`, top: `${d.y.toFixed(1)}%`, width: `${d.w.toFixed(3)}em`, height: `${d.h.toFixed(3)}em`, rotate: `${d.a.toFixed(0)}deg` }}
                />
              ))}
            </div>
          ))}
          {words.map((w, k) => (
            <div key={k} className={`${s.blk} ${w.ink === "o" ? s.blkO : ""}`} data-blk>
              <span className={s.blkTop}>
                <em>{w.text}</em>
              </span>
              <span className={`${s.blkSide} ${s.blkN}`} />
              <span className={`${s.blkSide} ${s.blkS}`} />
              <span className={`${s.blkSide} ${s.blkW}`} />
              <span className={`${s.blkSide} ${s.blkE}`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
