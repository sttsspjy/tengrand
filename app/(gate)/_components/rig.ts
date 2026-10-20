// Shared mutable bridge between the questionnaire UI and the WebGL loop. Never React state.
import type { WorldId } from "@/content/quiz";

export const WORLD_IDS: WorldId[] = ["monolith", "nocturne", "codex"];

// Exit lengths (ms) of each world's gate half; the cover is solid at the end.
export const EXIT_MS: Record<WorldId, number> = { monolith: 1300, nocturne: 1600, codex: 1350 };
// Monolith blades start falling at this point of its exit.
export const BLADES_AT = 760;

// Contract colours: the viewport is fully this colour when the gate hands over.
export const CONTRACT: Record<WorldId, string> = { monolith: "#ff2a00", nocturne: "#000000", codex: "#1c1a19" };

export type Rig = {
  step: number; // 0 intro · 1–5 questions · 6 result
  winner: WorldId | null;
  lights: [number, number, number]; // target intensities (monolith, nocturne, codex)
  exit: { id: WorldId; t0: number } | null;
  reduced: boolean;
  slow: number; // debug time stretch for exit probes (?debug&slow=N)
  dragging: boolean;
  dragDX: number; // px accumulated since the last rendered frame
  px: number; // pointer -1..1
  py: number;
  wake: () => void; // set by the renderer: resumes the loop after any change
  out: { gl: boolean; ready: boolean }; // written by the renderer
};

export function createRig(): Rig {
  return {
    step: 0,
    winner: null,
    lights: lightsFor(tally([])),
    exit: null,
    reduced: false,
    slow: 1,
    dragging: false,
    dragDX: 0,
    px: 0,
    py: 0,
    wake: () => {},
    out: { gl: false, ready: false },
  };
}

export function oneHot(id: WorldId): [number, number, number] {
  return WORLD_IDS.map((k) => (k === id ? 1 : 0)) as [number, number, number];
}

/** Normalised weights for the running tally, optionally leaning a little toward a previewed answer. */
export function tally(picks: readonly WorldId[], preview: WorldId | null = null): [number, number, number] {
  const w = WORLD_IDS.map((k) => picks.filter((p) => p === k).length + 0.5);
  const sum = w[0] + w[1] + w[2];
  const base = w.map((x) => x / sum);
  if (!preview) return base as [number, number, number];
  const lean = 0.16;
  const hot = oneHot(preview);
  return base.map((x, i) => x * (1 - lean) + hot[i] * lean) as [number, number, number];
}

/** Light intensities for a set of weights. */
export function lightsFor(w: readonly number[]): [number, number, number] {
  return w.map((x) => 0.28 + 1.95 * x) as [number, number, number];
}

/** Result lighting: the winner dominates. */
export function lightsWin(id: WorldId): [number, number, number] {
  return WORLD_IDS.map((k) => (k === id ? 1.55 : 0.08)) as [number, number, number];
}
