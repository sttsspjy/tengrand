import type { Metadata } from "next";
import { Bodoni_Moda, Schibsted_Grotesk } from "next/font/google";
import { intro } from "@/content/quiz";
import s from "./gate.module.css";

const display = Bodoni_Moda({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--g-display",
  display: "swap",
});
const text = Schibsted_Grotesk({ subsets: ["latin"], variable: "--g-text", display: "swap" });

export const metadata: Metadata = {
  title: `Jaeyoung | ${intro.title}`,
  description: "Answer five short questions about AI to choose which version of Jaeyoung's portfolio you see.",
};

export default function GateLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${s.root} ${display.variable} ${text.variable}`}>{children}</div>;
}
