"use client";
import React, { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useVisible } from "@/lib/use-visible";

const COLS = 150;
const ROWS = 100;
const CELL_W = 64;
const CELL_H = 32;

const COLORS = [
  [125, 211, 252],
  [249, 168, 212],
  [134, 239, 172],
  [253, 224, 71],
  [252, 165, 165],
  [216, 180, 254],
  [147, 197, 253],
  [165, 180, 252],
  [196, 181, 253],
];

const GRID_COLOR = "rgba(51,65,85,0.7)";
const CROSS_COLOR = "rgba(51,65,85,0.5)";

interface CellState {
  alpha: number;
  color: number[];
}

export const BoxesCore = ({ className }: { className?: string }) => {
  const { ref: wrapRef, visible } = useVisible<HTMLCanvasElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cells = useRef<CellState[][]>([]);
  const animFrame = useRef<number>(0);
  const lastMouse = useRef({ x: -1, y: -1 });
  const gridImageRef = useRef<ImageBitmap | null>(null);

  // Merge refs
  const setRefs = useCallback((el: HTMLCanvasElement | null) => {
    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
    (wrapRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
  }, [wrapRef]);

  const initCells = useCallback(() => {
    const grid: CellState[][] = [];
    for (let i = 0; i < COLS; i++) {
      grid[i] = [];
      for (let j = 0; j < ROWS; j++) {
        grid[i][j] = { alpha: 0, color: COLORS[0] };
      }
    }
    cells.current = grid;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    initCells();

    // Pre-render static grid to offscreen canvas
    const renderStaticGrid = (w: number, h: number) => {
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const oc = offscreen.getContext("2d")!;

      oc.save();
      const cx = w * 0.25;
      const cy = -h * 0.25;
      oc.translate(cx - w * 0.4, cy - h * 0.6);
      oc.transform(0.675, Math.tan(14 * Math.PI / 180) * 0.675, Math.tan(-48 * Math.PI / 180) * 0.675, 0.675, 0, 0);

      // Batch all grid lines in one path
      oc.strokeStyle = GRID_COLOR;
      oc.lineWidth = 0.5;
      oc.beginPath();
      for (let i = 0; i <= COLS; i++) {
        const x = i * CELL_W;
        oc.moveTo(x, 0);
        oc.lineTo(x, ROWS * CELL_H);
      }
      for (let j = 0; j <= ROWS; j++) {
        const y = j * CELL_H;
        oc.moveTo(0, y);
        oc.lineTo(COLS * CELL_W, y);
      }
      oc.stroke();

      // Batch all crosshairs
      oc.strokeStyle = CROSS_COLOR;
      oc.lineWidth = 0.5;
      oc.beginPath();
      for (let i = 0; i < COLS; i += 2) {
        for (let j = 0; j < ROWS; j += 2) {
          const x = i * CELL_W;
          const y = j * CELL_H;
          oc.moveTo(x, y - 5);
          oc.lineTo(x, y + 5);
          oc.moveTo(x - 5, y);
          oc.lineTo(x + 5, y);
        }
      }
      oc.stroke();
      oc.restore();

      return createImageBitmap(offscreen);
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderStaticGrid(rect.width, rect.height).then(bmp => {
        gridImageRef.current = bmp;
      });
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      lastMouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener("mousemove", handleMove);

    return () => {
      cancelAnimationFrame(animFrame.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMove);
    };
  }, [initCells]);

  // Separate effect for animation loop gated on visibility
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      // Draw pre-rendered grid
      if (gridImageRef.current) {
        ctx.drawImage(gridImageRef.current, 0, 0, width, height);
      }

      // Draw hover highlights
      ctx.save();
      const cx = width * 0.25;
      const cy = -height * 0.25;
      ctx.translate(cx - width * 0.4, cy - height * 0.6);
      ctx.transform(0.675, Math.tan(14 * Math.PI / 180) * 0.675, Math.tan(-48 * Math.PI / 180) * 0.675, 0.675, 0, 0);

      const grid = cells.current;
      for (let i = 0; i < COLS; i++) {
        const x = i * CELL_W;
        for (let j = 0; j < ROWS; j++) {
          const cell = grid[i][j];
          if (cell.alpha > 0) {
            cell.alpha = Math.max(cell.alpha - 0.015, 0);
            if (cell.alpha > 0.001) {
              const [r, g, b] = cell.color;
              ctx.fillStyle = `rgba(${r},${g},${b},${cell.alpha})`;
              ctx.fillRect(x, j * CELL_H, CELL_W, CELL_H);
            }
          }
        }
      }
      ctx.restore();

      // Hover detection
      const mx = lastMouse.current.x;
      const my = lastMouse.current.y;
      if (mx >= 0 && my >= 0) {
        const ox = width * 0.25 - width * 0.4;
        const oy = -height * 0.25 - height * 0.6;
        const skewX = Math.tan(-48 * Math.PI / 180);
        const skewY = Math.tan(14 * Math.PI / 180);
        const s = 0.675;
        const a = s, b = skewY * s, c = skewX * s, d = s;
        const det = a * d - b * c;
        if (Math.abs(det) > 0.001) {
          const lx = mx - ox;
          const ly = my - oy;
          const gx = (d * lx - c * ly) / det;
          const gy = (-b * lx + a * ly) / det;
          const ci = Math.floor(gx / CELL_W);
          const ri = Math.floor(gy / CELL_H);
          if (ci >= 0 && ci < COLS && ri >= 0 && ri < ROWS) {
            const cell = grid[ci][ri];
            if (cell.alpha < 0.05) {
              cell.color = COLORS[Math.floor(Math.random() * COLORS.length)];
            }
            cell.alpha = 0.45;
          }
        }
      }

      animFrame.current = requestAnimationFrame(draw);
    };

    animFrame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrame.current);
  }, [visible]);

  return (
    <canvas
      ref={setRefs}
      className={cn("absolute inset-0 w-full h-full z-0", className)}
      style={{ transform: "translateZ(0)" }}
    />
  );
};

export const Boxes = React.memo(BoxesCore);
