"use client";

import { useRef } from "react";
import { chapters, profile } from "@/content/profile";
import { HINTS } from "./state";
import { useFitText } from "./useFitText";
import s from "../v5.module.css";

const META = [profile.role, profile.alias, profile.location, String(profile.year)];

export default function Hero() {
  const nameRef = useRef<HTMLHeadingElement>(null);
  useFitText(nameRef);
  const letters = Array.from(profile.name.toUpperCase());

  return (
    <section id="v5-top" className={`${s.act1} ${s.hero}`} aria-labelledby="v5-name">
      <div className={`${s.grid} ${s.heroMeta}`} data-plane data-ax="-16" data-ay="10" data-dz="220">
        {META.map((v) => (
          <p key={v} className={`${s.metaCell} ${s.mask}`}>
            <span data-meta className={s.metaValue}>
              {v}
            </span>
          </p>
        ))}
      </div>

      <div className={`${s.grid} ${s.heroMid}`} data-plane data-ax="-12" data-ay="-18" data-dz="300">
        <p className={s.heroCaption}>
          <span className={s.mask}>
            <span data-meta className={s.label}>
              (00) {chapters.intro}
            </span>
          </span>
        </p>
        <p className={s.statement} data-statement>
          {profile.statement}
        </p>
        <p className={s.heroHint} aria-hidden="true">
          <span className={s.mask}>
            <span data-meta className={s.heroHintText}>
              <span className={s.onPointer}>{HINTS[1][0]}</span>
              <span className={s.onTouch}>{HINTS[1][1]}</span>
            </span>
          </span>
        </p>
      </div>

      <div className={s.nameWrap}>
        <h1 id="v5-name" ref={nameRef} className={s.name}>
          <span className={s.srOnly}>
            {profile.name}, {profile.role}
          </span>
          {[letters.slice(0, 3), letters.slice(3)].map((part, k) => (
            <span key={k} className={s.namePart} aria-hidden="true">
              {part.map((l, i) => (
                <span key={i} className={s.letterMask} data-dolly>
                  <span data-letter className={s.letter}>
                    {l}
                  </span>
                </span>
              ))}
            </span>
          ))}
        </h1>
      </div>
    </section>
  );
}
