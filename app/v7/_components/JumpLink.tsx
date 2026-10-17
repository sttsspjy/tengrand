"use client";

import { goTo } from "../_lib/scroll";

/** In-page anchor that flies the camera to the target's station. */
export default function JumpLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        goTo(to);
      }}
    >
      {children}
    </a>
  );
}
