"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import { profile } from "@/content/profile";
import { intro, questions, score, worlds, type WorldId } from "@/content/quiz";
import { CAM_RESULT, WORLD_IDS, aim, createRig, oneHot, tally } from "./rig";
import s from "../gate.module.css";

const Sculpture = dynamic(() => import("./Sculpture"), { ssr: false });

// First frame of each world, so the flood hands over without a visible cut.
const FLOOD: Record<WorldId, string> = {
  monolith: "#eceae4",
  nocturne: "#000000",
  codex: "radial-gradient(ellipse 80% 70% at 50% 45%, #2e2822 0%, #17130f 75%)",
};

const RESULT = questions.length + 1; // step index of the result
const EASE = [0.16, 1, 0.3, 1] as const;
const INTERACTIVE = "a, button, h1, p, li";

const words: Variants = {
  hidden: { y: "108%" },
  show: (i: number) => ({ y: "0%", transition: { duration: 1.1, ease: EASE, delay: 0.08 + i * 0.035 } }),
};
const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE, delay: i } }),
};
const stepExit = { opacity: 0, y: -14, transition: { duration: 0.42, ease: [0.7, 0, 0.84, 0] as const } };

function Words({ text, delay = 0 }: { text: string; delay?: number }) {
  return text.split(" ").map((w, i, a) => (
    <Fragment key={i}>
      <span className={s.wm}>
        <motion.span className={s.w} variants={words} custom={i + delay}>
          {w}
        </motion.span>
      </span>
      {i < a.length - 1 ? " " : null}
    </Fragment>
  ));
}

export default function Gate() {
  const router = useRouter();
  const rigRef = useRef<ReturnType<typeof createRig>>(null);
  if (!rigRef.current) rigRef.current = createRig();
  const rig = rigRef.current;

  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const flood = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLParagraphElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<WorldId[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<WorldId | null>(null);
  const [touch, setTouch] = useState(false);
  const [shown, setShown] = useState(0); // step whose content is on screen (lags `step` during exit animations)
  const busy = useRef(false);

  const qi = step - 1;
  const inQuestion = step >= 1 && step <= questions.length;
  const winner = picks.length === questions.length ? score(picks) : null;

  // Under reduced motion, pose and camera changes snap behind a short crossfade of the stage.
  const apply = useCallback(
    (fn: () => void) => {
      if (!rig.reduced) return fn();
      stage.current?.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: 700, easing: "ease-in-out" });
      window.setTimeout(fn, 350);
    },
    [rig]
  );

  useEffect(() => {
    rig.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTouch(window.matchMedia("(hover: none)").matches);
  }, [rig]);

  // Intro: the sculpture cycles through the three forms.
  useEffect(() => {
    if (step !== 0 || rig.reduced) return;
    let k = 0;
    const id = window.setInterval(() => {
      k = (k + 1) % 3;
      aim(rig, oneHot(WORLD_IDS[k]), 1.3);
    }, 7200);
    return () => window.clearInterval(id);
  }, [step, rig]);

  // Camera key + blend target follow the step.
  useEffect(() => {
    if (step === 0) return;
    apply(() => {
      if (step === RESULT && winner) {
        rig.cam = CAM_RESULT + WORLD_IDS.indexOf(winner);
        aim(rig, oneHot(winner), 1.4);
      } else {
        rig.cam = step;
        aim(rig, tally(picks), 1.1);
      }
      rig.stamp++;
    });
  }, [step, picks, winner, rig, apply]);

  useEffect(() => {
    if (step === 0 && !leaving) {
      rig.cam = 0;
      rig.stamp++;
    }
  }, [step, leaving, rig]);

  useEffect(() => {
    if (step !== RESULT) return;
    for (const id of WORLD_IDS) router.prefetch(worlds[id].href);
  }, [step, router]);

  // Focus the new step's heading for keyboard and screen-reader users.
  useEffect(() => {
    if (step === 0) return;
    const t = window.setTimeout(() => headRef.current?.focus({ preventScroll: true }), 480);
    return () => window.clearTimeout(t);
  }, [step]);

  // Fits the huge result word to the viewport.
  useLayoutEffect(() => {
    if (step !== RESULT) return;
    const fit = () => {
      const el = valueRef.current;
      if (!el) return;
      el.style.fontSize = "100px";
      const w = el.scrollWidth;
      const max = Math.min((window.innerWidth * (window.innerWidth < 760 ? 0.9 : 0.8) * 100) / w, window.innerHeight * 0.36);
      el.style.fontSize = `${max.toFixed(1)}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [step]);

  const preview = useCallback(
    (j: number | null) => {
      if (!inQuestion || rig.reduced || busy.current) return;
      aim(rig, tally(picks, j === null ? null : questions[qi].answers[j].world), 0.55);
    },
    [inQuestion, rig, picks, qi]
  );

  const commit = useCallback(
    (j: number) => {
      if (!inQuestion || busy.current) return;
      busy.current = true;
      setChosen(j);
      const next = [...picks.slice(0, qi), questions[qi].answers[j].world];
      window.setTimeout(
        () => {
          setPicks(next);
          setStep(step + 1);
          setSel(null);
          setChosen(null);
          busy.current = false;
        },
        rig.reduced ? 120 : 380
      );
    },
    [inQuestion, picks, qi, step, rig]
  );

  const back = useCallback(() => {
    if (busy.current || step === 0) return;
    setSel(null);
    if (step === 1) {
      setPicks([]);
      setStep(0);
      apply(() => {
        aim(rig, oneHot("monolith"), 1.1);
        rig.cam = 0;
        rig.stamp++;
      });
      return;
    }
    setPicks((p) => p.slice(0, step - 2));
    setStep(step - 1);
  }, [step, rig, apply]);

  const begin = useCallback(() => {
    if (busy.current) return;
    setStep(1);
  }, []);

  const handoff = useCallback(
    (id: WorldId) => {
      if (busy.current) return;
      busy.current = true;
      setLeaving(id);
      const href = worlds[id].href;
      router.prefetch(href);
      const f = flood.current!;
      f.style.background = FLOOD[id];
      f.style.visibility = "visible";
      const go = () => router.push(href);
      if (rig.reduced) {
        f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease-out", fill: "forwards" }).onfinish = go;
        return;
      }
      aim(rig, oneHot(id), 0.5);
      rig.dive = true;
      rig.stamp++;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const cx = rig.out.cx >= 0 ? rig.out.cx : W / 2;
      const cy = rig.out.cy >= 0 ? rig.out.cy : H / 2;
      const r = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 4;
      f.style.opacity = "1";
      f.animate([{ clipPath: `circle(0px at ${cx}px ${cy}px)` }, { clipPath: `circle(${r}px at ${cx}px ${cy}px)` }], {
        duration: 1150,
        delay: 520,
        easing: "cubic-bezier(0.66, 0, 0.2, 1)",
        fill: "both",
      }).onfinish = go;
    },
    [rig, router]
  );

  const skip = useCallback(() => handoff(WORLD_IDS[Math.floor(Math.random() * 3)]), [handoff]);

  // Keyboard: 1/2/3 pick, Enter confirms; Enter also begins and enters.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leaving || e.metaKey || e.ctrlKey || e.altKey) return;
      const onControl = (document.activeElement as HTMLElement | null)?.closest("button, a");
      if (inQuestion && ["1", "2", "3"].includes(e.key)) {
        const j = Number(e.key) - 1;
        if (j < questions[qi].answers.length) {
          setSel(j);
          preview(j);
        }
        return;
      }
      if (e.key !== "Enter" || onControl) return;
      if (step === 0) begin();
      else if (inQuestion && sel !== null) commit(sel);
      else if (step === RESULT && winner) handoff(winner);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leaving, inQuestion, qi, step, sel, winner, begin, commit, handoff, preview]);

  // Pointer: drag on empty space to spin the sculpture; pointer position drives a light parallax.
  useEffect(() => {
    const el = root.current!;
    let down: { id: number; x: number; y: number; lx: number; type: string; drag: boolean } | null = null;
    const onMove = (e: PointerEvent) => {
      rig.px = (e.clientX / window.innerWidth) * 2 - 1;
      rig.py = (e.clientY / window.innerHeight) * 2 - 1;
      rig.stamp++;
      if (!down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!down.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        down.drag = true;
        rig.dragging = true;
        el.toggleAttribute("data-grabbing", true);
      }
      if (down.drag) rig.dragDX += e.clientX - down.lx;
      down.lx = e.clientX;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, type: e.pointerType, drag: false };
      if (e.pointerType === "mouse") e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId) return;
      down = null;
      rig.dragging = false;
      rig.stamp++;
      el.toggleAttribute("data-grabbing", false);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [rig]);

  const others = winner ? WORLD_IDS.filter((id) => id !== winner) : [];
  const hint = touch ? "Swipe to turn" : "Drag to turn";

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={root}
        className={s.page}
        data-step={step === 0 ? "intro" : step === RESULT ? "result" : "question"}
        data-leaving={leaving ? "" : undefined}
      >
        <div className={s.back} data-world={winner ?? undefined} aria-hidden="true">
          <AnimatePresence>
            {step === RESULT && winner && (
              <motion.p
                key={winner}
                ref={valueRef}
                className={s.value}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, transition: { duration: 0.4 } }}
              >
                {Array.from(worlds[winner].value).map((c, i) => (
                  <span key={i} className={s.vm}>
                    <motion.span
                      className={s.w}
                      variants={{
                        hidden: { y: "105%" },
                        show: { y: "0%", transition: { duration: 1.4, ease: EASE, delay: 0.5 + i * 0.07 } },
                      }}
                    >
                      {c}
                    </motion.span>
                  </span>
                ))}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div ref={stage} className={s.stage} aria-hidden="true">
          <Sculpture rig={rig} onReady={() => stage.current?.setAttribute("data-ready", "")} />
        </div>

        <div className={s.ui}>
          <header className={s.top}>
            <p className={s.name}>{profile.name}</p>
            {shown >= 1 && shown <= questions.length && (
              <p className={s.progress} aria-live="polite">
                {shown} / {questions.length}
              </p>
            )}
          </header>

          <main className={s.main}>
            <AnimatePresence mode="wait" initial={false} onExitComplete={() => setShown(step)}>
              {step === 0 && (
                <motion.section key="intro" className={`${s.step} ${s.intro}`} exit={stepExit} initial="hidden" animate="show">
                  <h1 className={s.title}>
                    {intro.title.split(" ").map((w, i, a) => (
                      <Fragment key={i}>
                        <span className={s.wm}>
                          <span className={`${s.w} ${s.cssWord}`} style={{ animationDelay: `${0.15 + i * 0.09}s` }}>
                            {w}
                          </span>
                        </span>
                        {i < a.length - 1 ? " " : null}
                      </Fragment>
                    ))}
                  </h1>
                  <p className={`${s.lede} ${s.cssRise}`} style={{ animationDelay: "0.55s" }}>
                    {intro.line}
                  </p>
                  <div className={`${s.actions} ${s.cssRise}`} style={{ animationDelay: "0.75s" }}>
                    <button type="button" className={s.big} onClick={begin}>
                      {intro.start}
                    </button>
                    <button type="button" className={s.small} onClick={skip}>
                      {intro.skip}
                    </button>
                  </div>
                </motion.section>
              )}

              {inQuestion && (
                <motion.section key={`q${qi}`} className={s.step} exit={stepExit} initial="hidden" animate="show">
                  <h1 ref={headRef} tabIndex={-1} className={s.question}>
                    <Words text={questions[qi].q} />
                  </h1>
                  <ol className={s.answers} data-chosen={chosen !== null ? "" : undefined}>
                    {questions[qi].answers.map((a, j) => (
                      <motion.li key={j} variants={rise} custom={0.45 + j * 0.09}>
                        <button
                          type="button"
                          className={s.answer}
                          data-sel={sel === j || chosen === j ? "" : undefined}
                          onClick={() => commit(j)}
                          onPointerEnter={(e) => e.pointerType === "mouse" && preview(j)}
                          onPointerLeave={(e) => e.pointerType === "mouse" && preview(sel)}
                          onFocus={() => {
                            setSel(j);
                            preview(j);
                          }}
                        >
                          <span className={s.num}>{j + 1}</span>
                          <span className={s.text}>{a.text}</span>
                        </button>
                      </motion.li>
                    ))}
                  </ol>
                </motion.section>
              )}

              {step === RESULT && winner && (
                <motion.section key="result" className={`${s.step} ${s.result}`} exit={stepExit} initial="hidden" animate="show">
                  <h1 ref={headRef} tabIndex={-1} className={s.resultHead}>
                    <motion.span className={s.label} variants={rise} custom={0.2}>
                      {intro.result}
                    </motion.span>
                    <span className={s.srOnly}>: </span>
                    <motion.span className={s.worldName} variants={rise} custom={0.3}>
                      {worlds[winner].name}
                    </motion.span>
                    <span className={s.srOnly}>, {worlds[winner].value}</span>
                  </h1>
                  <div className={s.resultFoot}>
                    <motion.p className={s.line} variants={rise} custom={1.3}>
                      {worlds[winner].line}
                    </motion.p>
                    <motion.div className={s.resultActions} variants={rise} custom={1.5}>
                      <button type="button" className={s.big} onClick={() => handoff(winner)}>
                        {intro.enter}
                      </button>
                      <p className={s.others}>
                        <span>{intro.others}</span>{" "}
                        {others.map((id, k) => (
                          <span key={id}>
                            <a
                              href={worlds[id].href}
                              className={s.small}
                              onClick={(e) => {
                                e.preventDefault();
                                handoff(id);
                              }}
                            >
                              {worlds[id].name}
                            </a>
                            {k === 0 ? " " : null}
                          </span>
                        ))}
                      </p>
                    </motion.div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </main>

          <footer className={s.bottom}>
            {step > 0 ? (
              <button type="button" className={s.small} onClick={back}>
                Back
              </button>
            ) : (
              <span />
            )}
            <p className={s.hint} aria-hidden="true">
              {hint}
            </p>
          </footer>
        </div>

        <div ref={flood} className={s.flood} aria-hidden="true" />
      </div>
    </MotionConfig>
  );
}
