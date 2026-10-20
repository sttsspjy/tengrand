import type { Frame } from "../../_lib/stage";

// Craft timeline in viewport heights, relative to the start of the cr span. Negative values and values
// past LEN fall inside the seams the Director overlaps with Act I (−0.7 before, +0.45 after).

export const LEN = 8.25;

export const T = {
  // G · marbling: grazing rush over the paper, then crane up to top-down
  gIn: [-0.4, 0.42],
  gTilt: [0.42, 1.0],
  gHold: [1.0, 1.85],
  // G → H: dive into the ink
  dive: [1.85, 2.45],
  // H · zoetrope: out of the dark, eye level at the slits, crane up and over
  hOut: [2.4, 2.85],
  hEye: [2.85, 3.35],
  hCrane: [3.35, 4.25],
  hHold: [4.25, 4.85],
  // H → I: whip-pan, crane down to type level
  whip: [4.85, 5.2],
  iDown: [5.15, 5.6],
  // I · wood type: slams while the camera rises to the broadside
  iSlam: [5.6, 7.0],
  iRise: [5.6, 7.1],
  iHold: [7.1, 7.65],
  // I → plate: pull up + barrel roll
  out: [7.65, 8.65],
} as const;

export const ANCHORS: Record<string, number> = {
  craft: 1.08,
  "craft-alive": 1.08,
  "craft-motion": 2.9,
  "craft-louder": 5.6,
};

/** Scroll position in viewport heights relative to the start of Craft. */
export const localU = (f: Frame) => (f.y - f.L.cr.start) / f.vh;
