// Visitor input on the world layer. Drag looks around (spring return) everywhere; per act:
// city — click lights the windows around the hit; alive — the pointer (or an idle wave on touch)
// switches windows on as it passes; lanterns — press and hold to breathe in; storm — click strikes
// lightning; clouds — click a cloud to cut to its shot; stars — hover / click a constellation.

import { director, scrollToG, onFrame } from "./director";
import { W, live, addTrail, strike, SEG, SKILL_SUBJ, SKY_C, word, frameAt } from "./timeline";
import { rayAt, project } from "./camera";
import { traceCity } from "./city";
import { CONST, dirOf } from "./constellations";

const ray = [0, 0, 0];
const org = [0, 0, 0];
const scr = { x: 0, y: 0, d: 0 };
const dir = [0, 0, 0];

/** City hit under a screen point (city frame), or null. */
function cityHit(sx: number, sy: number) {
  const c = W.cam;
  rayAt(c, sx, sy, director.vw, director.vh, ray);
  org[0] = c.x;
  org[1] = c.y;
  org[2] = c.z;
  return traceCity(org, ray, word());
}

/** Skill shot whose subject is nearest a screen point (within reach), or -1. */
function pickCloud(sx: number, sy: number) {
  let best = 140,
    id = -1;
  for (let i = 0; i < SKILL_SUBJ.length; i++) {
    const c = SKILL_SUBJ[i];
    project(W.cam, c[0], c[1], c[2], director.vw, director.vh, scr);
    if (scr.d <= 0) continue;
    const d = Math.hypot(scr.x - sx, scr.y - sy);
    if (d < best) {
      best = d;
      id = i;
    }
  }
  return id;
}

/** Constellation under a screen point, or -1. */
function pickConstellation(sx: number, sy: number) {
  const c = W.cam;
  for (let k = 0; k < CONST.length; k++) {
    dirOf(CONST[k].az, CONST[k].el, dir);
    project(c, SKY_C[0] + dir[0] * 100, SKY_C[1] + dir[1] * 100, SKY_C[2] + dir[2] * 100, director.vw, director.vh, scr);
    if (scr.d <= 0) continue;
    const r = CONST[k].scale * 1.05 * c.F * director.vh;
    if (Math.hypot(scr.x - sx, scr.y - sy) < r) return k;
  }
  return -1;
}

const isUI = (t: EventTarget | null) => t instanceof Element && !!t.closest("a,button,input,textarea,select,[data-ui]");

export function startInteract(stage: HTMLElement): () => void {
  type Down = { id: number; x: number; y: number; lx: number; lt: number; vx: number; vy: number; ly: number; moved: boolean; yaw: number; pitch: number };
  let down: Down | null = null;
  let hoverQueued = false;
  let hx = 0,
    hy = 0,
    lastTx = -1e4,
    lastTy = -1e4,
    lastTt = 0;
  const touch = window.matchMedia("(hover: none)").matches;

  const setCursor = (c: string) => {
    if (stage.dataset.cursor !== c) stage.dataset.cursor = c;
  };
  const restCursor = () => {
    const a = W.act;
    if (a === 5) setCursor(live.hoverCon >= 0 ? "pick" : "look");
    else if (a === 0 || a === 1 || a === 3) setCursor("light");
    else setCursor("look");
  };

  const click = (x: number, y: number) => {
    const a = W.act;
    const g = director.g;
    if (frameAt(g) === 0 && (a === 0 || a === 1)) {
      const h = cityHit(x, y);
      if (h) addTrail(h[0], h[2], a === 1 ? 1.4 : 0.9);
      return;
    }
    if (a === 3) {
      strike(1);
      return;
    }
    if (a === 4) {
      const i = pickCloud(x, y);
      if (i >= 0) scrollToG(SEG.SHOT0 + i * SEG.SHOT_LEN + 56, { duration: 1.8 });
      return;
    }
    if (a === 5) {
      const k = pickConstellation(x, y);
      if (k >= 0) scrollToG(SEG.CON0 + k * SEG.CON_LEN + 100, { duration: 2.2 });
    }
  };

  const hover = () => {
    hoverQueued = false;
    const a = W.act;
    const overUI = isUI(document.elementFromPoint(hx, hy));
    if (a === 1 && !overUI && frameAt(director.g) === 0) {
      const now = performance.now();
      if (Math.hypot(hx - lastTx, hy - lastTy) > 36 || now - lastTt > 260) {
        const h = cityHit(hx, hy);
        if (h) {
          addTrail(h[0], h[2], 0.5);
          lastTx = hx;
          lastTy = hy;
          lastTt = now;
        }
      }
    }
    if (a === 5) live.hoverCon = overUI && live.hoverCon >= 0 ? live.hoverCon : pickConstellation(hx, hy);
    else if (live.hoverCon >= 0 && a !== 5) live.hoverCon = -1;
    restCursor();
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || isUI(e.target)) return;
    if (!(e.target instanceof Node) || !stage.contains(e.target)) return;
    down = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      lt: performance.now(),
      vx: 0,
      vy: 0,
      moved: false,
      yaw: live.lookYaw,
      pitch: live.lookPitch,
    };
    if (W.act === 2) live.holding = true;
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && !down) {
      hx = e.clientX;
      hy = e.clientY;
      if (!hoverQueued) {
        hoverQueued = true;
        requestAnimationFrame(hover);
      }
    }
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x,
      dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 7) {
      down.moved = true;
      live.dragging = true;
      setCursor("grabbing");
    }
    if (!down.moved) return;
    const now = performance.now();
    const dt = Math.max(1, now - down.lt) / 1000;
    const mx = e.clientX - down.lx,
      my = e.clientY - down.ly;
    down.vx = down.vx * 0.6 + (mx / dt) * 0.4;
    down.vy = down.vy * 0.6 + (my / dt) * 0.4;
    down.lx = e.clientX;
    down.ly = e.clientY;
    down.lt = now;
    live.lookYaw = Math.max(-0.75, Math.min(0.75, down.yaw - dx * 0.0024));
    live.lookPitch = Math.max(-0.35, Math.min(0.35, down.pitch + dy * 0.0016));
    live.lookVy = 0;
    live.lookVp = 0;
  };

  const end = (e: PointerEvent, cancel: boolean) => {
    if (!down || e.pointerId !== down.id) return;
    if (!down.moved && !cancel) click(e.clientX, e.clientY);
    if (down.moved) {
      live.lookVy = -down.vx * 0.0024 * 0.5;
      live.lookVp = down.vy * 0.0016 * 0.5;
    }
    down = null;
    live.dragging = false;
    live.holding = false;
    restCursor();
  };
  const onUp = (e: PointerEvent) => end(e, false);
  const onCancel = (e: PointerEvent) => end(e, true);

  // alive: on touch screens an idle wave of lights wanders over the city
  let waveT = 0;
  const unIdle = onFrame((f) => {
    if (W.act !== 1 || frameAt(f.g) !== 0 || f.g < SEG.D0 - 10 || f.g > SEG.D1) return;
    if (!touch) return;
    waveT += f.dt;
    if (waveT < 0.8) return;
    waveT = 0;
    const t = f.time * 0.35;
    const sx = director.vw * (0.5 + 0.36 * Math.sin(t * 1.3)),
      sy = director.vh * (0.5 + 0.28 * Math.sin(t * 2.1 + 1));
    const h = cityHit(sx, sy);
    if (h) addTrail(h[0], h[2], 0.4);
  }, 40);

  window.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  restCursor();
  return () => {
    unIdle();
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };
}
