import { easeInOut } from "./stage";

// Scroll-driven camera track: a sequence of holds (camera at rest, optionally panning a→b)
// and flights between them. A flight eases from the previous hold's end pose to the next hold's
// start pose and adds an `arc` offset shaped by sin(πu), so the camera lifts/tilts/banks mid-flight
// and has zero velocity only at the stations.

export type Pose = Record<string, number>;
export type Hold = { kind: "hold"; a: Pose; b?: Pose; len: number; id?: string };
export type Fly = { kind: "fly"; len: number; arc?: Pose; ease?: (t: number) => number };
export type Seg = Hold | Fly;

export class Track {
  readonly total: number;
  readonly starts: number[];

  constructor(readonly segs: Seg[]) {
    let acc = 0;
    this.starts = segs.map((s) => {
      const at = acc;
      acc += s.len;
      return at;
    });
    this.total = acc;
  }

  /** Scroll offset where the hold with this id begins. */
  startOf(id: string) {
    const i = this.segs.findIndex((s) => s.kind === "hold" && s.id === id);
    return i < 0 ? 0 : this.starts[i];
  }

  /** Index of the segment containing y, and local 0..1 progress inside it. */
  locate(y: number) {
    const n = this.segs.length;
    if (y <= 0) return { i: 0, u: 0 };
    for (let i = 0; i < n; i++) {
      const s = this.starts[i];
      const l = this.segs[i].len;
      if (y < s + l) return { i, u: l > 0 ? (y - s) / l : 1 };
    }
    return { i: n - 1, u: 1 };
  }

  at(y: number, reduced = false): Pose {
    const { i, u } = this.locate(y);
    const seg = this.segs[i];
    if (seg.kind === "hold") return mix(seg.a, seg.b ?? seg.a, u);
    const prev = this.prevHold(i);
    const next = this.nextHold(i);
    const from = prev ? (prev.b ?? prev.a) : next!.a;
    const to = next ? next.a : from;
    const e = (seg.ease ?? easeInOut)(u);
    const out = mix(from, to, e);
    if (seg.arc && !reduced) {
      const k = Math.sin(Math.PI * e);
      for (const key in seg.arc) out[key] = (out[key] ?? 0) + seg.arc[key] * k;
    }
    return out;
  }

  private prevHold(i: number) {
    for (let j = i - 1; j >= 0; j--) if (this.segs[j].kind === "hold") return this.segs[j] as Hold;
    return null;
  }
  private nextHold(i: number) {
    for (let j = i + 1; j < this.segs.length; j++) if (this.segs[j].kind === "hold") return this.segs[j] as Hold;
    return null;
  }
}

export const mix = (a: Pose, b: Pose, t: number): Pose => {
  const o: Pose = {};
  for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t;
  for (const k in b) if (!(k in a)) o[k] = b[k];
  return o;
};
