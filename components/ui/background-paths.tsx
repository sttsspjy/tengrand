"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

/* Each path gets a hue offset across the spectrum.
   A slow hue-rotate on the wrapper continuously cycles all colours. */
export function FloatingPaths({
  position,
  inView = true,
}: {
  position: number;
  inView?: boolean;
}) {
  const paths = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    /* Spread hues across a 200° arc so adjacent paths differ visibly */
    hue: (180 + (i * 200) / 36) % 360,
  }));

  return (
    /* motion.div continuously rotates the hue of the whole layer */
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-visible"
      animate={{ filter: ["hue-rotate(0deg)", "hue-rotate(360deg)"] }}
      transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
    >
      <svg
        className="w-full h-full"
        viewBox="0 0 696 316"
        fill="none"
        overflow="visible"
        aria-hidden="true"
      >
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            /* Individual spectrum colour — hue-rotate animates all simultaneously */
            stroke={`hsl(${path.hue}, 80%, 62%)`}
            strokeWidth={path.width}
            strokeOpacity={0.15 + path.id * 0.025}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={
              inView
                ? {
                    pathLength: 1,
                    opacity: [0.3, 0.65, 0.3],
                    pathOffset: [0, 1, 0],
                  }
                : { pathLength: 0, opacity: 0 }
            }
            transition={{
              pathLength: {
                duration: 1.2 + path.id * 0.04,
                ease: "easeOut",
                delay: path.id * 0.025,
              },
              opacity: {
                duration: 20 + (path.id % 5) * 2,
                repeat: Infinity,
                ease: "linear",
                delay: 1.2 + path.id * 0.025,
              },
              pathOffset: {
                duration: 20 + (path.id % 5) * 2,
                repeat: Infinity,
                ease: "linear",
                delay: 1.2 + path.id * 0.025,
              },
            }}
          />
        ))}
      </svg>
    </motion.div>
  );
}

export function BackgroundPaths({ title = "Background Paths" }: { title?: string }) {
  const ref  = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const words  = title.split(" ");

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative min-h-screen w-full flex items-center justify-center overflow-x-hidden bg-white dark:bg-neutral-950"
    >
      <div className="absolute inset-0 overflow-visible">
        <FloatingPaths position={1}  inView={inView} />
        <FloatingPaths position={-1} inView={inView} />
      </div>

      <div className="relative z-10 container mx-auto px-4 md:px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl sm:text-7xl md:text-8xl font-bold mb-8 tracking-tighter">
            {words.map((word, wordIndex) => (
              <span key={wordIndex} className="inline-block mr-4 last:mr-0">
                {word.split("").map((letter, letterIndex) => (
                  <motion.span
                    key={`${wordIndex}-${letterIndex}`}
                    initial={{ y: 100, opacity: 0 }}
                    animate={inView ? { y: 0, opacity: 1 } : { y: 100, opacity: 0 }}
                    transition={{
                      delay: 0.3 + wordIndex * 0.1 + letterIndex * 0.03,
                      type: "spring",
                      stiffness: 150,
                      damping: 25,
                    }}
                    className="inline-block text-transparent bg-clip-text
                      bg-gradient-to-r from-neutral-900 to-neutral-700/80
                      dark:from-white dark:to-white/80"
                  >
                    {letter}
                  </motion.span>
                ))}
              </span>
            ))}
          </h2>
        </div>
      </div>
    </motion.div>
  );
}
