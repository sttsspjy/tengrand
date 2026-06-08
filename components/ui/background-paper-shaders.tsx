"use client";
import { useEffect, useRef, useCallback } from "react";
import { useVisible } from "@/lib/use-visible";

const PARTICLE_COUNT = 100;
const FLOW_SCALE = 0.0015;
const SPEED = 0.1;
const CURSOR_RADIUS = 70;
const CURSOR_FORCE = 1.5;
const LINK_DISTANCE = 220;

const PALETTE = [
  [74, 124, 255],
  [139, 92, 246],
  [74, 227, 181],
  [255, 107, 107],
  [74, 255, 145],
];

function noise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const h = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263 + 1376312589) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    n = n ^ (n >> 16);
    return (n & 0x7fffffff) / 0x7fffffff;
  };

  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);

  return a + sx * (b - a) + sy * (c - a) + sx * sy * (a - b - c + d);
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number[];
}

export function ShaderScene({ className = "" }: { className?: string }) {
  const { ref: visRef, visible } = useVisible<HTMLCanvasElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isVisible = useRef(false);
  const setRefs = useCallback((el: HTMLCanvasElement | null) => {
    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
    (visRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
  }, [visRef]);
  isVisible.current = visible;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let animId: number;
    let t = 0;
    let bgCanvas: HTMLCanvasElement | null = null;

    const paintNebula = () => {
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.ceil(w);
      offscreen.height = Math.ceil(h);
      const offCtx = offscreen.getContext("2d")!;
      offCtx.fillStyle = "rgb(5,5,8)";
      offCtx.fillRect(0, 0, w, h);

      const nebulaColors = [
        "rgba(30,20,80,", "rgba(50,15,60,", "rgba(20,10,50,",
        "rgba(60,10,30,", "rgba(15,25,70,", "rgba(40,8,55,",
        "rgba(25,12,45,",
      ];
      for (let s = 0; s < 25; s++) {
        const cx = Math.random() * w;
        const cy = Math.random() * h;
        const r = 100 + Math.random() * 300;
        const c = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
        const grad = offCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, c + "0.14)");
        grad.addColorStop(1, c + "0)");
        offCtx.fillStyle = grad;
        offCtx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      bgCanvas = offscreen;
    };
    const mouse = { x: -9999, y: -9999 };

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const handleLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseleave", handleLeave);

    const particles: Particle[] = [];

    const spawn = (): Particle => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: 0,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    });

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      paintNebula();

      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(spawn());
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      animId = requestAnimationFrame(draw);
      if (!isVisible.current) return;
      t += 0.0015;

      if (bgCanvas) {
        ctx.drawImage(bgCanvas, 0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      // Update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        const angle = noise2D(p.x * FLOW_SCALE + t, p.y * FLOW_SCALE + t * 0.5) * Math.PI * 4;

        p.vx = p.vx * 0.96 + Math.cos(angle) * SPEED * 0.04;
        p.vy = p.vy * 0.96 + Math.sin(angle) * SPEED * 0.04;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CURSOR_RADIUS && dist > 0.1) {
          const force = (1 - dist / CURSOR_RADIUS) * CURSOR_FORCE;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < 0) p.x += w;
        else if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        else if (p.y > h) p.y -= h;
      }

      // Draw lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DISTANCE) {
            const opacity = (1 - dist / LINK_DISTANCE) * 0.35;
            const r = Math.round((a.color[0] + b.color[0]) / 2);
            const g = Math.round((a.color[1] + b.color[1]) / 2);
            const bl = Math.round((a.color[2] + b.color[2]) / 2);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(${r},${g},${bl},${opacity})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Draw particles (dots)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const [r, g, b] = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
        ctx.fill();
      }
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return <canvas ref={setRefs} className={`w-full h-full block ${className}`} />;
}
