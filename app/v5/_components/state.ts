// Shared mutable scroll/pointer/interaction state read by the WebGL loop and the DOM camera. Never React state.
export const scene = {
  u: 0, // story position from scroll: 0 hero · 1 about · 2→3 core transit · 3 capabilities · 4→5 work · 5→6 shatter · 6→7 contact
  cu: 0, // damped story position (written by the DOM loop, read by everything visual)
  act: 1,
  px: 0, // pointer -1..1
  py: 0,
  mx: -1e4, // pointer in CSS px (−1e4 = outside)
  my: -1e4,
  dragging: false,
  dragDX: 0, // px accumulated since the last rendered frame
  dragDY: 0,
  strikes: [] as { x: number; y: number; amp: number }[], // queued screen-space strikes
  introAt: -1, // performance.now() when the sculpture should assemble; -1 = not yet
  reduced: false,
  narrow: false,
  lastInput: 0, // performance.now() of the last pointer interaction
  settled: false, // set by the render loop: nothing left to animate
  seen: { cu: -1, px: -9, py: -9 }, // inputs as of the last rendered frame
  // Outputs written by the render loop.
  out: {
    roll: 0, // camera roll (radians) incl. barrel spin
    over: false, // pointer is over a slat
    floodX: 0.5, // screen uv of the active colour flood centre
    floodY: 0.5,
    camY: 0,
  },
  onOver: null as null | ((over: boolean) => void),
};

// One interaction hint per act (one per toy): [pointer, touch].
export const HINTS: Record<number, [string, string]> = {
  1: ["Drag to turn, click to strike", "Swipe to turn, tap to strike"],
  2: ["Click to ripple the wall", "Tap to ripple the wall"],
  3: ["Drag to spin the ring", "Swipe to spin the ring"],
};

export const lenisRef: {
  current: { scrollTo: (t: string | number | HTMLElement, o?: object) => void; velocity: number } | null;
} = {
  current: null,
};
