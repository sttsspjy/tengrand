"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { FloatingPaths } from "@/components/ui/background-paths";
import { LampContainer } from "@/components/ui/lamp";
import { WebGLShader } from "@/components/ui/web-gl-shader";
import { Boxes } from "@/components/ui/background-boxes";
import { ShaderScene } from "@/components/ui/background-paper-shaders";
import { GLSLHills } from "@/components/ui/glsl-hills";


/* ─── design constants ─── */
const EASE = [0.16, 1, 0.3, 1] as const;

/* ─── Cursor (desktop only) ─── */
function Cursor() {
  const curRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let cx = 0, cy = 0, rx = 0, ry = 0, rafId = 0;
    let hover = false;

    const onMove = (e: MouseEvent) => { cx = e.clientX; cy = e.clientY; };
    document.addEventListener("mousemove", onMove, { passive: true });

    const hoverEls = () =>
      document.querySelectorAll("a, button, .card-hover, .tag-hover");

    const onEnter = () => {
      hover = true;
      curRef.current?.classList.add("is-hover");
      ringRef.current?.classList.add("is-hover");
    };
    const onLeave = () => {
      hover = false;
      curRef.current?.classList.remove("is-hover");
      ringRef.current?.classList.remove("is-hover");
    };

    // Attach after paint so all elements are mounted
    const tick = () => {
      if (curRef.current) {
        curRef.current.style.left = cx + "px";
        curRef.current.style.top  = cy + "px";
      }
      rx += (cx - rx) * 0.11;
      ry += (cy - ry) * 0.11;
      if (ringRef.current) {
        ringRef.current.style.left = rx + "px";
        ringRef.current.style.top  = ry + "px";
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const attachHover = () =>
      hoverEls().forEach(el => {
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("mouseleave", onLeave);
      });

    const obs = new MutationObserver(attachHover);
    obs.observe(document.body, { childList: true, subtree: true });
    attachHover();

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMove);
      obs.disconnect();
    };
  }, []);

  return (
    <>
      <div
        ref={curRef}
        aria-hidden="true"
        className="fixed pointer-events-none z-[9999] w-2.5 h-2.5 rounded-full
          bg-[#4A7CFF] mix-blend-screen -translate-x-1/2 -translate-y-1/2
          transition-[width,height,background] duration-300 ease-out
          [&.is-hover]:w-1.5 [&.is-hover]:h-1.5 [&.is-hover]:bg-[#8B5CF6]
          hidden md:block"
      />
      <div
        ref={ringRef}
        aria-hidden="true"
        className="fixed pointer-events-none z-[9998] w-10 h-10 rounded-full
          border border-[rgba(74,124,255,0.35)] -translate-x-1/2 -translate-y-1/2
          transition-[width,height,border-color] duration-500 ease-out
          [&.is-hover]:w-14 [&.is-hover]:h-14 [&.is-hover]:border-[rgba(139,92,246,0.5)]
          hidden md:block"
      />
    </>
  );
}

/* ─── Nav ─── */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between
        px-8 py-6 transition-all duration-500
        ${scrolled ? "bg-[rgba(5,5,8,0.78)] backdrop-blur-[16px] border-b border-white/[0.06]" : ""}`}
    >
      <a
        href="#hero"
        className="font-[family-name:var(--font-bodoni)] text-2xl font-semibold
          text-[#F0EEE8] no-underline tracking-wide"
        aria-label="Jaeyoung — home"
      >
        J.
      </a>
      <ul className="flex gap-10 list-none" role="list">
        {["About", "Work", "Contact"].map(s => (
          <li key={s}>
            <a
              href={`#${s.toLowerCase()}`}
              className="font-[family-name:var(--font-mono)] text-[0.68rem]
                text-[rgba(240,238,232,0.45)] no-underline uppercase tracking-[0.12em]
                hover:text-[#F0EEE8] transition-colors duration-200
                focus-visible:outline-2 focus-visible:outline-[#4A7CFF] focus-visible:outline-offset-4 focus-visible:rounded-sm"
            >
              {s}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ─── Hero ─── */
function Hero() {
  const chars = "Jaeyoung".split("");

  return (
    <section
      id="hero"
      className="relative w-full min-h-dvh flex flex-col justify-end
        px-8 pb-20 overflow-x-hidden bg-[#050508]"
      aria-label="Introduction"
    >
      {/* WebGL shader background */}
      <WebGLShader className="absolute inset-0 w-full h-full block" speed={0.001} />

      {/* Subtle dark vignette so left-side text pops */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 20% 80%, rgba(5,5,8,0.7) 0%, transparent 100%)",
        }}
        aria-hidden="true"
      />

      {/* Content — left-aligned */}
      <div className="relative z-10 pl-24">
        <motion.p
          className="font-[family-name:var(--font-mono)] text-[0.63rem]
            text-[rgba(240,238,232,0.3)] uppercase tracking-[0.22em] mb-5"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        >
          001 &nbsp;/&nbsp; Portfolio
        </motion.p>

        <h1
          className="font-[family-name:var(--font-volstead)] font-normal italic
            text-[clamp(6rem,18vw,17rem)] leading-[0.92] tracking-[-0.01em]
            text-[#F0EEE8] pb-2 block"
          aria-label="Jaeyoung"
        >
          {chars.map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ y: "115%", rotate: 6, opacity: 0 }}
              animate={{ y: 0, rotate: 0, opacity: 1 }}
              transition={{
                delay: 0.38 + i * 0.055,
                type: "spring",
                stiffness: 100,
                damping: 18,
              }}
            >
              {ch}
            </motion.span>
          ))}
        </h1>
      </div>

      {/* Bottom section fade */}
      <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-20 bg-gradient-to-b from-transparent to-[#050508]" aria-hidden="true" />

      {/* Bottom bar */}
      <div
        className="relative z-10 flex items-end justify-between mt-14"
        aria-hidden="true"
      >
        <div />
        <motion.div
          className="font-[family-name:var(--font-mono)] text-[0.6rem]
            text-[rgba(240,238,232,0.3)] tracking-[0.12em] text-right leading-[1.9]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.12, duration: 0.7 }}
        >
          Based in Korea<br />Available worldwide
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Section reveal wrapper ─── */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.12 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Scroll-driven section wrapper ─── */
function ScrollSection({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // 0 = top at viewport bottom (entering)
  // ~0.5 = centered in viewport
  // 1 = bottom at viewport top (leaving)
  const opacity = useTransform(scrollYProgress, [0.05, 0.45, 0.55, 0.95], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [0.05, 0.45, 0.55, 0.95], [120, 0, 0, -120]);

  return (
    <div ref={ref} id={id}>
      <motion.div style={{ opacity, y, transition: "none" }}>
        {children}
      </motion.div>
    </div>
  );
}

/* ─── Starry Night reveal word ─── */
function RevealWord({ children }: { children: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const REVEAL_RADIUS = 160;

    const handleMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const relX = e.clientX - r.left;
      const relY = e.clientY - r.top;
      const pctX = (relX / r.width) * 100;
      const pctY = (relY / r.height) * 100;

      const closestX = Math.max(0, Math.min(relX, r.width));
      const closestY = Math.max(0, Math.min(relY, r.height));
      const distToEdge = Math.sqrt(
        (relX - closestX) ** 2 + (relY - closestY) ** 2
      );

      if (distToEdge < REVEAL_RADIUS) {
        el.style.setProperty("--reveal-x", `${pctX}%`);
        el.style.setProperty("--reveal-y", `${pctY}%`);
        el.style.setProperty("--reveal-r", `${REVEAL_RADIUS}px`);
        el.classList.add("is-revealing");
      } else {
        el.classList.remove("is-revealing");
      }
    };

    const handleLeave = () => {
      el.classList.remove("is-revealing");
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <span className="reveal-word-wrap">
      <em ref={ref} className="not-italic reveal-word">
        {children}
      </em>
    </span>
  );
}

/* ─── About ─── */
function About() {
  return (
    <section aria-labelledby="about-title">
      {/* ── Lamp header ── */}
      <LampContainer>
        <div className="text-center px-4">
          <p
            className="font-[family-name:var(--font-mono)] text-[0.6rem]
              text-[rgba(240,238,232,0.22)] uppercase tracking-[0.22em] mb-6"
            aria-hidden="true"
          >
            002 &nbsp;/&nbsp; About
          </p>
          <h2
            id="about-title"
            className="font-[family-name:var(--font-bodoni)] font-light
              text-[clamp(3.5rem,8vw,7rem)] leading-[1.0] tracking-[-0.025em]
              text-[#F0EEE8]"
          >
            The Story
          </h2>
          <p
            className="font-[family-name:var(--font-bodoni)] font-light italic
              text-[clamp(1rem,2vw,1.4rem)] text-[rgba(240,238,232,0.45)]
              mt-4 tracking-[0.02em]"
          >
            I build things strike my mind.
          </p>
        </div>
      </LampContainer>

      {/* ── Body content ── */}
      <div className="relative bg-[#050508] overflow-hidden">
        {/* Bottom section fade */}
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-20 bg-gradient-to-b from-transparent to-[#050508]" aria-hidden="true" />
        {/* Subtle radial glow background */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(139,92,246,0.06), transparent 70%)" }}
        />

        <div className="relative z-10 max-w-[1380px] mx-auto px-8 py-24">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.6fr] gap-16 md:gap-24">
            <Reveal delay={0.05}>
              <p
                className="font-[family-name:var(--font-mono)] text-[0.6rem]
                  text-[rgba(240,238,232,0.22)] uppercase tracking-[0.18em] leading-[2]"
                aria-hidden="true"
              >
                Vibecoder<br />
                AI-Native Builder<br />
                Korea&nbsp;/&nbsp;Remote<br />
                2026
              </p>
            </Reveal>

            <div>
              <Reveal delay={0.1}>
                <div className="text-[1.1rem] leading-[1.85] text-[rgba(240,238,232,0.45)]">
                  <p>
                    I&apos;m a <strong className="text-[#F0EEE8] font-medium">vibecoder</strong> —
                    someone who doesn&apos;t just write code, but orchestrates AI to build full
                    products at a pace that shouldn&apos;t be possible. What teams spend weeks on,
                    I ship in days.
                  </p>
                  <p className="mt-6">
                    My workflow lives at the intersection of{" "}
                    <strong className="text-[#F0EEE8] font-medium">design intuition</strong> and{" "}
                    <strong className="text-[#F0EEE8] font-medium">AI-native engineering</strong>.
                    I treat Claude, GPT, and other models as creative collaborators, not autocomplete
                    tools. The result is software that feels expensive — and moves fast.
                  </p>
                  <p className="mt-6">
                    I obsess over the details that make digital products feel{" "}
                    <strong className="text-[#F0EEE8] font-medium">alive</strong>: the easing curve
                    of a transition, the weight of a typeface at 3am, the silence between interactions.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={0.18}>
                <div className="flex flex-wrap gap-2 mt-10" aria-label="Skills and tools">
                  {[
                    "Claude API","Next.js","TypeScript","Python",
                    "WebGL","GSAP","Figma","Vercel","Supabase","Replicate",
                  ].map(tag => (
                    <span
                      key={tag}
                      className="pointer-events-auto tag-hover font-[family-name:var(--font-mono)] text-[0.62rem]
                        text-[#4A7CFF] border border-[rgba(74,124,255,0.18)] rounded-[2px]
                        px-3 py-1.5 uppercase tracking-[0.1em]
                        hover:border-[rgba(74,124,255,0.45)] hover:bg-[rgba(74,124,255,0.05)]
                        transition-all duration-200 cursor-default"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Craft ─── */
function CraftInteractions() {
  return (
      <div className="relative min-h-screen overflow-hidden bg-[#03030A] flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          <Boxes />
        </div>
        {/* Radial vignette to soften grid edges */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 75% 65% at 50% 50%, transparent 25%, #03030A 100%)" }}
          aria-hidden="true"
        />
        <div className="relative z-20 text-center px-8 max-w-4xl">
          <Reveal>
            <p
              className="font-[family-name:var(--font-mono)] text-[0.6rem]
                text-[rgba(240,238,232,0.22)] uppercase tracking-[0.22em] mb-6"
              aria-hidden="true"
            >
              003 &nbsp;/&nbsp; Craft
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              className="font-[family-name:var(--font-bodoni)] font-light
                text-[clamp(2.8rem,7vw,6.5rem)] leading-[1.06] tracking-[-0.02em] text-[#F0EEE8]"
            >
              <span className="interact-word inline-block">{"Interactions".split("").map((c, i) => <span key={i}>{c}</span>)}</span> that<br />
              feel{" "}
              <em className="italic flowing-gradient">
                alive.
              </em>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p
              className="font-[family-name:var(--font-mono)] text-[0.63rem]
                text-[rgba(240,238,232,0.28)] uppercase tracking-[0.18em] mt-8"
            >
              hover anywhere
            </p>
          </Reveal>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-30 bg-gradient-to-b from-transparent to-[#050508]" aria-hidden="true" />
      </div>
  );
}

function CraftMotion() {
  return (
      <div className="relative min-h-screen overflow-hidden bg-[#050508] flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          <ShaderScene className="w-full h-full" />
        </div>
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 15%, rgba(5,5,8,0.55) 100%)" }}
          aria-hidden="true"
        />
        <div className="relative z-20 text-center px-8 max-w-4xl">
          <Reveal delay={0.05}>
            <h2
              className="font-[family-name:var(--font-bodoni)] font-light
                text-[clamp(2.8rem,7vw,6.5rem)] leading-[1.06] tracking-[-0.02em] text-[#F0EEE8]"
            >
              <span className="wave-word inline-block">{"Motion".split("").map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.07}s` }}>{c}</span>)}</span> is<br />
              the{" "}
              <em className="italic flowing-gradient">
                message.
              </em>
            </h2>
          </Reveal>
          <Reveal delay={0.13}>
            <p
              className="font-[family-name:var(--font-bodoni)] font-light italic
                text-[clamp(0.9rem,1.8vw,1.3rem)] text-[rgba(240,238,232,0.38)] mt-6 tracking-[0.02em]"
            >
              Together, we breathe.
            </p>
          </Reveal>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-30 bg-gradient-to-b from-transparent to-[#050508]" aria-hidden="true" />
      </div>
  );
}

function CraftDesigns() {
  return (
      <div className="relative min-h-screen overflow-hidden bg-[#050508] flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          <GLSLHills width="100%" height="100%" speed={0.4} />
        </div>
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 20%, rgba(5,5,8,0.5) 100%)" }}
          aria-hidden="true"
        />
        <div className="relative z-20 text-center px-8 max-w-5xl">
          <Reveal delay={0.05}>
            <h2
              className="font-[family-name:var(--font-bodoni)] font-light
                text-[clamp(2.8rem,7vw,6.5rem)] leading-[1.06] tracking-[-0.02em] text-[#F0EEE8]"
            >
              <RevealWord>Designs</RevealWord> that{" "}
              <em className="italic flowing-gradient">
                speak
              </em>
              <br />louder than words.
            </h2>
          </Reveal>
          <Reveal delay={0.13}>
            <p
              className="font-[family-name:var(--font-bodoni)] font-light italic
                text-[clamp(0.9rem,1.8vw,1.3rem)] text-[rgba(240,238,232,0.38)] mt-6 tracking-[0.02em]"
            >
              Built with precision. Felt with intention.
            </p>
          </Reveal>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-30 bg-gradient-to-b from-transparent to-[#050508]" aria-hidden="true" />
      </div>
  );
}

/* ─── Work ─── */
const PROJECTS = [
  {
    num: "001",
    name: "Home.app",
    desc: "A task management app built for clarity. Organize projects, track progress, and stay focused — designed for people who want their tools to stay out of the way.",
    tech: ["Next.js", "React", "Vercel"],
    link: "https://jyhome.vercel.app",
  },
  {
    num: "002",
    name: "FlowState",
    desc: "A productivity OS for solo makers. Voice-to-task AI with ambient mode — speak your thoughts, get structured projects. Designed for people who ship alone.",
    tech: ["React", "Whisper", "Supabase", "GPT-4o"],
  },
  {
    num: "003",
    name: "Meridian",
    desc: "Real-time data intelligence platform. LLM-powered insight extraction over live streams, rendered as cinematic WebGL visualizations for the analyst who thinks visually.",
    tech: ["Three.js", "Python", "WebSockets", "Claude"],
  },
];

function Work() {
  return (
    <section
      className="relative"
      aria-labelledby="work-title"
    >
      <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-10 bg-gradient-to-b from-transparent to-[#050508]" aria-hidden="true" />
      <div className="max-w-[1380px] mx-auto px-8 py-32">
        <Reveal>
          <div className="font-[family-name:var(--font-mono)] text-[0.6rem]
            text-[rgba(240,238,232,0.22)] uppercase tracking-[0.22em]
            flex items-center gap-4 mb-3" aria-hidden="true">
            004
            <span className="block w-9 h-px bg-white/[0.11]" />
          </div>
        </Reveal>

        <Reveal delay={0.07}>
          <h2
            id="work-title"
            className="font-[family-name:var(--font-bodoni)] font-light
              text-[clamp(2.8rem,6.5vw,5.5rem)] leading-[1.06] tracking-[-0.02em]
              text-[#F0EEE8] mb-14"
          >
            Selected Work
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PROJECTS.map((p, i) => (
            <ProjectCard key={p.num} project={p} delay={i * 0.08} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectCard({
  project,
  delay,
}: {
  project: (typeof PROJECTS)[number];
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const [mouse, setMouse] = useState({ x: 50, y: 50 });

  const card = (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 36 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.75, ease: EASE, delay }}
      whileHover={{ y: -5, transition: { duration: 0.35 } }}
      onMouseMove={e => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setMouse({
          x: ((e.clientX - r.left) / r.width) * 100,
          y: ((e.clientY - r.top) / r.height) * 100,
        });
      }}
      tabIndex={project.link ? undefined : 0}
      role="article"
      aria-label={`${project.name} project`}
      className="card-hover relative bg-[#080810] border border-white/[0.06]
        rounded-[3px] p-10 overflow-hidden cursor-pointer
        hover:border-white/[0.11] hover:shadow-[0_24px_60px_rgba(0,0,0,0.5)]
        transition-[border-color,box-shadow] duration-350
        focus-visible:outline-2 focus-visible:outline-[#4A7CFF] focus-visible:outline-offset-2"
      style={
        {
          "--mx": `${mouse.x}%`,
          "--my": `${mouse.y}%`,
        } as React.CSSProperties
      }
    >
      {/* Glow on hover */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-0 hover:opacity-100
          transition-opacity duration-400 pointer-events-none
          [background:radial-gradient(circle_at_var(--mx,50%)_var(--my,50%),rgba(74,124,255,0.18),transparent_65%)]"
      />

      {/* Top accent bar */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 right-0 h-[2px]
          bg-gradient-to-r from-[#4A7CFF] to-[#8B5CF6]
          scale-x-0 origin-left group-hover:scale-x-100
          transition-transform duration-400 ease-out"
      />

      <p className="font-[family-name:var(--font-mono)] text-[0.6rem]
        text-[rgba(240,238,232,0.22)] tracking-[0.15em] mb-8" aria-hidden="true">
        {project.num}
      </p>

      <h3 className="font-[family-name:var(--font-bodoni)] text-[1.9rem]
        font-normal leading-[1.1] text-[#F0EEE8] mb-4">
        {project.name}
      </h3>

      <p className="text-[0.875rem] leading-[1.75]
        text-[rgba(240,238,232,0.45)] mb-8">
        {project.desc}
      </p>

      <div
        className="flex flex-wrap"
        aria-label={`Technologies: ${project.tech.join(", ")}`}
      >
        {project.tech.map((t, i) => (
          <span
            key={t}
            className="font-[family-name:var(--font-mono)] text-[0.6rem]
              text-[rgba(240,238,232,0.22)] tracking-[0.08em]
              after:content-['_/'] after:mx-1 last:after:content-none"
          >
            {t}
          </span>
        ))}
      </div>

      {/* Arrow */}
      <div
        aria-hidden="true"
        className="absolute bottom-10 right-10 w-9 h-9 rounded-full
          border border-white/[0.06] flex items-center justify-center
          group-hover:border-[#4A7CFF] group-hover:rotate-45
          transition-all duration-300"
      >
        <svg
          width="13" height="13" viewBox="0 0 24 24"
          fill="none" stroke="rgba(240,238,232,0.45)"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </div>
    </motion.article>
  );

  if (project.link) {
    return (
      <a href={project.link} target="_blank" rel="noopener noreferrer" className="block no-underline">
        {card}
      </a>
    );
  }

  return card;
}

/* ─── Contact ─── */
function Contact() {
  return (
    <section
      className="relative min-h-screen overflow-hidden"
      aria-labelledby="contact-title"
    >
      {/* FloatingPaths background — both directions */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      {/* Top section fade */}
      <div className="absolute top-0 left-0 right-0 h-48 pointer-events-none z-10 bg-gradient-to-t from-transparent to-[#050508]" aria-hidden="true" />

      {/* Gradient overlay keeps text readable */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(5, 5, 8, 0) 0%, rgba(5, 5, 8, 0.16) 50%, rgba(5, 5, 8, 0.3) 100%)" }}
        aria-hidden="true"
      />

      {/* Content centred over the shader */}
      <div className="relative z-20 flex flex-col items-center justify-center
        min-h-screen text-center px-8">

        <Reveal>
          <p className="font-[family-name:var(--font-mono)] text-[0.6rem]
            text-[rgba(240,238,232,0.5)] uppercase tracking-[0.22em] mb-8">
            005 &nbsp;/&nbsp; Contact
          </p>
        </Reveal>

        <Reveal delay={0.07}>
          <h2
            id="contact-title"
            className="font-[family-name:var(--font-bodoni)] font-light italic
              text-[clamp(2.8rem,8vw,7rem)] leading-[1.06] text-[#F0EEE8] mb-12
              drop-shadow-[0_0_60px_rgba(255,255,255,0.06)]"
          >
            Let&apos;s build<br />
            something{" "}
            <em
              className="not-italic bg-gradient-to-r from-[#4A7CFF] to-[#8B5CF6]
                bg-clip-text text-transparent"
            >
              special.
            </em>
          </h2>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="flex items-center justify-center gap-5 flex-wrap">
            <a
              href="https://github.com/sttsspjy"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub profile (opens in new tab)"
              className="font-[family-name:var(--font-mono)] text-[0.72rem]
                text-[rgba(240,238,232,0.7)] no-underline inline-flex items-center
                gap-2.5 px-7 py-3.5 rounded-[2px] min-h-[44px]
                border border-white/[0.2] backdrop-blur-sm bg-black/25
                hover:text-white hover:border-white/[0.4] hover:bg-black/45
                transition-all duration-300
                focus-visible:outline-2 focus-visible:outline-[#4A7CFF] focus-visible:outline-offset-4"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61
                  c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77
                  5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0
                  C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0
                  0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              GitHub
            </a>

            <a
              href="mailto:fjlllb111@gmail.com"
              aria-label="Send an email"
              className="font-[family-name:var(--font-mono)] text-[0.72rem]
                text-[rgba(240,238,232,0.7)] no-underline inline-flex items-center
                gap-2.5 px-7 py-3.5 rounded-[2px] min-h-[44px]
                border border-white/[0.2] backdrop-blur-sm bg-black/25
                hover:text-white hover:border-white/[0.4] hover:bg-black/45
                transition-all duration-300
                focus-visible:outline-2 focus-visible:outline-[#4A7CFF] focus-visible:outline-offset-4"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Get in touch
            </a>
          </div>
        </Reveal>

      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer
      role="contentinfo"
      className="px-8 py-8"
    >
      <div className="max-w-[1380px] mx-auto flex items-center justify-between
        flex-wrap gap-3">
        <span className="font-[family-name:var(--font-mono)] text-[0.6rem]
          text-[rgba(240,238,232,0.22)] tracking-[0.1em]">
          © 2026 Jaeyoung
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[0.6rem]
          text-[rgba(240,238,232,0.22)] tracking-[0.1em]">
          Built with AI. Finished with taste.
        </span>
      </div>
    </footer>
  );
}

/* ─── Dot Navigation ─── */
const SECTIONS = ["hero", "about", "craft-1", "craft-2", "craft-3", "work", "contact"] as const;

function DotNav() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = SECTIONS.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    const update = () => {
      const mid = window.innerHeight / 2;
      let closest = 0;
      let minDist = Infinity;
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - mid);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });
      setActive(closest);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <nav
      aria-label="Page sections"
      className="fixed right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-1"
    >
      {SECTIONS.map((id, i) => (
        <a
          key={id}
          href={`#${id}`}
          aria-label={id.charAt(0).toUpperCase() + id.slice(1).replace("-", " ")}
          className="flex items-center justify-center w-8 h-8"
        >
          <span
            className={`block rounded-full transition-all duration-300 ${
              active === i
                ? "w-2.5 h-2.5 bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                : "w-1.5 h-1.5 bg-white/25 hover:bg-white/50"
            }`}
          />
        </a>
      ))}
    </nav>
  );
}

/* ─── Page ─── */
export default function Page() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Cursor />
      <Nav />
      <DotNav />

      <main id="main">
        {/* 1 — Hero */}
        <Hero />

        {/* 2 — About */}
        <ScrollSection id="about">
          <About />
        </ScrollSection>

        {/* 3 — Craft */}
        <ScrollSection id="craft-1">
          <CraftInteractions />
        </ScrollSection>
        <ScrollSection id="craft-2">
          <CraftMotion />
        </ScrollSection>
        <ScrollSection id="craft-3">
          <CraftDesigns />
        </ScrollSection>

        {/* 4 — Work */}
        <ScrollSection id="work">
          <Work />
        </ScrollSection>

        {/* 5 — Contact */}
        <ScrollSection id="contact">
          <Contact />
        </ScrollSection>
      </main>

      <Footer />
    </>
  );
}
