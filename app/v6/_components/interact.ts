// Visitor toys on the world layer: click/tap drops ripples (night sea, developer bath), drag looks
// around with a spring return, in Act II drag moves the sun and clicking a monolith hard-cuts to its shot.

import { director, scrollToG } from "./director";
import { W, live, addRipple, SLABS, SEG, DARK } from "./timeline";
import { rayAt, hitGround, hitSlab } from "./camera";

const ray = [0, 0, 0];
const org = [0, 0, 0];

/** Index of the monolith under a screen point in the current camera, or -1. */
export function pickSlab(sx: number, sy: number): number {
  const c = W.cam;
  rayAt(c, sx, sy, director.vw, director.vh, ray);
  org[0] = c.x;
  org[1] = c.y;
  org[2] = c.z;
  let best = 1e9,
    id = -1;
  for (let i = 0; i < SLABS.length; i++) {
    const t = hitSlab(org, ray, SLABS[i]);
    if (t > 0 && t < best) {
      best = t;
      id = i;
    }
  }
  return id;
}

/** Hard cut to a capability shot (shot i frames monolith i). */
export function cutToShot(i: number) {
  scrollToG(SEG.SHOT0 + i * SEG.SHOT_LEN + 52, { immediate: true });
  live.cut = 1;
}

const isUI = (t: EventTarget | null) => t instanceof Element && !!t.closest("a,button,input,textarea,select,[data-print],[data-ui]");

export function startInteract(stage: HTMLElement): () => void {
  type Down = { id: number; x: number; y: number; lx: number; lt: number; vx: number; vy: number; ly: number; moved: boolean; yaw: number; pitch: number };
  let down: Down | null = null;
  let hoverQueued = false;
  let hx = 0,
    hy = 0;

  const setCursor = (c: string) => {
    if (stage.dataset.cursor !== c) stage.dataset.cursor = c;
  };
  const restCursor = () => {
    if (W.act === 1) setCursor(live.hoverSlab >= 0 ? "pick" : "sun");
    else setCursor("water");
  };

  const click = (x: number, y: number) => {
    const act = W.act;
    if (act === 1) {
      const id = pickSlab(x, y);
      if (id >= 0) cutToShot(id);
      else live.sunV += (x < director.vw / 2 ? -1 : 1) * 1.2;
      return;
    }
    rayAt(W.cam, x, y, director.vw, director.vh, ray);
    const h = hitGround(W.cam, ray);
    if (!h) return;
    if (act === 2) {
      if (h[1] < DARK.RIMZ) {
        addRipple(h[0], h[1], 1.3, 2);
        live.agitate = Math.min(2.2, live.agitate + 0.9);
      }
    } else addRipple(h[0], h[1], 1, act);
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
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && !down) {
      hx = e.clientX;
      hy = e.clientY;
      if (!hoverQueued) {
        hoverQueued = true;
        requestAnimationFrame(() => {
          hoverQueued = false;
          live.hoverSlab = W.act === 1 && !isUI(document.elementFromPoint(hx, hy)) ? pickSlab(hx, hy) : -1;
          restCursor();
        });
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
    if (W.act === 1) {
      live.sunOff += mx * 0.007;
      live.sunV = down.vx * 0.007;
    } else {
      live.lookYaw = Math.max(-0.75, Math.min(0.75, down.yaw - dx * 0.0024));
      live.lookPitch = Math.max(-0.35, Math.min(0.35, down.pitch + dy * 0.0016));
      live.lookVy = 0;
      live.lookVp = 0;
    }
  };

  const end = (e: PointerEvent, cancel: boolean) => {
    if (!down || e.pointerId !== down.id) return;
    if (!down.moved && !cancel) click(e.clientX, e.clientY);
    if (down.moved && W.act !== 1) {
      live.lookVy = -down.vx * 0.0024 * 0.5;
      live.lookVp = down.vy * 0.0016 * 0.5;
    }
    down = null;
    live.dragging = false;
    restCursor();
  };
  const onUp = (e: PointerEvent) => end(e, false);
  const onCancel = (e: PointerEvent) => end(e, true);

  window.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  restCursor();
  return () => {
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };
}
