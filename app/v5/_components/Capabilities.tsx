"use client";

import { useState, type CSSProperties } from "react";
import { capabilities, chapters } from "@/content/profile";
import { scene } from "./state";
import s from "../v5.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

// Desktop: index list (left) drives a fixed-size detail plate (right); panels swap by masked
// transform/opacity only, so the page never reflows. Mobile: every group is listed in full.
export default function Capabilities() {
  const [active, setActive] = useState(0);
  // Each row strikes the blade wall from the row's right end, so the ripple starts where the eye already is.
  const pulse = (e: { currentTarget: HTMLElement }, amp = 0.6) => {
    const r = e.currentTarget.getBoundingClientRect();
    scene.strikes.push({ x: r.right, y: r.top + r.height / 2, amp });
  };

  return (
    <section tabIndex={-1} id="v5-capabilities" className={`${s.act2} ${s.section}`} aria-labelledby="v5-cap-h">
      <header className={`${s.grid} ${s.secHead}`} data-plane data-ax="-30" data-ay="18" data-dz="280">
        <span className={s.label}>(02)</span>
        <h2 id="v5-cap-h" className={s.secTitle}>
          {chapters.skills}
        </h2>
      </header>

      <div className={`${s.grid} ${s.capWrap}`} data-plane data-ax="10" data-ay="-12" data-dz="160">
        <ol className={s.capList}>
          {capabilities.map((c, i) => {
            const on = active === i;
            return (
              <li key={c.id} className={s.capRow} data-active={on || undefined}>
                <h3 className={s.capH}>
                  <button
                    type="button"
                    className={s.capBtn}
                    aria-expanded={on}
                    aria-controls={`v5-cap-${c.id}`}
                    onClick={(e) => {
                      setActive(i);
                      pulse(e, 0.9);
                    }}
                    onFocus={() => setActive(i)}
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse") return;
                      setActive(i);
                      pulse(e);
                    }}
                  >
                    <span className={s.capNum}>{pad(i + 1)}</span>
                    <span className={s.capTitle}>
                      <span className={s.capTitleText}>{c.title}</span>
                      <span className={s.capLeader} aria-hidden="true">
                        <span />
                      </span>
                    </span>
                    <span className={s.capCount}>
                      {pad(c.items.length)}
                      <span className={s.srOnly}> items</span>
                    </span>
                  </button>
                </h3>
                <div className={s.capInline}>
                  <p>{c.line}</p>
                  <ol>
                    {c.items.map((it, j) => (
                      <li key={it}>
                        <span className={s.capItemNum}>
                          {pad(i + 1)}.{j + 1}
                        </span>
                        {it}
                      </li>
                    ))}
                  </ol>
                </div>
              </li>
            );
          })}
        </ol>

        <div className={s.capDetail}>
          {capabilities.map((c, i) => {
            const on = active === i;
            return (
              <div
                key={c.id}
                id={`v5-cap-${c.id}`}
                role="region"
                aria-label={c.title}
                className={s.capPanel}
                data-active={on || undefined}
                aria-hidden={!on}
                inert={!on}
              >
                <p className={`${s.capPanelHead} ${s.mask}`}>
                  <span className={s.capRise} style={{ "--d": "0ms" } as CSSProperties}>
                    <span className={s.capPanelBig}>{pad(i + 1)}</span>
                    <span className={s.label}>{c.title}</span>
                  </span>
                </p>
                <p className={`${s.capLine} ${s.mask}`}>
                  <span className={s.capRise} style={{ "--d": "60ms" } as CSSProperties}>
                    {c.line}
                  </span>
                </p>
                <ol className={s.capItems}>
                  {c.items.map((it, j) => (
                    <li key={it} className={s.capItem}>
                      <span className={s.capRise} style={{ "--d": `${j * 45 + 120}ms` } as CSSProperties}>
                        <span className={s.capItemNum}>
                          {pad(i + 1)}.{j + 1}
                        </span>
                        <span className={s.capItemName}>{it}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
