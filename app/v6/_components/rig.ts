// CSS 3D rig matched to the shader camera. The stage's perspective equals the GL focal length in px
// (F * stage height), the rig carries the inverse camera transform, and planes sit at world positions,
// so DOM text and the rendered world move as one.
//
// A "ride" plane is anchored to the camera pose at clamp(g, g0, g1): before g0 it waits in the world
// ahead and approaches, between g0 and g1 it travels with the camera (readable), after g1 it is left
// behind and the camera flies past it.

import { director } from "./director";
import { type Pose, mkPose, mkBasis, basis, smooth, lin } from "./camera";
import { poseAt, W } from "./timeline";

export const D_REF = 7;
export const F_BASE = 1.5;

/** px per world unit for planes. */
export const unitPx = () => (F_BASE * director.vh) / D_REF;

export type Ride = {
  el: HTMLElement;
  g0: number;
  g1: number;
  gin: number;
  gout: number;
  sx: number; // screen anchor 0..1
  sy: number;
  syEnd?: number; // sy at the end of the ride (credits roll)
  ax: number; // element anchor 0..1
  ay: number;
  d: number; // depth at reading (world units)
  m?: Partial<Pick<Ride, "sx" | "sy" | "ax" | "ay" | "d">>;
  rollK?: number; // share of camera roll the plane cancels
  drift?: number; // depth fraction lost while riding
  swing?: number; // approach swing (deg, around y)
  tilt?: number; // approach tilt (deg, around x)
  /** Per-frame hook with ride phase info; returns an opacity multiplier or undefined. */
  on?: (info: RideInfo) => number | void;
  // runtime
  shown?: boolean;
  lastO?: number;
};

export type RideInfo = { g: number; approach: number; ride: number; leave: number; opacity: number };

const A = mkPose();
const B = mkBasis();
const CB = mkBasis();
const info: RideInfo = { g: 0, approach: 0, ride: 0, leave: 0, opacity: 0 };

let lastP = -1;

/** Writes the stage perspective and rig transform for the current rig camera. */
export function updateRig(stage: HTMLElement, rig: HTMLElement, cam: Pose) {
  const U = unitPx();
  const P = cam.F * director.vh;
  if (Math.abs(P - lastP) > 0.3) {
    stage.style.perspective = `${P.toFixed(1)}px`;
    lastP = P;
  }
  rig.style.transform =
    `translateZ(${P.toFixed(2)}px) rotateZ(${cam.roll.toFixed(5)}rad) rotateX(${cam.pitch.toFixed(5)}rad) ` +
    `rotateY(${cam.yaw.toFixed(5)}rad) translate3d(${(-cam.x * U).toFixed(2)}px, ${(cam.y * U).toFixed(2)}px, ${(cam.z * U).toFixed(2)}px)`;
  basis(cam, CB);
}

export function hidePlane(el: HTMLElement) {
  el.style.opacity = "0";
  el.style.transform = "translate3d(0px, 0px, -40000px)";
  el.setAttribute("data-off", "");
}

/** Places an element at a world position with a local rotation (rad) and scale. */
export function placeWorld(
  el: HTMLElement,
  x: number,
  y: number,
  z: number,
  ry: number,
  rx: number,
  rz: number,
  s: number,
  ax: number,
  ay: number
) {
  const U = unitPx();
  el.style.transform =
    `translate3d(${(x * U).toFixed(2)}px, ${(-y * U).toFixed(2)}px, ${(-z * U).toFixed(2)}px) ` +
    `rotateY(${ry.toFixed(5)}rad) rotateX(${rx.toFixed(5)}rad) rotateZ(${rz.toFixed(5)}rad) scale(${s.toFixed(4)}) ` +
    `translate(${(-ax * 100).toFixed(1)}%, ${(-ay * 100).toFixed(1)}%)`;
}

/** Depth of a world point in front of the current rig camera. */
export function depthOf(cam: Pose, x: number, y: number, z: number) {
  return (x - cam.x) * CB.f[0] + (y - cam.y) * CB.f[1] + (z - cam.z) * CB.f[2];
}

export function updateRide(r: Ride, g: number) {
  if (g < r.gin - 1 || g > r.gout + 1) {
    if (r.shown !== false) {
      hidePlane(r.el);
      r.shown = false;
      r.lastO = 0;
    }
    return;
  }
  const mob = director.mobile && r.m ? r.m : null;
  const sy0 = mob?.sy ?? r.sy;
  const sx = mob?.sx ?? r.sx,
    sy = r.syEnd === undefined ? sy0 : sy0 + (r.syEnd - r.sy) * lin(r.g0, r.g1, g),
    ax = mob?.ax ?? r.ax,
    ay = mob?.ay ?? r.ay,
    d = mob?.d ?? r.d;

  const gc = g < r.g0 ? r.g0 : g > r.g1 ? r.g1 : g;
  poseAt(gc, A);
  basis(A, B);
  let D = (d * A.F) / F_BASE;
  if (r.drift) D *= 1 - r.drift * lin(r.g0, r.g1, g);
  const ox = (sx - 0.5) * director.aspect * (D / A.F);
  const oy = (0.5 - sy) * (D / A.F);
  const x = A.x + B.f[0] * D + B.r[0] * ox + B.u[0] * oy;
  const y = A.y + B.f[1] * D + B.r[1] * ox + B.u[1] * oy;
  const z = A.z + B.f[2] * D + B.r[2] * ox + B.u[2] * oy;

  const approach = 1 - smooth(r.gin, r.g0, g);
  const leave = smooth(r.g1, r.gout, g);
  const fin = smooth(r.gin, r.gin + (r.g0 - r.gin) * 0.6, g);
  const fout = 1 - smooth(r.g1 + (r.gout - r.g1) * 0.35, r.gout, g);
  const dd = depthOf(W.rig, x, y, z);
  let o = fin * fout * smooth(0.6, 2.0, dd);

  info.g = g;
  info.approach = approach;
  info.ride = lin(r.g0, r.g1, g);
  info.leave = leave;
  info.opacity = o;
  if (r.on) {
    const k = r.on(info);
    if (typeof k === "number") o *= k;
  }

  const sw = ((r.swing ?? 0) * approach * approach * Math.PI) / 180;
  const tl = ((r.tilt ?? 0) * approach * approach * Math.PI) / 180;
  const rz = -W.rig.roll * (r.rollK ?? 0.6);
  const U = unitPx();
  r.el.style.transform =
    `translate3d(${(x * U).toFixed(2)}px, ${(-y * U).toFixed(2)}px, ${(-z * U).toFixed(2)}px) ` +
    `rotateY(${(-A.yaw + sw).toFixed(5)}rad) rotateX(${(-A.pitch + tl).toFixed(5)}rad) rotateZ(${rz.toFixed(5)}rad) ` +
    `scale(${(d / D_REF).toFixed(4)}) translate(${(-ax * 100).toFixed(1)}%, ${(-ay * 100).toFixed(1)}%)`;
  if (r.lastO === undefined || Math.abs(o - r.lastO) > 0.004) {
    r.el.style.opacity = o.toFixed(3);
    r.lastO = o;
  }
  const vis = o > 0.05;
  if (vis !== r.shown) {
    r.shown = vis;
    r.el.toggleAttribute("data-off", !vis);
  }
}

export const rigPose = () => W.rig;
export { mkPose };
