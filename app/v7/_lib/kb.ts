import { profile, capabilities, projects } from "@/content/profile";

// Knowledge base derived from content/profile: entities, links, backlinks, search.

export type Kind = "person" | "group" | "item" | "project" | "term";

export type Entity = {
  id: string;
  kind: Kind;
  label: string;
  /** "2.1" for groups, "2.1.c" for items, "3.2" for projects */
  section: string;
  anchor: string;
  groupId?: string;
  /** group index for groups/items, project index for projects/terms */
  index: number;
  /** extra text searched besides the label */
  haystack: string;
};

export type Edge = { a: string; b: string; kind: "group" | "item" | "work" | "uses" | "term" };

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const itemId = (name: string) => `i-${slug(name)}`;
export const groupId = (id: string) => `g-${id}`;
export const projectId = (id: string) => `p-${id}`;

const entities: Entity[] = [];
const edges: Edge[] = [];

entities.push({
  id: "jaeyoung",
  kind: "person",
  label: profile.name,
  section: "0",
  anchor: "top",
  index: 0,
  haystack: `${profile.role} ${profile.alias} ${profile.location} ${profile.handle} ${profile.statement} ${profile.about.join(" ")}`,
});

const itemByName = new Map<string, string>();

capabilities.forEach((g, gi) => {
  const gid = groupId(g.id);
  entities.push({
    id: gid,
    kind: "group",
    label: g.title,
    section: `2.${gi + 1}`,
    anchor: `entry-${g.id}`,
    index: gi,
    haystack: g.line,
  });
  edges.push({ a: "jaeyoung", b: gid, kind: "group" });
  g.items.forEach((name, ii) => {
    const id = itemId(name);
    itemByName.set(name.toLowerCase(), id);
    entities.push({
      id,
      kind: "item",
      label: name,
      section: `2.${gi + 1}.${String.fromCharCode(97 + ii)}`,
      anchor: `entry-${slug(name)}`,
      groupId: gid,
      index: gi,
      haystack: "",
    });
    edges.push({ a: gid, b: id, kind: "item" });
  });
});

const termSeen = new Set<string>();
projects.forEach((p, pi) => {
  const pid = projectId(p.id);
  entities.push({
    id: pid,
    kind: "project",
    label: p.name,
    section: `3.${pi + 1}`,
    anchor: `entry-${p.id}`,
    index: pi,
    haystack: `${p.kind}. ${p.desc}`,
  });
  edges.push({ a: "jaeyoung", b: pid, kind: "work" });
  p.stack.forEach((name) => {
    const known = itemByName.get(name.toLowerCase());
    if (known) {
      edges.push({ a: pid, b: known, kind: "uses" });
      return;
    }
    // Stack entries outside the capability list become plain "terms" attached to their project.
    const tid = `t-${slug(name)}`;
    if (!termSeen.has(tid)) {
      termSeen.add(tid);
      entities.push({
        id: tid,
        kind: "term",
        label: name,
        section: `3.${pi + 1}`,
        anchor: `entry-${p.id}`,
        index: pi,
        haystack: "",
      });
    }
    edges.push({ a: pid, b: tid, kind: "term" });
  });
});

export const ENTITIES = entities;
export const EDGES = edges;
export const BY_ID = new Map(entities.map((e) => [e.id, e]));

export const adjacency = (() => {
  const m = new Map<string, string[]>();
  entities.forEach((e) => m.set(e.id, []));
  edges.forEach((e) => {
    m.get(e.a)!.push(e.b);
    m.get(e.b)!.push(e.a);
  });
  return m;
})();

/** Projects whose stack names this item. */
export const projectsUsing = (id: string) =>
  edges.filter((e) => e.b === id && (e.kind === "uses" || e.kind === "term")).map((e) => BY_ID.get(e.a)!);

/** Items + terms in a project's stack, in stack order. */
export const stackOf = (pid: string) => {
  const p = projects.find((x) => projectId(x.id) === pid)!;
  return p.stack.map((name) => ({ name, entity: BY_ID.get(itemByName.get(name.toLowerCase()) ?? `t-${slug(name)}`) }));
};

export const entityByName = (name: string) => {
  const id = itemByName.get(name.toLowerCase());
  return id ? BY_ID.get(id) : undefined;
};

// Sidenotes for About. Each anchors on a phrase in profile.about and lists capability items as entity links.
export type Note = { para: number; phrase: string; items: string[] };
export const NOTES: Note[] = [
  { para: 0, phrase: "several AI coding agents", items: ["Claude Code", "Codex", "Multi-agent orchestration"] },
  { para: 1, phrase: "AI that searches and reads documents", items: ["Vector RAG", "GraphRAG", "Document parsing algorithms"] },
  { para: 2, phrase: "on my own computer", items: ["Local LLMs", "Hugging Face", "Stable Diffusion"] },
  { para: 2, phrase: "in the cloud", items: ["AWS", "Google Cloud", "Vercel"] },
];

/** Backlinks for an item: projects whose stack names it. */
export const backlinks = (id: string) => ({ projects: projectsUsing(id) });

// ---- retrieval -------------------------------------------------------------

export type Hit = { entity: Entity; score: number; path: string[]; via: string };

/** Shortest path from Jaeyoung over the undirected graph (BFS, neighbours in insertion order). */
export const pathTo = (target: string): string[] => {
  const prev = new Map<string, string | null>([["jaeyoung", null]]);
  const q = ["jaeyoung"];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === target) break;
    for (const n of adjacency.get(cur)!) {
      if (!prev.has(n)) {
        prev.set(n, cur);
        q.push(n);
      }
    }
  }
  const path: string[] = [];
  let c: string | null | undefined = target;
  while (c) {
    path.unshift(c);
    c = prev.get(c);
  }
  return path;
};

const snippet = (hay: string, term: string) => {
  const i = hay.toLowerCase().indexOf(term);
  if (i < 0) return "";
  const s = Math.max(0, i - 12);
  const e = Math.min(hay.length, i + term.length + 12);
  return `${s > 0 ? "…" : ""}${hay.slice(s, e).trim()}${e < hay.length ? "…" : ""}`;
};

/** Lexical retrieval: label exact > prefix > substring > body text. Returns up to `k` hits. */
export const search = (raw: string, k = 6): Hit[] => {
  const terms = raw.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const hits: Hit[] = [];
  for (const e of entities) {
    const label = e.label.toLowerCase();
    let score = 0;
    let via = "label";
    for (const t of terms) {
      if (label === t) score += 100;
      else if (label.split(/[\s/()&.-]+/).some((w) => w.startsWith(t))) score += 60;
      else if (label.includes(t)) score += 40;
      else if (e.haystack.toLowerCase().includes(t)) {
        score += e.kind === "item" ? 4 : 18;
        via = `“${snippet(e.haystack, t)}”`;
      }
    }
    if (score > 0) hits.push({ entity: e, score, path: pathTo(e.id), via });
  }
  hits.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  return hits.slice(0, k);
};

export const COUNTS = { nodes: entities.length, edges: edges.length, items: entities.filter((e) => e.kind === "item").length };
