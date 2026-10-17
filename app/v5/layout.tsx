import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import s from "./v5.module.css";

const sans = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--v5-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Jaeyoung | Monolith",
  description: "Portfolio of Jaeyoung, an AI-native builder who makes web and desktop apps with AI coding agents.",
};

export default function V5Layout({ children }: { children: React.ReactNode }) {
  return <div className={`${s.root} ${sans.variable}`}>{children}</div>;
}
