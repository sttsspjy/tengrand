"use client";

import { chapters, profile } from "@/content/profile";
import InkText from "./InkText";
import s from "../v5.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

export default function About() {
  const [lead, ...rest] = profile.about;
  const meta = [profile.name, profile.role, `@${profile.handle}`, profile.location];

  return (
    <section tabIndex={-1} id="v5-about" className={`${s.act1} ${s.section}`} aria-labelledby="v5-about-h">
      <header className={`${s.grid} ${s.secHead}`} data-plane data-ax="34" data-ay="-8" data-dz="260">
        <span className={s.label}>(01)</span>
        <h2 id="v5-about-h" className={s.secTitle}>
          {chapters.about}
        </h2>
      </header>

      <div className={`${s.grid} ${s.aboutLeadRow} ${s.originLeft}`} data-plane data-ax="8" data-ay="-26" data-dz="320">
        <span className={`${s.label} ${s.aboutNum}`}>{pad(1)}</span>
        <InkText text={lead} className={s.aboutLead} />
      </div>

      <div className={`${s.grid} ${s.aboutRest}`} data-plane data-ax="22" data-ay="14" data-az="-1.5" data-dz="240">
        <ul className={s.aboutMeta}>
          {meta.map((v) => (
            <li key={v} className={s.aboutMetaRow}>
              {v}
            </li>
          ))}
        </ul>
        {rest.map((p, i) => (
          <div key={i} className={s.aboutNote}>
            <span className={s.label}>{pad(i + 2)}</span>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
