"use client";

import { useEffect } from "react";
import { onFrame, isReduced } from "./director";
import { type Ride, updateRide, hidePlane } from "./rig";

/** Registers ride planes built after mount; updates them every frame (skipped for reduced motion). */
export function useRides(build: () => (Ride | null | undefined)[]) {
  useEffect(() => {
    if (isReduced()) return;
    const rides = build().filter((r): r is Ride => !!r);
    rides.forEach((r) => hidePlane(r.el));
    return onFrame((f) => {
      for (let i = 0; i < rides.length; i++) updateRide(rides[i], f.g);
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
