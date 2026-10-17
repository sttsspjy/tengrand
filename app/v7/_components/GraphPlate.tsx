"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { capabilities, chapters, profile, projects } from "@/content/profile";
import { ENTITIES, EDGES, BY_ID, adjacency, search, type Hit } from "../_lib/kb";
import { goTo } from "../_lib/scroll";
import type { Graph3D } from "./graph3d";
import s from "../act1.module.css";

/** Lets the Act I camera pause the graph loop when the plate is out of shot. */
export const graphHandle: { engine: Graph3D | null; active: boolean } = { engine: null, active: true };

const kindLabel = (id: string) => {
  const e = BY_ID.get(id)!;
  if (e.kind === "item") return BY_ID.get(e.groupId!)!.label;
  if (e.kind === "group") return chapters.skills;
  if (e.kind === "project") return projects[e.index].kind;
  if (e.kind === "term") return projects[e.index].name;
  return profile.role;
};

const open = (id: string) => {
  const e = BY_ID.get(id)!;
  goTo(e.anchor === "top" ? "about" : e.anchor);
};

export default function GraphPlate() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Graph3D | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const hits = useMemo((): Hit[] => search(q, 5), [q]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let alive = true;
    const root = c.closest("[data-codex]") as HTMLElement | null;
    const cs = getComputedStyle(root ?? document.documentElement);
    const fonts = {
      text: cs.getPropertyValue("--f-text").trim() || "Georgia, serif",
      display: cs.getPropertyValue("--f-display").trim() || "Georgia, serif",
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compact = c.offsetWidth < 620;
    Promise.all([import("./graph3d"), document.fonts.ready]).then(([{ Graph3D }]) => {
      if (!alive) return;
      const eng = new Graph3D(c, ENTITIES, EDGES, { fonts, reduced, compact, onHover: setHover, onSelect: open });
      eng.setActive(graphHandle.active);
      engineRef.current = eng;
      graphHandle.engine = eng;
      setReady(true);
    });
    return () => {
      alive = false;
      engineRef.current?.destroy();
      engineRef.current = null;
      graphHandle.engine = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setQuery(
      hits.map((h) => h.entity.id),
      hits.slice(0, 3).map((h) => h.path)
    );
  }, [hits, ready]);

  const focus = BY_ID.get(hover ?? "jaeyoung")!;
  const links = adjacency.get(focus.id)!;

  return (
    <figure className={s.plate} aria-label={`${chapters.skills} · ${chapters.work}`}>
      <span className={`${s.tick} ${s.tl}`} aria-hidden />
      <span className={`${s.tick} ${s.tr}`} aria-hidden />
      <span className={`${s.tick} ${s.bl}`} aria-hidden />
      <span className={`${s.tick} ${s.br}`} aria-hidden />
      <div className={s.plateHead}>
        <form
          className={s.query}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (hits[0]) open(hits[0].entity.id);
          }}
        >
          <label htmlFor="codex-q" className={s.queryLabel}>
            <span className={s.srOnly}>Search</span>
          </label>
          <input
            ref={inputRef}
            id="codex-q"
            className={s.queryInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder="Type to search, drag to turn"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="codex-trace"
          />
        </form>
      </div>

      <div className={s.canvasWrap}>
        <canvas
          ref={canvasRef}
          className={s.canvas}
          role="img"
          aria-label={`${profile.name}: ${capabilities.map((c) => c.title).join(", ")}; ${projects.map((p) => p.name).join(", ")}.`}
        />
      </div>

      <div className={s.plateFoot}>
        <output id="codex-trace" className={s.trace} aria-live="polite">
          {q.trim() ? (
            hits.length ? (
              hits.slice(0, 3).map((h) => (
                <span key={h.entity.id}>
                  <span className={s.traceArrow}>→</span>{" "}
                  <button type="button" className={s.traceHit} onClick={() => open(h.entity.id)}>
                    {h.entity.label}
                  </button>{" "}
                  <span className={s.tracePath}>{h.path.map((id) => BY_ID.get(id)!.label).join(" → ")}</span>
                </span>
              ))
            ) : (
              <span className={s.traceDim}>No match</span>
            )
          ) : (
            <>
              <span>
                <b className={s.traceHitStatic}>{focus.label}</b> <span className={s.traceDim}>· {kindLabel(focus.id)}</span>
              </span>
              <span className={s.tracePath}>
                {links
                  .slice(0, 10)
                  .map((id) => BY_ID.get(id)!.label)
                  .join(" · ")}
                {links.length > 10 ? " …" : ""}
              </span>
            </>
          )}
        </output>
      </div>
    </figure>
  );
}
