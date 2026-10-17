// Shared timeline registry. The page is one fixed stage; scrollY is a timeline split into parts:
// a1 (Act I) · t1 (dive) · a2 (Act II) · t2 (press) · a3 (Act III). Parts register a measure()
// that returns their length in px plus anchor offsets, and an update() called once per frame.

export type PartId = "a1" | "t1" | "a2" | "t2" | "a3";
export const ORDER: PartId[] = ["a1", "t1", "a2", "t2", "a3"];

export type Span = { start: number; len: number };
export type Layout = Record<PartId, Span>;

export type Frame = {
  y: number;
  vw: number;
  vh: number;
  now: number;
  dt: number;
  reduced: boolean;
  mobile: boolean;
  L: Layout;
  /** progress through the dive (t1) and the press (t2), 0..1 */
  p1: number;
  p2: number;
  /** true on the first frame after a relayout */
  fresh: boolean;
};

export type Measured = { len: number; anchors?: Record<string, number> };

export type Part = {
  /** Which timeline span this part owns the length of (optional; transitions have fixed lengths). */
  owns?: PartId;
  measure?: (vw: number, vh: number, mobile: boolean) => Measured;
  update: (f: Frame) => void;
};

const parts = new Map<string, Part>();
let listener: (() => void) | null = null;

export const registerPart = (id: string, p: Part) => {
  parts.set(id, p);
  listener?.();
  return () => {
    parts.delete(id);
    listener?.();
  };
};

export const allParts = () => parts;
export const onPartsChange = (fn: (() => void) | null) => {
  listener = fn;
};
/** Ask the director to re-measure (content size changed). */
export const requestLayout = () => listener?.();

// ---- anchors: element id -> scroll position ------------------------------------------
export const anchors = new Map<string, number>();
export const current = { layout: null as Layout | null, y: 0 };

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sub = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
