"use client";

import { chapters, profile } from "@/content/profile";
import s from "../v5.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

// Edge line of a transit: the chapter being left (left) and the one ahead (right).
function TransitHud({ from, to }: { from: [number, string]; to: [number, string] }) {
  return (
    <p className={`${s.transitHud} ${s.transitHudTop}`}>
      <span>
        {pad(from[0])} {from[1]}
      </span>
      <span>
        {pad(to[0])} {to[1]}
      </span>
    </p>
  );
}

// Scroll-length spacers for the two act switches. The sticky layer holds the typography that travels with the
// camera; every transform is written by the director loop from the damped story position.
export function Core() {
  return (
    <div id="v5-core" className={s.transit} data-transit="core" aria-hidden="true">
      <div className={s.transitStick}>
        <TransitHud from={[2, chapters.craft]} to={[3, chapters.skills]} />
        <div className={s.tunnelWords}>
          {[0, 1, 2].map((i) => (
            <span key={i} data-tw={i} className={s.tunnelWord}>
              {chapters.skills}
            </span>
          ))}
        </div>
        <div className={s.actCard} data-ti>
          <span className={s.actNum}>03</span>
          <span className={s.actName}>{chapters.skills}</span>
        </div>
      </div>
    </div>
  );
}

const FROM = Array.from(chapters.work.toUpperCase());
const TO = Array.from(profile.name.toUpperCase());

export function Shatter() {
  return (
    <div id="v5-shatter" className={s.transit} data-transit="shatter" aria-hidden="true">
      <div className={s.transitStick}>
        <TransitHud from={[4, chapters.work]} to={[5, chapters.contact]} />
        <div className={s.shatterWord} data-word="from">
          {FROM.map((c, i) => (
            <span key={i} data-sl={i} className={s.shatterCh}>
              {c}
            </span>
          ))}
        </div>
        <div className={`${s.shatterWord} ${s.signalWord}`} data-word="to">
          {TO.map((c, i) => (
            <span key={i} data-as={i} className={s.shatterCh}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
