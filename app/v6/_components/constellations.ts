// Project constellations: one pictogram per project drawn in stars across the sky dome.
// Coordinates are local tangent-plane units (-1..1, y up) around the constellation's centre direction;
// the shader receives them packed into uniform arrays (see packConstellations).

export type Constellation = {
  az: number; // yaw of the centre direction (0 = +z, +PI/2 = +x / east)
  el: number; // elevation (rad)
  scale: number; // tangent units per local unit
  stars: [number, number, number][]; // x, y, magnitude
  segs: [number, number][];
};

const mirae: Pick<Constellation, "stars" | "segs"> = {
  // screen with a record light, waveform underneath
  stars: [
    [-0.95, 0.78, 0.9],
    [0.62, 0.78, 0.8],
    [0.62, -0.05, 0.85],
    [-0.95, -0.05, 0.7],
    [-0.17, 0.38, 1.35],
    [-0.95, -0.55, 0.6],
    [-0.66, -0.32, 0.75],
    [-0.42, -0.88, 0.7],
    [-0.14, -0.28, 0.85],
    [0.14, -0.8, 0.65],
    [0.4, -0.42, 0.8],
    [0.64, -0.66, 0.6],
    [0.95, -0.5, 0.9],
  ],
  segs: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 12],
  ],
};

const home: Pick<Constellation, "stars" | "segs"> = {
  // three task rows: one ticked, two open boxes
  stars: [
    [-0.95, 0.64, 0.7],
    [-0.76, 0.4, 0.9],
    [-0.46, 0.9, 1.2],
    [-0.2, 0.62, 0.65],
    [0.9, 0.62, 0.85],
    [-0.95, 0.15, 0.7],
    [-0.6, 0.15, 0.6],
    [-0.6, -0.17, 0.75],
    [-0.95, -0.17, 0.6],
    [-0.2, -0.01, 0.6],
    [0.62, -0.01, 0.8],
    [-0.95, -0.5, 0.65],
    [-0.6, -0.5, 0.7],
    [-0.6, -0.82, 0.6],
    [-0.95, -0.82, 0.8],
    [-0.2, -0.66, 0.6],
    [0.36, -0.66, 0.75],
  ],
  segs: [
    [0, 1],
    [1, 2],
    [3, 4],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 5],
    [9, 10],
    [11, 12],
    [12, 13],
    [13, 14],
    [14, 11],
    [15, 16],
  ],
};

const flow: Pick<Constellation, "stars" | "segs"> = {
  // a spoken waveform that resolves into three tasks
  stars: [
    [-1.0, 0.0, 0.6],
    [-0.83, 0.38, 0.75],
    [-0.67, -0.46, 0.7],
    [-0.5, 0.62, 0.85],
    [-0.34, -0.32, 0.7],
    [-0.18, 0.22, 0.6],
    [0.0, 0.0, 1.3],
    [0.42, 0.6, 0.85],
    [0.42, 0.0, 0.8],
    [0.42, -0.6, 0.85],
    [0.98, 0.6, 0.65],
    [0.86, 0.0, 0.6],
    [0.74, -0.6, 0.65],
  ],
  segs: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [6, 8],
    [6, 9],
    [7, 10],
    [8, 11],
    [9, 12],
  ],
};

const meridian: Pick<Constellation, "stars" | "segs"> = {
  // a globe: rim, one meridian, the equator
  stars: [
    [0.0, 0.88, 1.1],
    [0.62, 0.62, 0.7],
    [0.88, 0.0, 0.85],
    [0.62, -0.62, 0.65],
    [0.0, -0.88, 0.95],
    [-0.62, -0.62, 0.7],
    [-0.88, 0.0, 0.8],
    [-0.62, 0.62, 0.65],
    [0.34, 0.47, 0.55],
    [0.42, 0.0, 1.25],
    [0.34, -0.47, 0.55],
  ],
  segs: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 0],
    [0, 8],
    [8, 9],
    [9, 10],
    [10, 4],
    [6, 9],
    [9, 2],
  ],
};

// Order matches content `projects`. Big yaw jumps between neighbours make the camera swing across the dome.
export const CONST: Constellation[] = [
  { az: -0.75, el: 0.62, scale: 0.4, ...mirae },
  { az: 0.75, el: 0.86, scale: 0.37, ...home },
  { az: 2.2, el: 0.5, scale: 0.4, ...flow },
  { az: 3.75, el: 0.72, scale: 0.39, ...meridian },
];

export const MAX_STARS = 64;
export const MAX_SEGS = 64;

/** Packs all constellations into flat uniform arrays: stars (x, y, mag, k), segs (a, b, order, k),
 *  ranges (starStart, starCount, segStart, segCount). Star/segment positions are pre-scaled. */
export function packConstellations() {
  const stars = new Float32Array(MAX_STARS * 4);
  const segs = new Float32Array(MAX_SEGS * 4);
  const ranges = new Float32Array(16);
  let si = 0,
    gi = 0;
  CONST.forEach((c, k) => {
    ranges.set([si, c.stars.length, gi, c.segs.length], k * 4);
    const base = si;
    c.stars.forEach(([x, y, m]) => {
      stars.set([x * c.scale, y * c.scale, m, k], si * 4);
      si++;
    });
    const n = c.segs.length;
    c.segs.forEach(([a, b], i) => {
      segs.set([base + a, base + b, n > 1 ? (i / (n - 1)) * 0.62 : 0, k], gi * 4);
      gi++;
    });
  });
  return { stars, segs, ranges };
}

/** Unit direction for yaw/elevation in the world frame (y up, z forward). */
export function dirOf(az: number, el: number, out: number[] = [0, 0, 0]) {
  out[0] = Math.sin(az) * Math.cos(el);
  out[1] = Math.sin(el);
  out[2] = Math.cos(az) * Math.cos(el);
  return out;
}
