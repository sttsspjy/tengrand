import type { Entity, Edge, Kind } from "../_lib/kb";

// Canvas-2D "armillary" knowledge graph. Nodes live on concentric spherical shells (subject at the
// centre, then fields, works, items, stack terms); the layout is relaxed once, synchronously, by a
// small hand-written force pass. Each frame only rotates (yaw/pitch with inertia), projects with
// perspective and redraws, back to front, as an engraving. The loop runs only while active+visible.

type V3 = [number, number, number];

type N = {
  e: Entity;
  kind: Kind;
  p: V3;
  sx: number;
  sy: number;
  sz: number;
  k: number;
  hl: number;
  dim: number;
};

type L = { s: N; t: N; kind: Edge["kind"]; key: string };

type LabelSpec = {
  text: string;
  font: string;
  caps: boolean;
  spacing: string;
  color: string;
  a: number;
  x: number;
  y: number;
  align: CanvasTextAlign;
  halo: boolean;
  x0: number;
  x1: number;
  h: number;
};

export type Graph3DOpts = {
  fonts: { text: string; display: string };
  reduced: boolean;
  compact: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
};

const INK = "26,23,20";
const RED = "200,54,29";
const PAPER = "#F1ECE1";
const SHELL: Record<Kind, number> = {
  person: 0,
  group: 0.42,
  project: 0.66,
  item: 0.92,
  term: 1.06,
};
const D = 3.6;

const dir = (az: number, el: number): V3 => [
  Math.cos(el) * Math.cos(az),
  Math.sin(el),
  Math.cos(el) * Math.sin(az),
];
const norm = (v: V3, r: number): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [(v[0] / l) * r, (v[1] / l) * r, (v[2] / l) * r];
};

export class Graph3D {
  private ctx: CanvasRenderingContext2D;
  private nodes: N[] = [];
  private links: L[] = [];
  private byId = new Map<string, N>();
  private nbr = new Map<string, Set<string>>();
  private order: N[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private R = 200;
  yaw = -0.6;
  pitch = 0.42;
  private vyaw = 0;
  private vpitch = 0;
  private spin = 0;
  private raf = 0;
  private running = false;
  private active = true;
  private hover: N | null = null;
  private pinned: N | null = null;
  private drag: {
    id: number;
    x0: number;
    y0: number;
    lx: number;
    ly: number;
    lt: number;
    moved: boolean;
    touch: boolean;
  } | null = null;
  private focus: Set<string> | null = null;
  private pathEdges = new Set<string>();
  private pulse: { paths: N[][]; t0: number } | null = null;
  private ro: ResizeObserver;
  private born = performance.now();
  private last = performance.now();
  private dirty = true;

  constructor(
    private canvas: HTMLCanvasElement,
    ents: Entity[],
    edges: Edge[],
    private o: Graph3DOpts,
  ) {
    this.ctx = canvas.getContext("2d")!;
    for (const e of ents) {
      const n: N = {
        e,
        kind: e.kind,
        p: [0, 0, 0],
        sx: 0,
        sy: 0,
        sz: 0,
        k: 1,
        hl: 0,
        dim: 0,
      };
      this.nodes.push(n);
      this.byId.set(e.id, n);
      this.nbr.set(e.id, new Set());
    }
    for (const ed of edges) {
      const s = this.byId.get(ed.a)!;
      const t = this.byId.get(ed.b)!;
      this.links.push({ s, t, kind: ed.kind, key: `${ed.a}|${ed.b}` });
      this.nbr.get(ed.a)!.add(ed.b);
      this.nbr.get(ed.b)!.add(ed.a);
    }
    this.layout();
    this.resize();
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onCancel);
    canvas.addEventListener("pointerleave", this.onLeave);
    document.addEventListener("visibilitychange", this.wake);
    this.ro = new ResizeObserver(() => {
      this.resize();
      this.dirty = true;
      this.draw();
    });
    this.ro.observe(canvas);
    this.wake();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onCancel);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    document.removeEventListener("visibilitychange", this.wake);
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (on) {
      this.last = performance.now();
      this.wake();
    }
  }

  setQuery(focus: string[] | null, paths: string[][]) {
    this.focus = focus && focus.length ? new Set(focus) : null;
    this.pathEdges.clear();
    const polys: N[][] = [];
    for (const p of paths) {
      for (let i = 1; i < p.length; i++) {
        this.pathEdges.add(`${p[i - 1]}|${p[i]}`);
        this.pathEdges.add(`${p[i]}|${p[i - 1]}`);
        this.focus?.add(p[i - 1]);
      }
      polys.push(p.map((id) => this.byId.get(id)!));
    }
    this.pulse =
      polys.length && !this.o.reduced
        ? { paths: polys, t0: performance.now() }
        : null;
    // turn the first hit toward the viewer
    const first = polys[0]?.[polys[0].length - 1];
    if (first && !this.o.reduced) {
      // z after yaw is sin(azimuth - yaw): facing the viewer when yaw = azimuth - π/2.
      // Velocity decays at e^(-2.4t), so v = 2.4·Δ travels exactly Δ.
      const target = Math.atan2(first.p[2], first.p[0]) - Math.PI / 2;
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.vyaw = d * 2.4;
    }
    this.wake();
  }

  // ---- layout ------------------------------------------------------------------------

  private layout() {
    const groups = this.nodes.filter((n) => n.kind === "group");
    const gStep = (Math.PI * 2) / groups.length;
    const az = new Map<string, number>();
    const el = new Map<string, number>();
    for (const g of groups) {
      az.set(g.e.id, g.e.index * gStep);
      el.set(g.e.id, g.e.index % 2 ? -0.32 : 0.3);
    }
    const itemsOf = new Map<string, N[]>();
    for (const n of this.nodes)
      if (n.kind === "item") {
        const arr = itemsOf.get(n.e.groupId!) ?? [];
        arr.push(n);
        itemsOf.set(n.e.groupId!, arr);
      }
    for (const [gid, arr] of itemsOf) {
      const ga = az.get(gid)!;
      const ge = el.get(gid)!;
      arr.forEach((n, i) => {
        const t = i - (arr.length - 1) / 2;
        az.set(n.e.id, ga + t * 0.17);
        el.set(n.e.id, ge * 0.9 + (i % 2 ? 0.2 : -0.2) + t * 0.05);
      });
    }
    for (const n of this.nodes) {
      if (n.kind === "person") n.p = [0, 0, 0];
      else if (n.kind === "group" || n.kind === "item")
        n.p = norm(dir(az.get(n.e.id)!, el.get(n.e.id)!), SHELL[n.kind]);
    }
    for (const n of this.nodes) {
      if (n.kind !== "project") continue;
      const ns = [...this.nbr.get(n.e.id)!]
        .map((id) => this.byId.get(id)!)
        .filter((m) => m.kind === "item");
      const v: V3 = [0, 0, 0];
      ns.forEach((m) => ((v[0] += m.p[0]), (v[1] += m.p[1]), (v[2] += m.p[2])));
      if (!ns.length) Object.assign(v, dir(n.e.index * 1.7, 0.5));
      v[1] += n.e.index % 2 ? 0.35 : -0.35;
      n.p = norm(v, SHELL.project);
    }
    const termIdx: Record<string, number> = {};
    for (const n of this.nodes) {
      if (n.kind !== "term") continue;
      const p = [...this.nbr.get(n.e.id)!].map((id) => this.byId.get(id)!)[0];
      const i = (termIdx[p.e.id] = (termIdx[p.e.id] ?? -1) + 1);
      const a = Math.atan2(p.p[2], p.p[0]) + (i - 1) * 0.22;
      const e =
        Math.asin(Math.max(-1, Math.min(1, p.p[1] / SHELL.project))) +
        (i % 2 ? 0.14 : -0.14);
      n.p = norm(dir(a, e), SHELL.term);
    }
    // relax: pairwise repulsion + edge attraction, re-projected onto each shell
    const ns = this.nodes.filter((n) => n.kind !== "person");
    for (let it = 0; it < 220; it++) {
      const cool = 1 - it / 220;
      const f = new Map<N, V3>();
      ns.forEach((n) => f.set(n, [0, 0, 0]));
      for (let i = 0; i < ns.length; i++)
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i];
          const b = ns[j];
          const dx = a.p[0] - b.p[0];
          const dy = a.p[1] - b.p[1];
          const dz = a.p[2] - b.p[2];
          const d2 = dx * dx + dy * dy + dz * dz + 1e-4;
          if (d2 > 0.5) continue;
          const k = (0.0026 * cool) / d2;
          const fa = f.get(a)!;
          const fb = f.get(b)!;
          fa[0] += dx * k;
          fa[1] += dy * k * 1.4;
          fa[2] += dz * k;
          fb[0] -= dx * k;
          fb[1] -= dy * k * 1.4;
          fb[2] -= dz * k;
        }
      for (const l of this.links) {
        if (l.s.kind === "person") continue;
        const k = (l.kind === "uses" ? 0.004 : 0.03) * cool;
        const fs = f.get(l.s)!;
        const ft = f.get(l.t)!;
        for (let c = 0; c < 3; c++) {
          const d = l.t.p[c] - l.s.p[c];
          fs[c] += d * k;
          ft[c] -= d * k;
        }
      }
      for (const n of ns) {
        const v = f.get(n)!;
        n.p = norm(
          [
            n.p[0] + v[0],
            Math.max(-0.8, Math.min(0.8, n.p[1] + v[1])),
            n.p[2] + v[2],
          ],
          SHELL[n.kind],
        );
      }
    }
  }

  // ---- projection --------------------------------------------------------------------

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    // Layout size (unaffected by the sheet's 3D camera transform).
    const w = this.canvas.offsetWidth || r.width;
    const h = this.canvas.offsetHeight || r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.R = this.o.compact
      ? Math.min(this.w * 0.47, this.h * 0.36)
      : Math.min(this.w * 0.36, this.h * 0.52);
  }

  private proj(p: V3) {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const x1 = p[0] * cy + p[2] * sy;
    const z1 = -p[0] * sy + p[2] * cy;
    const y2 = p[1] * cp - z1 * sp;
    const z2 = p[1] * sp + z1 * cp;
    const k = D / (D - z2);
    const f = this.R;
    return { x: this.w / 2 + x1 * f * k, y: this.h / 2 - y2 * f * k, z: z2, k };
  }

  private project() {
    for (const n of this.nodes) {
      const q = this.proj(n.p);
      n.sx = q.x;
      n.sy = q.y;
      n.sz = q.z;
      n.k = q.k;
    }
    this.order = [...this.nodes].sort((a, b) => a.sz - b.sz);
  }

  // ---- loop --------------------------------------------------------------------------

  private wake = () => {
    if (this.running || !this.active || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    this.running = false;
    if (!this.active || document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const idle = !this.drag && !this.hover && !this.pinned;
    const spinTarget = this.o.reduced ? 0 : idle ? 0.075 : 0;
    this.spin += (spinTarget - this.spin) * Math.min(1, dt * 2);
    if (!this.drag) {
      this.yaw += (this.vyaw + this.spin) * dt;
      this.pitch += this.vpitch * dt;
      const decay = Math.exp(-dt * 2.4);
      this.vyaw *= decay;
      this.vpitch *= decay;
      this.pitch += (0.42 - this.pitch) * Math.min(1, dt * 0.35);
    }
    const easing = this.easeHighlights();
    this.draw(now);
    const moving =
      Math.abs(this.vyaw) > 0.002 || Math.abs(this.spin) > 0.001 || !!this.drag;
    const pulsing = !!this.pulse && now - this.pulse.t0 < 2000;
    const intro = now - this.born < 1800;
    if (moving || easing || pulsing || intro || this.dirty) {
      this.running = true;
      this.raf = requestAnimationFrame(this.frame);
    }
    this.dirty = false;
  };

  private easeHighlights() {
    const active = this.hover || this.pinned;
    const set = active
      ? new Set([active.e.id, ...this.nbr.get(active.e.id)!])
      : null;
    let moving = false;
    for (const n of this.nodes) {
      const lit = set
        ? set.has(n.e.id)
        : this.focus
          ? this.focus.has(n.e.id)
          : false;
      const dimmed = (set || this.focus) && !lit ? 1 : 0;
      const th = lit ? 1 : 0;
      const k = this.o.reduced ? 1 : 0.2;
      n.hl += (th - n.hl) * k;
      n.dim += (dimmed - n.dim) * k;
      if (Math.abs(th - n.hl) > 0.01 || Math.abs(dimmed - n.dim) > 0.01)
        moving = true;
      else {
        n.hl = th;
        n.dim = dimmed;
      }
    }
    return moving;
  }

  // ---- drawing -----------------------------------------------------------------------

  private ring(
    r: number,
    plane: "eq" | "mer",
    a: number,
    dash: number[],
    lw = 0.6,
  ) {
    const { ctx } = this;
    const N = 72;
    ctx.lineWidth = lw;
    const pts: { x: number; y: number; back: boolean }[] = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      // the meridian is fixed in the world, so it swings with the yaw like the other rings
      const p: V3 =
        plane === "eq"
          ? [Math.cos(t) * r, 0, Math.sin(t) * r]
          : [Math.cos(t) * r * 0.62, Math.sin(t) * r, Math.cos(t) * r * 0.78];
      const q = this.proj(p);
      pts.push({ x: q.x, y: q.y, back: q.z < 0 });
    }
    for (const back of [true, false]) {
      ctx.strokeStyle = `rgba(${INK},${back ? a * 0.45 : a})`;
      ctx.setLineDash(back ? [1, 5] : dash);
      ctx.beginPath();
      let open = false;
      for (let i = 1; i <= N; i++) {
        if (pts[i - 1].back !== back) {
          open = false;
          continue;
        }
        if (!open) ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        open = true;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  draw(now = performance.now()) {
    const { ctx, dpr, w, h } = this;
    this.project();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const intro = this.o.reduced
      ? 1
      : Math.min(1, Math.max(0.001, (now - this.born) / 1500));
    const ie = 1 - Math.pow(1 - intro, 3);

    // armillary guides: shell equators, an outer graduated ring, a meridian and the pole axis
    for (const r of [SHELL.group, SHELL.project, SHELL.item])
      this.ring(r * ie, "eq", 0.16, [1, 4]);
    this.ring(1.2 * ie, "eq", 0.32, [], 0.7);
    this.ring(1.2 * ie, "mer", 0.14, [], 0.6);
    ctx.strokeStyle = `rgba(${INK},${0.28 * ie})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const ticks = this.o.compact ? 72 : 144;
    for (let i = 0; i < ticks; i++) {
      const t = (i / ticks) * Math.PI * 2;
      const len = i % 12 === 0 ? 0.06 : i % 6 === 0 ? 0.035 : 0.018;
      const a = this.proj([Math.cos(t) * 1.2, 0, Math.sin(t) * 1.2]);
      if (a.z < -0.2) continue;
      const b = this.proj([
        Math.cos(t) * (1.2 + len),
        0,
        Math.sin(t) * (1.2 + len),
      ]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    const top = this.proj([0, 1.25, 0]);
    const bot = this.proj([0, -1.25, 0]);
    ctx.strokeStyle = `rgba(${INK},${0.2 * ie})`;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bot.x, bot.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const fade = (z: number) =>
      0.3 + 0.7 * Math.min(1, Math.max(0, (z + 1.1) / 2.2));

    // edges
    const act = this.hover ?? this.pinned;
    const lit = (l: L) =>
      this.pathEdges.has(l.key) ||
      (act && l.s.hl > 0.5 && l.t.hl > 0.5 && (l.s === act || l.t === act));
    for (const pass of [0, 1]) {
      for (const l of this.links) {
        const isLit = !!lit(l);
        if ((pass === 1) !== isLit) continue;
        const dim = Math.max(l.s.dim, l.t.dim);
        const z = (l.s.sz + l.t.sz) / 2;
        const base =
          l.kind === "group"
            ? 0.6
            : l.kind === "uses" || l.kind === "work"
              ? 0.24
              : 0.38;
        if (isLit) {
          ctx.strokeStyle = `rgba(${RED},0.95)`;
          ctx.lineWidth = 1.3;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = `rgba(${INK},${base * (1 - dim * 0.8) * ie * fade(z)})`;
          ctx.lineWidth = l.kind === "group" ? 0.9 : 0.6;
          ctx.setLineDash(l.kind === "uses" ? [2, 3] : []);
        }
        ctx.beginPath();
        ctx.moveTo(l.s.sx, l.s.sy);
        if (l.kind === "uses" || l.kind === "work") {
          const m = this.proj([
            (l.s.p[0] + l.t.p[0]) * 0.4,
            (l.s.p[1] + l.t.p[1]) * 0.4,
            (l.s.p[2] + l.t.p[2]) * 0.4,
          ]);
          ctx.quadraticCurveTo(m.x, m.y, l.t.sx, l.t.sy);
        } else ctx.lineTo(l.t.sx, l.t.sy);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // retrieval pulse, travelling in 3D along each lit path
    if (this.pulse) {
      const t = Math.max(0, (now - this.pulse.t0) / 1200);
      if (t < 1.6) {
        for (const poly of this.pulse.paths) {
          const segs = poly.length - 1;
          if (segs < 1) continue;
          const u = Math.min(1, t) * segs;
          const si = Math.min(segs - 1, Math.floor(u));
          const f = u - si;
          const a = poly[si].p;
          const b = poly[si + 1].p;
          const q = this.proj([
            a[0] + (b[0] - a[0]) * f,
            a[1] + (b[1] - a[1]) * f,
            a[2] + (b[2] - a[2]) * f,
          ]);
          const fd = t > 1 ? 1 - (t - 1) / 0.6 : 1;
          ctx.fillStyle = `rgba(${RED},${fd})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 3.4 * q.k, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${RED},${0.4 * fd})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, (8 + 6 * f) * q.k, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // nodes + labels, back to front
    const anyActive = !!(this.hover || this.pinned || this.focus);
    const alphaOf = (n: N) =>
      (1 - n.dim * 0.78) * ie * (n.hl > 0.5 ? 1 : fade(n.sz));
    // label occlusion: lit + subject first, then front to back; a label that would overlap a placed one is dropped
    const specs = new Map<N, LabelSpec>();
    const boxes: number[][] = [];
    const prio = (n: N) =>
      n.kind === "person" || n.hl > 0.5 ? 2 : n.kind === "group" ? 1 : 0;
    const cands = [...this.order].sort(
      (p, q) => prio(q) - prio(p) || q.sz - p.sz,
    );
    for (const n of cands) {
      const sp = this.labelSpec(n, alphaOf(n), anyActive);
      if (!sp) continue;
      const b = [sp.x0 - 3, sp.y - sp.h * 0.55, sp.x1 + 3, sp.y + sp.h * 0.55];
      if (
        prio(n) < 2 &&
        boxes.some(
          (o) => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3],
        )
      )
        continue;
      boxes.push(b);
      specs.set(n, sp);
    }
    for (const n of this.order) {
      const col = n.hl > 0.5 ? RED : INK;
      const a = (1 - n.dim * 0.78) * ie * (n.hl > 0.5 ? 1 : fade(n.sz));
      ctx.fillStyle = `rgba(${col},${a})`;
      ctx.strokeStyle = `rgba(${col},${a})`;
      ctx.lineWidth = 1;
      const r =
        (n.kind === "person"
          ? 6
          : n.kind === "group"
            ? 4.4
            : n.kind === "project"
              ? 4.2
              : n.kind === "item"
                ? 2.8
                : 1.7) * (n.kind === "person" ? 1 : n.k);
      ctx.beginPath();
      if (n.kind === "person") {
        ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r + 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r + 9, 0, Math.PI * 2);
        ctx.stroke();
      } else if (n.kind === "project") {
        ctx.rect(n.sx - r, n.sy - r, r * 2, r * 2);
        ctx.fillStyle = PAPER;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(n.sx - 1.4, n.sy - 1.4, 2.8, 2.8);
        ctx.fillStyle = `rgba(${col},${a})`;
        ctx.fill();
      } else if (n.kind === "item") {
        ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = PAPER;
        ctx.fill();
        ctx.stroke();
        if (n.hl > 0.5) {
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r - 1.1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${RED},1)`;
          ctx.fill();
        }
      } else {
        ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (n.hl > 0.5 && n.kind !== "person") {
        ctx.strokeStyle = `rgba(${RED},${0.5 * n.hl})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      const sp = specs.get(n);
      if (sp) this.drawLabel(sp);
    }
  }

  /** Label geometry + style for a node, or null when it has no label at this depth/size. */
  private labelSpec(n: N, a: number, anyActive: boolean): LabelSpec | null {
    const { ctx } = this;
    const compact = this.o.compact;
    const f = this.o.fonts;
    const lit = n.hl > 0.5;
    const k = Math.max(0.82, Math.min(1.22, n.k));
    let text = n.e.label;
    let font = "";
    let caps = false;
    let spacing = "0px";
    let color = lit ? RED : INK;
    if (n.kind === "person") {
      font = `500 ${compact ? 13 : 17}px ${f.display}`;
      caps = true;
      spacing = "0.12em";
    } else if (n.kind === "group") {
      if (compact && !lit) text = n.e.label.split(/[\s&]+/)[0];
      font = `500 ${(compact ? 11 : 13.5) * k}px ${f.text}`;
      caps = true;
      spacing = "0.09em";
    } else if (n.kind === "project") {
      font = `italic 500 ${(compact ? 12 : 16) * k}px ${f.display}`;
    } else {
      if (compact && !lit) return null;
      if (n.kind === "term" && !lit && n.sz < 0.05) return null;
      if (n.kind === "item" && !lit && n.sz < -0.55) return null;
      font =
        n.kind === "item"
          ? `italic ${(compact ? 12 : 14) * k}px ${f.text}`
          : `${(compact ? 11 : 12.5) * k}px ${f.text}`;
      color = lit ? RED : n.kind === "item" ? "75,68,59" : "111,102,90";
      if (!lit && anyActive) a *= 0.85;
    }
    ctx.font = font;
    ctx.fontVariantCaps = caps ? "all-small-caps" : "normal";
    ctx.letterSpacing = spacing;
    const tw = ctx.measureText(text).width;
    const hgt = parseFloat(font.match(/([\d.]+)px/)![1]);
    if (n.kind === "person") {
      const y = n.sy + (compact ? 24 : 30);
      return {
        text,
        font,
        caps,
        spacing,
        color,
        a,
        x: n.sx,
        y,
        align: "center",
        halo: true,
        x0: n.sx - tw / 2,
        x1: n.sx + tw / 2,
        h: hgt,
      };
    }
    let side = n.sx >= this.w / 2 - 2;
    const off = (n.kind === "group" ? 9 : 7) * k;
    if (side && n.sx + off + tw > this.w - 4) side = false;
    else if (!side && n.sx - off - tw < 4) side = true;
    const x = n.sx + (side ? off : -off);
    return {
      text,
      font,
      caps,
      spacing,
      color,
      a,
      x,
      y: n.sy,
      align: side ? "left" : "right",
      halo: n.kind === "group" || lit || n.sz > 0.2,
      x0: side ? x : x - tw,
      x1: side ? x + tw : x,
      h: hgt,
    };
  }

  private drawLabel(s: LabelSpec) {
    const { ctx } = this;
    ctx.font = s.font;
    ctx.fontVariantCaps = s.caps ? "all-small-caps" : "normal";
    ctx.letterSpacing = s.spacing;
    ctx.textBaseline = "middle";
    ctx.textAlign = s.align;
    if (s.halo) this.halo(s.text, s.x, s.y);
    ctx.fillStyle = `rgba(${s.color},${s.a})`;
    ctx.fillText(s.text, s.x, s.y);
  }

  private halo(text: string, x: number, y: number) {
    const { ctx } = this;
    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = PAPER;
    ctx.strokeText(text, x, y);
    ctx.restore();
  }

  // ---- input -------------------------------------------------------------------------

  /** Pointer position in canvas layout px (the canvas may be scaled by the sheet camera). */
  private pt(ev: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * this.w,
      y: ((ev.clientY - r.top) / r.height) * this.h,
    };
  }

  private pick(x: number, y: number) {
    let best: N | null = null;
    let bd = this.o.compact ? 22 * 22 : 16 * 16;
    for (const n of this.nodes) {
      const d = (n.sx - x) ** 2 + (n.sy - y) ** 2 - n.sz * 40;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  private setHover(n: N | null) {
    if (n === this.hover) return;
    this.hover = n;
    this.canvas.style.cursor = n ? "pointer" : "grab";
    this.o.onHover(n ? n.e.id : (this.pinned?.e.id ?? null));
    this.wake();
  }

  private onMove = (ev: PointerEvent) => {
    const { x, y } = this.pt(ev);
    const d = this.drag;
    if (d && ev.pointerId === d.id) {
      if (Math.abs(x - d.x0) > 4 || Math.abs(y - d.y0) > 4) d.moved = true;
      if (d.moved) {
        const now = performance.now();
        const dx = x - d.lx;
        const dy = d.touch ? 0 : y - d.ly;
        const dts = Math.max(0.008, (now - d.lt) / 1000);
        this.yaw += dx * 0.0085;
        this.pitch = Math.max(-0.35, Math.min(1.2, this.pitch + dy * 0.006));
        this.vyaw = (dx * 0.0085) / dts;
        this.vpitch = (dy * 0.006) / dts;
        d.lx = x;
        d.ly = y;
        d.lt = now;
        this.canvas.style.cursor = "grabbing";
        if (this.hover) this.setHover(null);
        this.wake();
      }
      return;
    }
    if (ev.pointerType === "mouse") this.setHover(this.pick(x, y));
  };

  private onDown = (ev: PointerEvent) => {
    const { x, y } = this.pt(ev);
    const touch = ev.pointerType !== "mouse";
    if (!touch) this.canvas.setPointerCapture(ev.pointerId);
    this.drag = {
      id: ev.pointerId,
      x0: x,
      y0: y,
      lx: x,
      ly: y,
      lt: performance.now(),
      moved: false,
      touch,
    };
    this.vyaw = 0;
    this.vpitch = 0;
  };

  private onCancel = (ev: PointerEvent) => {
    if (this.drag && ev.pointerId === this.drag.id) this.drag = null;
  };

  private onUp = (ev: PointerEvent) => {
    const d = this.drag;
    if (!d || ev.pointerId !== d.id) return;
    this.drag = null;
    this.canvas.style.cursor = this.hover ? "pointer" : "grab";
    if (performance.now() - d.lt > 90) {
      this.vyaw = 0;
      this.vpitch = 0;
    }
    this.wake();
    if (d.moved) return;
    const { x, y } = this.pt(ev);
    const n = this.pick(x, y);
    if (!n) {
      if (this.pinned) {
        this.pinned = null;
        this.o.onHover(null);
      }
      return;
    }
    if (d.touch) {
      if (this.pinned === n) this.o.onSelect(n.e.id);
      else {
        this.pinned = n;
        this.o.onHover(n.e.id);
      }
      return;
    }
    this.o.onSelect(n.e.id);
  };

  private onLeave = () => {
    if (!this.drag) this.setHover(null);
  };
}
