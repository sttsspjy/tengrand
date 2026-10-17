import type { Metadata } from "next";
import { EB_Garamond, Newsreader, Big_Shoulders_Stencil, B612_Mono, Archivo } from "next/font/google";
import s from "./base.module.css";

const text = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"], variable: "--f-text", display: "swap" });
const display = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--f-display",
  display: "swap",
});
const stencil = Big_Shoulders_Stencil({ subsets: ["latin"], variable: "--f-stencil", display: "swap" });
const tech = B612_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--f-tech", display: "swap" });
const poster = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--f-poster", display: "swap" });

export const metadata: Metadata = {
  title: "Jaeyoung | Codex",
  description: "Jaeyoung, AI-native builder. About, skills, projects and contact.",
};

export default function CodexLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${s.root} ${text.variable} ${display.variable} ${stencil.variable} ${tech.variable} ${poster.variable}`}>
      {children}
    </div>
  );
}
