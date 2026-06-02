"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ── LiquidButton ── */
const liquidbuttonVariants = cva(
  "inline-flex items-center transition-colors justify-center cursor-pointer gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "bg-transparent hover:scale-105 duration-300 transition text-primary",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:  "h-8 text-xs gap-1.5 px-4",
        lg:  "h-10 rounded-md px-6",
        xl:  "h-12 rounded-md px-8",
        xxl: "h-14 rounded-md px-10",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "xxl" },
  }
);

function GlassFilter() {
  return (
    <svg className="hidden" aria-hidden="true">
      <defs>
        <filter id="container-glass" x="0%" y="0%" width="100%" height="100%"
          colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05"
            numOctaves="1" seed="1" result="turbulence" />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="70"
            xChannelSelector="R" yChannelSelector="B" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

function LiquidButton({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof liquidbuttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn("relative", liquidbuttonVariants({ variant, size, className }))}
      {...props}
    >
      <div
        className="absolute top-0 left-0 z-0 h-full w-full rounded-full
          shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),
          inset_3px_3px_0.5px_-3px_rgba(0,0,0,0.9),
          inset_-3px_-3px_0.5px_-3px_rgba(0,0,0,0.85),
          inset_0_0_6px_6px_rgba(0,0,0,0.12),
          0_0_12px_rgba(255,255,255,0.15)]
          transition-all
          dark:shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),
          inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),
          inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),
          inset_0_0_6px_6px_rgba(255,255,255,0.12),
          0_0_12px_rgba(0,0,0,0.15)]"
      />
      <div
        className="absolute top-0 left-0 isolate -z-10 h-full w-full overflow-hidden rounded-md"
        style={{ backdropFilter: 'url("#container-glass")' }}
      />
      <div className="pointer-events-none z-10">{children}</div>
      <GlassFilter />
    </Comp>
  );
}

/* ── MetalButton ── */
type ColorVariant = "default" | "primary" | "success" | "error" | "gold" | "bronze";

const colorVariants: Record<ColorVariant, { outer: string; inner: string; button: string; textColor: string; textShadow: string }> = {
  default: { outer: "bg-gradient-to-b from-[#000] to-[#A0A0A0]", inner: "bg-gradient-to-b from-[#FAFAFA] via-[#3E3E3E] to-[#E5E5E5]", button: "bg-gradient-to-b from-[#B9B9B9] to-[#969696]", textColor: "text-white", textShadow: "[text-shadow:_0_-1px_0_rgb(80_80_80_/_100%)]" },
  primary: { outer: "bg-gradient-to-b from-[#000] to-[#A0A0A0]", inner: "bg-gradient-to-b from-primary via-secondary to-muted", button: "bg-gradient-to-b from-primary to-primary/40", textColor: "text-white", textShadow: "[text-shadow:_0_-1px_0_rgb(30_58_138_/_100%)]" },
  success: { outer: "bg-gradient-to-b from-[#005A43] to-[#7CCB9B]", inner: "bg-gradient-to-b from-[#E5F8F0] via-[#00352F] to-[#D1F0E6]", button: "bg-gradient-to-b from-[#9ADBC8] to-[#3E8F7C]", textColor: "text-[#FFF7F0]", textShadow: "[text-shadow:_0_-1px_0_rgb(6_78_59_/_100%)]" },
  error:   { outer: "bg-gradient-to-b from-[#5A0000] to-[#FFAEB0]", inner: "bg-gradient-to-b from-[#FFDEDE] via-[#680002] to-[#FFE9E9]", button: "bg-gradient-to-b from-[#F08D8F] to-[#A45253]", textColor: "text-[#FFF7F0]", textShadow: "[text-shadow:_0_-1px_0_rgb(146_64_14_/_100%)]" },
  gold:    { outer: "bg-gradient-to-b from-[#917100] to-[#EAD98F]", inner: "bg-gradient-to-b from-[#FFFDDD] via-[#856807] to-[#FFF1B3]", button: "bg-gradient-to-b from-[#FFEBA1] to-[#9B873F]", textColor: "text-[#FFFDE5]", textShadow: "[text-shadow:_0_-1px_0_rgb(178_140_2_/_100%)]" },
  bronze:  { outer: "bg-gradient-to-b from-[#864813] to-[#E9B486]", inner: "bg-gradient-to-b from-[#EDC5A1] via-[#5F2D01] to-[#FFDEC1]", button: "bg-gradient-to-b from-[#FFE3C9] to-[#A36F3D]", textColor: "text-[#FFF7F0]", textShadow: "[text-shadow:_0_-1px_0_rgb(124_45_18_/_100%)]" },
};

const MetalButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ColorVariant }>(
  ({ children, className, variant = "default", ...props }, ref) => {
    const [isPressed, setIsPressed] = React.useState(false);
    const [isHovered, setIsHovered] = React.useState(false);
    const [isTouch,   setIsTouch]   = React.useState(false);

    React.useEffect(() => {
      setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
    }, []);

    const c = colorVariants[variant];
    const ease = "all 250ms cubic-bezier(0.1, 0.4, 0.2, 1)";

    return (
      <div
        className={cn("relative inline-flex transform-gpu rounded-md p-[1.25px] will-change-transform", c.outer)}
        style={{
          transform: isPressed ? "translateY(2.5px) scale(0.99)" : "translateY(0) scale(1)",
          boxShadow: isPressed ? "0 1px 2px rgba(0,0,0,0.15)" : "0 3px 8px rgba(0,0,0,0.08)",
          transition: ease,
        }}
      >
        <div className={cn("absolute inset-[1px] transform-gpu rounded-lg will-change-transform", c.inner)}
          style={{ transition: ease, filter: isHovered && !isPressed && !isTouch ? "brightness(1.05)" : "none" }} />
        <button
          ref={ref}
          className={cn("relative z-10 m-[1px] rounded-md inline-flex h-11 transform-gpu cursor-pointer items-center justify-center overflow-hidden px-6 py-2 text-sm font-semibold will-change-transform outline-none", c.button, c.textColor, c.textShadow, className)}
          style={{ transform: isPressed ? "scale(0.97)" : "scale(1)", transition: ease }}
          {...props}
          onMouseDown={() => setIsPressed(true)}
          onMouseUp={() => setIsPressed(false)}
          onMouseLeave={() => { setIsPressed(false); setIsHovered(false); }}
          onMouseEnter={() => { if (!isTouch) setIsHovered(true); }}
          onTouchStart={() => setIsPressed(true)}
          onTouchEnd={() => setIsPressed(false)}
          onTouchCancel={() => setIsPressed(false)}
        >
          {isHovered && !isPressed && !isTouch && (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t rounded-lg from-transparent to-white/5" />
          )}
          {children}
        </button>
      </div>
    );
  }
);
MetalButton.displayName = "MetalButton";

export { LiquidButton, liquidbuttonVariants, MetalButton };
