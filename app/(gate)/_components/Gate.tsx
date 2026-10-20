"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import { profile } from "@/content/profile";
import { WORLD_COOKIE, intro, questions, score, worlds, type WorldId } from "@/content/quiz";
import { BLADES_AT, CONTRACT, EXIT_MS, WORLD_IDS, createRig, lightsFor, tally } from "./rig";
import s from "../gate.module.css";

const Trine = dynamic(() => import("./Trine"), { ssr: false });

const RESULT = questions.length + 1; // step index of the result
const EASE = [0.16, 1, 0.3, 1] as const;
const INTERACTIVE = "a, button, h1, h2, p, li";
const LETTER: Record<WorldId, string> = { monolith: "M", nocturne: "N", codex: "C" };
const BLADES = 12;

const words: Variants = {
  hidden: { y: "110%" },
  show: (i: number) => ({ y: "0%", transition: { duration: 1.05, ease: EASE, delay: 0.06 + i * 0.03 } }),
};
const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE, delay: i } }),
};
const stepExit = { opacity: 0, y: -10, transition: { duration: 0.36, ease: [0.7, 0, 0.84, 0] as const } };

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
  const cover = useRef<HTMLDivElement>(null);
  const blades = useRef<HTMLDivElement>(null);
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

  // Under reduced motion, scene changes snap behind a short crossfade of the stage.
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
    const q = new URLSearchParams(window.location.search);
    if (q.has("debug")) rig.slow = Number(q.get("slow")) || 1;
    setTouch(window.matchMedia("(hover: none)").matches);
    rig.wake();
  }, [rig]);

  // Scene follows the step: camera key, object pose and the tally's light balance.
  const mounted = useRef(false);
  useEffect(() => {
    const run = mounted.current ? apply : (fn: () => void) => fn();
    mounted.current = true;
    run(() => {
      rig.step = step;
      rig.winner = step === RESULT ? winner : null;
      rig.lights = lightsFor(tally(picks));
      rig.wake();
    });
  }, [step, picks, winner, rig, apply]);

  // Focus the new step's heading for keyboard and screen-reader users.
  useEffect(() => {
    if (step === 0) return;
    const t = window.setTimeout(() => headRef.current?.focus({ preventScroll: true }), 480);
    return () => window.clearTimeout(t);
  }, [step]);

  const preview = useCallback(
    (j: number | null) => {
      if (!inQuestion || busy.current) return;
      rig.lights = lightsFor(tally(picks, j === null ? null : questions[qi].answers[j].world));
      rig.wake();
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
      return;
    }
    setPicks((p) => p.slice(0, step - 2));
    setStep(step - 1);
  }, [step]);

  const begin = useCallback(() => {
    if (busy.current) return;
    setStep(1);
  }, []);

  const handoff = useCallback(
    (id: WorldId) => {
      if (busy.current) return;
      busy.current = true;
      setLeaving(id);
      const c = cover.current!;
      c.style.background = CONTRACT[id];
      // Full contract colour is up: flag the world's arrival, set the session cookie, swap the tree in place.
      const finish = () => {
        c.style.visibility = "visible";
        c.style.opacity = "1";
        document.documentElement.dataset.entry = id;
        document.cookie = `${WORLD_COOKIE}=${id}; path=/; samesite=lax`;
        router.refresh();
      };
      if (rig.reduced || (id !== "monolith" && !rig.out.gl)) {
        c.style.visibility = "visible";
        c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease-out", fill: "forwards" }).onfinish = finish;
        return;
      }
      rig.exit = { id, t0: performance.now() };
      rig.wake();
      if (id === "monolith") {
        const bs = Array.from(blades.current!.children) as HTMLElement[];
        bs.forEach((b, i) =>
          b.animate([{ transform: "translateY(-101%)" }, { transform: "translateY(0)" }], {
            duration: 270 * rig.slow,
            delay: (BLADES_AT + i * 24) * rig.slow,
            easing: "cubic-bezier(0.95, 0.05, 0.795, 0.035)",
            fill: "both",
          })
        );
      }
      window.setTimeout(finish, EXIT_MS[id] * rig.slow);
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

  // Pointer: drag on empty space turns the solid; pointer position drives a slight camera parallax.
  useEffect(() => {
    const el = root.current!;
    let down: { id: number; x: number; y: number; lx: number; drag: boolean } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        rig.px = (e.clientX / window.innerWidth) * 2 - 1;
        rig.py = (e.clientY / window.innerHeight) * 2 - 1;
        rig.wake();
      }
      if (!down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!down.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        down.drag = true;
        rig.dragging = true;
        el.toggleAttribute("data-grabbing", true);
      }
      if (down.drag) {
        rig.dragDX += e.clientX - down.lx;
        rig.wake();
      }
      down.lx = e.clientX;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, drag: false };
      if (e.pointerType === "mouse") e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId) return;
      down = null;
      rig.dragging = false;
      rig.wake();
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
  const titleWords = intro.title.split(" ");

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={root}
        className={s.page}
        data-step={step === 0 ? "intro" : step === RESULT ? "result" : "question"}
        data-world={step === RESULT && winner ? winner : undefined}
        data-leaving={leaving ? "" : undefined}
      >
        <div className={s.poster} aria-hidden="true" />
        <div ref={stage} className={s.stageWrap}>
          <Trine rig={rig} />
        </div>

        <div className={s.ui}>
          <header className={s.top}>
            <p className={s.name}>{profile.name}</p>
            {shown >= 1 && shown <= questions.length && (
              <p className={s.progress} aria-live="polite">
                <span className={s.progNow}>{shown}</span>
                <span className={s.progSep}> / </span>
                {questions.length}
              </p>
            )}
          </header>

          <main className={s.main}>
            <AnimatePresence mode="wait" initial={false} onExitComplete={() => setShown(step)}>
              {step === 0 && (
                <motion.section key="intro" className={`${s.step} ${s.intro}`} exit={stepExit} initial="hidden" animate="show">
                  <h1 className={s.title}>
                    {titleWords.map((w, i) => (
                      <Fragment key={i}>
                        <span className={s.wm}>
                          <span
                            className={`${s.w} ${s.cssWord} ${i >= titleWords.length - 2 ? s.titleItal : ""}`}
                            style={{ animationDelay: `${0.25 + i * 0.08}s` }}
                          >
                            {w}
                          </span>
                        </span>
                        {i < titleWords.length - 1 ? " " : null}
                      </Fragment>
                    ))}
                  </h1>
                  <p className={`${s.lede} ${s.cssRise}`} style={{ animationDelay: "0.75s" }}>
                    {intro.line}
                  </p>
                  <div className={`${s.actions} ${s.cssRise}`} style={{ animationDelay: "0.95s" }}>
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
                      <motion.li key={j} variants={rise} custom={0.4 + j * 0.08}>
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
                    <motion.span className={s.label} variants={rise} custom={0.5}>
                      {intro.result}
                    </motion.span>
                    <span className={s.srOnly}>: </span>
                    <motion.span className={s.worldName} variants={rise} custom={0.62}>
                      <span className={s.letter} aria-hidden="true">
                        {LETTER[winner]}
                      </span>
                      {worlds[winner].name}
                    </motion.span>
                    <span className={s.srOnly}>, </span>
                    <span className={s.value}>
                      <span className={s.vm}>
                        <motion.span
                          className={s.w}
                          variants={{
                            hidden: { y: "105%" },
                            show: { y: "0%", transition: { duration: 1.4, ease: EASE, delay: 0.9 } },
                          }}
                        >
                          {worlds[winner].value}
                        </motion.span>
                      </span>
                    </span>
                  </h1>
                  <div className={s.resultSide}>
                    <motion.p className={s.line} variants={rise} custom={1.5}>
                      {worlds[winner].line}
                    </motion.p>
                    <motion.div className={s.resultActions} variants={rise} custom={1.7}>
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
              <p className={s.key} aria-hidden="true">
                {WORLD_IDS.map((id) => (
                  <span key={id}>
                    <b>{LETTER[id]}</b> {worlds[id].name}
                  </span>
                ))}
              </p>
            )}
            <p className={s.hint} aria-hidden="true">
              {hint}
            </p>
          </footer>
        </div>

        <div ref={blades} className={s.blades} aria-hidden="true">
          {Array.from({ length: BLADES }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <div ref={cover} className={s.cover} aria-hidden="true" />
      </div>
    </MotionConfig>
  );
}
