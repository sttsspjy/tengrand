"use client";

import { useState } from "react";
import Link from "next/link";
import { chapters, profile } from "@/content/profile";
import BreatheLink from "./BreatheLink";
import s from "../v5.module.css";

export default function Contact() {
  const [copied, setCopied] = useState(false);
  const { email, github } = profile.contact;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${email}`;
    }
  };

  return (
    <section tabIndex={-1} id="v5-contact" className={`${s.act3} ${s.section} ${s.contact}`} aria-labelledby="v5-contact-h">
        <header className={`${s.grid} ${s.secHead}`} data-plane data-ax="-24" data-ay="-20" data-dz="300">
          <span className={s.label}>(04)</span>
          <h2 id="v5-contact-h" className={s.secTitle}>
            {chapters.contact}
          </h2>
        </header>

        <div className={`${s.contactMailWrap} ${s.originBottom}`} data-plane data-ax="48" data-dz="200">
          <BreatheLink text={email} href={`mailto:${email}`} className={s.contactMail} />
        </div>

        <div className={`${s.grid} ${s.contactRow}`}>
          <div className={s.contactCell}>
            <span className={s.label}>Email</span>
            <button type="button" className={s.textBtn} onClick={copy} aria-live="polite">
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
          <div className={s.contactCell}>
            <span className={s.label}>GitHub</span>
            <a className={s.textLink} href={github} target="_blank" rel="noreferrer">
              github.com/{profile.handle} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>
  );
}

export function Footer() {
  return (
    <footer className={`${s.act3} ${s.grid} ${s.footer}`}>
      <span className={s.footSmall}>
        © {profile.year} {profile.name}
      </span>
      <span className={`${s.footSmall} ${s.footMid}`}>{profile.role}</span>
      <Link href="/" className={s.restart}>
        <span className={s.restartText}>{chapters.restart}</span>
        <span className={s.restartArrow} aria-hidden="true">
          ↖
        </span>
      </Link>
    </footer>
  );
}
