// Adapted from React Bits (MIT) — ScrollReveal: word-split, scroll-scrubbed opacity reveal.
"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Props = { text: string; className?: string; base?: number };

// Renders text as word spans whose opacity is scrubbed from `base` to 1 as the block crosses the viewport.
export default function InkText({ text, className, base = 0.13 }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(/\s+/);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const pieces = ref.current!.querySelectorAll<HTMLElement>("[data-w]");
        gsap.fromTo(
          pieces,
          { opacity: base },
          {
            opacity: 1,
            ease: "none",
            stagger: 0.12,
            scrollTrigger: { trigger: ref.current, start: "top 82%", end: "bottom 52%", scrub: 0.6 },
          }
        );
      });
      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i} data-w>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
