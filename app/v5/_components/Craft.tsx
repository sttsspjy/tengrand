"use client";

import { useRef } from "react";
import { chapters, craft } from "@/content/profile";
import { useFitText } from "./useFitText";
import s from "../v5.module.css";

const pad = (n: number) => String(n).padStart(2, "0");
const words = (t: string) => t.split(/\s+/).filter(Boolean);

// Masked word: the director slides [data-cw] up through its mask.
function W({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`${s.cwMask} ${className}`}>
      <span data-cw className={s.cw}>
        {children}
      </span>
    </span>
  );
}

function SlideHead({ i, id }: { i: number; id: string }) {
  return (
    <p className={`${s.grid} ${s.slideHead}`} aria-hidden="true" data-head>
      <span className={s.slideHeadNum}>
        <W>(02)</W>
      </span>
      <span className={s.slideHeadName}>
        <W>{chapters.craft}</W>
      </span>
      <span className={s.slideHeadIdx}>
        <W>{`${pad(i + 1)} / ${pad(craft.length)}`}</W>
      </span>
      <span className={s.slideHeadId}>
        <W>{id}</W>
      </span>
    </p>
  );
}

// Three Craft slides. The scroll length here drives the craft story range; the fixed layer holds the type,
// whose transforms the director writes from the damped craft position.
export default function Craft() {
  const [A, B, C] = craft;
  const [loud, ...rest] = words(C.after);
  const loudRef = useRef<HTMLSpanElement>(null);
  useFitText(loudRef);

  return (
    <section tabIndex={-1} id="v5-craft" className={s.craft} aria-labelledby="v5-craft-h">
      <h2 id="v5-craft-h" className={s.srOnly}>
        {chapters.craft}
      </h2>
      <div className={s.craftLayer} data-craft-layer>
        <div className={`${s.slide} ${s.slideA}`} data-slide="0">
          <SlideHead i={0} id={A.id} />
          <h3 className={`${s.grid} ${s.aHead}`} data-drop>
            <span className={s.aLine}>
              {words(A.before).map((w, i) => (
                <W key={i}>{w}</W>
              ))}
            </span>
            <span className={s.aAccentLine}>
              <W className={s.aAccent}>{A.accent}</W>
            </span>
          </h3>
          {A.hint && (
            <p className={`${s.grid} ${s.aHintRow}`} aria-hidden="true">
              <span className={s.aHint}>
                <span data-cw className={s.cw}>
                  <i className={s.flipDot} />
                  {A.hint}
                </span>
              </span>
            </p>
          )}
        </div>

        <div className={`${s.slide} ${s.slideB}`} data-slide="1">
          <SlideHead i={1} id={B.id} />
          <h3 className={s.bHead} data-breathe>
            <span className={s.bLine}>
              {words(B.before).map((w, i) => (
                <W key={i}>{w}</W>
              ))}
            </span>
            <span className={s.bAccentLine}>
              <W className={s.bAccent}>{B.accent}</W>
            </span>
          </h3>
          {B.sub && (
            <p className={s.bSub}>
              <i className={s.bHair} data-hair aria-hidden="true" />
              <span className={s.cwMask}>
                <span data-cw className={s.cw}>
                  {B.sub}
                </span>
              </span>
            </p>
          )}
        </div>

        <div className={`${s.slide} ${s.slideC}`} data-slide="2">
          <SlideHead i={2} id={C.id} />
          <div className={s.cFly} aria-hidden="true">
            {[...words(C.before), C.accent, ...words(C.after)].map((w, i) => (
              <span key={i} data-fly className={`${s.cFlyWord} ${w === C.accent ? s.cFlyAccent : ""}`}>
                {w}
              </span>
            ))}
          </div>
          <h3 className={s.cHead} data-final>
            <span className={s.cLine}>
              {words(C.before).map((w, i) => (
                <W key={i}>{w}</W>
              ))}
              <W className={s.cAccent}>{C.accent}</W>
            </span>
            <span className={s.cLoudWrap}>
              <span ref={loudRef} className={s.cLoud}>
                <W>{loud}</W>
              </span>
            </span>
            <span className={s.cLine}>
              {rest.map((w, i) => (
                <W key={i}>{w}</W>
              ))}
            </span>
          </h3>
          {C.sub && (
            <p className={`${s.grid} ${s.cSubRow}`}>
              <span className={`${s.cwMask} ${s.cSub}`}>
                <span data-cw className={s.cw}>
                  {C.sub}
                </span>
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
