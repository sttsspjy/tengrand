"use client";

import { useState } from "react";
import s from "../act1.module.css";

/** Tufte sidenote: floats into the right margin on wide screens, expands inline on narrow ones. */
export default function Sidenote({ n, children }: { n: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        id={`ref-${n}`}
        className={s.snRef}
        aria-expanded={open}
        aria-controls={`sn-${n}`}
        aria-label={`Note ${n}`}
        onClick={() => setOpen((o) => !o)}
      >
        {n}
      </button>
      <span id={`sn-${n}`} className={s.sn} data-open={open || undefined} role="note">
        <span className={s.snNum}>{n}</span>
        {children}
      </span>
    </>
  );
}
