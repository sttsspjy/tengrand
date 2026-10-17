// Shared mutable bridge between the questionnaire UI and the WebGL loop. Never React state.
import type { WorldId } from "@/content/quiz";

export const WORLD_IDS: WorldId[] = ["monolith", "nocturne", "codex"];

// Camera keys: 0 intro, 1–5 questions, 6–8 result per world (monolith, nocturne, codex).
export const CAM_RESULT = 6;

export type Rig = {
  target: [number, number, number]; // blend weights (monolith, nocturne, codex) the sculpture moves toward
  version: number; // bumps on every new target
  tChange: number; // performance.now() of the last target change
  spread: number; // seconds the ripple takes to cross the sculpture
  cam: number; // camera key index
  dive: boolean; // hand-off: camera flies into the form
  reduced: boolean;
  dragging: boolean;
  dragDX: number; // px accumulated since the last rendered frame
  px: number; // pointer -1..1
  py: number;
  stamp: number; // bumps on any input change; the scheduler renders when it differs from the last seen value
  out: { cx: number; cy: number; settled: boolean; idle: boolean }; // written by the render loop
};

export function createRig(): Rig {
  return {
    target: [1, 0, 0],
    version: 0,
    tChange: 0,
    spread: 1,
    cam: 0,
    dive: false,
    reduced: false,
    dragging: false,
    dragDX: 0,
    px: 0,
    py: 0,
    stamp: 0,
    out: { cx: -1, cy: -1, settled: false, idle: true },
  };
}

/** Sets a new blend target; the sculpture ripples toward it over `spread` seconds. */
export function aim(rig: Rig, w: readonly number[], spread: number) {
  const t = rig.target;
  if (Math.abs(t[0] - w[0]) + Math.abs(t[1] - w[1]) + Math.abs(t[2] - w[2]) < 1e-4) return;
  rig.target = [w[0], w[1], w[2]];
  rig.version++;
  rig.tChange = performance.now();
  rig.spread = spread;
  rig.stamp++;
}

export function oneHot(id: WorldId): [number, number, number] {
  return WORLD_IDS.map((k) => (k === id ? 1 : 0)) as [number, number, number];
}

/** Blend weights for the running tally, optionally leaning toward a previewed answer. */
export function tally(picks: readonly WorldId[], preview: WorldId | null = null): [number, number, number] {
  const w = WORLD_IDS.map((k) => picks.filter((p) => p === k).length + 0.35);
  const sum = w[0] + w[1] + w[2];
  const base = w.map((x) => x / sum);
  if (!preview) return base as [number, number, number];
  const lean = 0.3;
  const hot = oneHot(preview);
  return base.map((x, i) => x * (1 - lean) + hot[i] * lean) as [number, number, number];
}
