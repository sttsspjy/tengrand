"use client";

import React from "react";
import { cn } from "@/lib/utils";

export const LampContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050508] w-full z-0",
        className
      )}
    >
      <div className="relative flex w-full flex-1 scale-y-125 items-center justify-center isolate z-0">
        {/* Left cone — neon pink */}
        <div
          style={{ backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`, opacity: 1, width: "30rem" }}
          className="absolute inset-auto right-1/2 h-56 overflow-visible w-[30rem]
            bg-gradient-conic from-pink-500 via-transparent to-transparent
            text-white [--conic-position:from_70deg_at_center_top]"
        >
          <div className="absolute w-full left-0 bg-[#050508] h-40 bottom-0 z-20
            [mask-image:linear-gradient(to_top,white,transparent)]" />
          <div className="absolute w-40 h-full left-0 bg-[#050508] bottom-0 z-20
            [mask-image:linear-gradient(to_right,white,transparent)]" />
        </div>

        {/* Right cone — neon pink */}
        <div
          style={{ backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`, opacity: 1, width: "30rem" }}
          className="absolute inset-auto left-1/2 h-56 w-[30rem]
            bg-gradient-conic from-transparent via-transparent to-pink-500
            text-white [--conic-position:from_290deg_at_center_top]"
        >
          <div className="absolute w-40 h-full right-0 bg-[#050508] bottom-0 z-20
            [mask-image:linear-gradient(to_left,white,transparent)]" />
          <div className="absolute w-full right-0 bg-[#050508] h-40 bottom-0 z-20
            [mask-image:linear-gradient(to_top,white,transparent)]" />
        </div>

        {/* Fog layers */}
        <div className="absolute top-1/2 h-48 w-full translate-y-12 scale-x-150 bg-[#050508] blur-2xl" />
        <div className="absolute top-1/2 z-50 h-48 w-full bg-transparent opacity-10 backdrop-blur-md" />

        {/* Wide outer glow — hot pink */}
        <div className="absolute inset-auto z-50 h-36 w-[28rem] -translate-y-1/2 rounded-full
          bg-pink-500 opacity-50 blur-3xl" />

        {/* Tight inner glow — fuchsia */}
        <div
          style={{ width: "16rem" }}
          className="absolute inset-auto z-30 h-36 w-64 -translate-y-[6rem] rounded-full
            bg-fuchsia-400 blur-2xl"
        />

        {/* Horizontal beam line — fuchsia */}
        <div
          style={{ width: "30rem" }}
          className="absolute inset-auto z-50 h-0.5 w-[30rem] -translate-y-[7rem] bg-fuchsia-400"
        />

        <div className="absolute inset-auto z-40 h-44 w-full -translate-y-[12.5rem] bg-[#050508]" />
      </div>

      <div className="relative z-50 flex -translate-y-80 flex-col items-center px-5">
        {children}
      </div>
    </div>
  );
};
