"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BY_ID, backlinks, stackOf } from "../_lib/kb";
import { capabilities, projects, chapters } from "@/content/profile";
import { goTo } from "../_lib/scroll";
import s from "../act1.module.css";

// Hover previews: one fixed popover shared by every EntityLink on the page.

type Api = { show: (id: string, el: HTMLElement) => void; hide: () => void; keep: () => void };
const Ctx = createContext<Api | null>(null);

type State = { id: string; x: number; y: number; above: boolean } | null;

const W = 320;

export function PopoverProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<State>(null);
  const showT = useRef(0);
  const hideT = useRef(0);

  const show = useCallback((id: string, el: HTMLElement) => {
    window.clearTimeout(hideT.current);
    window.clearTimeout(showT.current);
    showT.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const above = r.bottom + 260 > window.innerHeight && r.top > 280;
      const x = Math.max(12, Math.min(vw - W - 12, r.left + r.width / 2 - 40));
      setSt({ id, x, y: above ? window.innerHeight - r.top + 10 : r.bottom + 10, above });
    }, 140);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(showT.current);
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => setSt(null), 160);
  }, []);
  const keep = useCallback(() => window.clearTimeout(hideT.current), []);

  useEffect(() => {
    if (!st) return;
    const close = () => setSt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, { passive: true, once: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [st]);

  return (
    <Ctx.Provider value={{ show, hide, keep }}>
      {children}
      {st && (
        <aside
          key={st.id}
          className={`${s.pop} ${st.above ? s.popAbove : ""}`}
          style={st.above ? { left: st.x, bottom: st.y, width: W } : { left: st.x, top: st.y, width: W }}
          onMouseEnter={keep}
          onMouseLeave={hide}
          role="tooltip"
        >
          <PreviewBody id={st.id} />
        </aside>
      )}
    </Ctx.Provider>
  );
}

function PreviewBody({ id }: { id: string }) {
  const e = BY_ID.get(id);
  if (!e) return null;
  if (e.kind === "item") {
    const g = BY_ID.get(e.groupId!)!;
    const used = backlinks(id).projects;
    return (
      <>
        <p className={s.popMeta}>
          <span>{chapters.skills}</span>
          <span>{g.label}</span>
        </p>
        <p className={s.popTitle}>{e.label}</p>
        {used.length > 0 && (
          <>
            <span className={s.popRule} aria-hidden />
            <dl className={s.popDl}>
              <dt>{chapters.work}</dt>
              <dd>{used.map((p) => p.label).join(", ")}</dd>
            </dl>
          </>
        )}
      </>
    );
  }
  if (e.kind === "group") {
    const c = capabilities[e.index];
    return (
      <>
        <p className={s.popMeta}>
          <span>{chapters.skills}</span>
          <span>{String(e.index + 1).padStart(2, "0")}</span>
        </p>
        <p className={s.popTitle}>{c.title}</p>
        <span className={s.popRule} aria-hidden />
        <p className={s.popText}>{c.line}</p>
      </>
    );
  }
  if (e.kind === "project") {
    const p = projects[e.index];
    return (
      <>
        <p className={s.popMeta}>
          <span>{chapters.work}</span>
          <span>{p.year}</span>
        </p>
        <p className={s.popTitle}>{p.name}</p>
        <span className={s.popRule} aria-hidden />
        <p className={s.popText}>{p.desc.split(". ")[0].replace(/\.$/, "")}.</p>
        <p className={s.popStack}>{stackOf(e.id).map((x) => x.name).join(" · ")}</p>
        {!p.link && p.status && <p className={s.popStatus}>{p.status}</p>}
      </>
    );
  }
  const p = projects[e.index];
  return (
    <>
      <p className={s.popMeta}>
        <span>{chapters.work}</span>
        <span>{p.year}</span>
      </p>
      <p className={s.popTitle}>{e.label}</p>
      <span className={s.popRule} aria-hidden />
      <p className={s.popText}>{p.name}</p>
    </>
  );
}

/** Internal link to an entity's entry, with hover/focus preview. */
export function EntityLink({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const api = useContext(Ctx);
  const e = BY_ID.get(id);
  if (!e) return <>{children}</>;
  return (
    <a
      href={`#${e.anchor}`}
      className={`${s.elink} ${className ?? ""}`}
      onMouseEnter={(ev) => api?.show(id, ev.currentTarget)}
      onMouseLeave={() => api?.hide()}
      onFocus={(ev) => api?.show(id, ev.currentTarget)}
      onBlur={() => api?.hide()}
      onClick={(ev) => {
        ev.preventDefault();
        api?.hide();
        goTo(e.anchor);
      }}
    >
      {children}
    </a>
  );
}
