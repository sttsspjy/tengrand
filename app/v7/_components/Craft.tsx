"use client";

import { useEffect, useRef } from "react";
import { craft } from "@/content/profile";
import { registerPart, sub, type Frame } from "../_lib/stage";
import { LEN, ANCHORS, T, localU } from "./craft/timeline";
import Marbling from "./craft/Marbling";
import Zoetrope from "./craft/Zoetrope";
import WoodType from "./craft/WoodType";
import s from "../craft.module.css";

// Craft: three scenes between About and the graph plate: G marbling bath, H zoetrope, I wood type.
// This part owns the cr span (length + anchors), the layer's seam crossfades and the ink veil of the dive;
// each scene registers its own update for its camera.

export default function Craft() {
  const layerRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current!;
    const veil = veilRef.current!;
    let op = "";
    let vo = "";
    const un = registerPart("craft", {
      owns: "cr",
      measure: (_vw, vh) => ({
        len: LEN * vh,
        anchors: Object.fromEntries(Object.entries(ANCHORS).map(([k, v]) => [k, v * vh])),
      }),
      update: (f: Frame) => {
        const u = localU(f);
        if (u < -0.8 || u > LEN + 0.5) return;
        // crossfades with Act I on both seams
        const o = Math.min(sub(u, -0.24, 0.1), 1 - sub(u, LEN - 0.12, LEN + 0.38));
        const ov = o.toFixed(3);
        if (ov !== op) {
          op = ov;
          layer.style.opacity = ov;
        }
        // the dive into the ink closes to black, the zoetrope room opens from it
        const v = u < T.dive[1] ? sub(u, T.dive[0] + 0.32, T.dive[1] - 0.02) : 1 - sub(u, T.hOut[0] + 0.06, T.hOut[0] + 0.3);
        const vv = (f.reduced ? Math.min(1, v * 1.4) : v).toFixed(3);
        if (vv !== vo) {
          vo = vv;
          veil.style.opacity = vv;
        }
      },
    });
    return un;
  }, []);

  return (
    <div className={s.layer} data-layer="cr" ref={layerRef}>
      <Marbling p={craft[0]} />
      <Zoetrope p={craft[1]} />
      <WoodType p={craft[2]} />
      <div className={s.veil} ref={veilRef} aria-hidden />
    </div>
  );
}
