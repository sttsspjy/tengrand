import type { Metadata } from "next";
import { Archivo, Bricolage_Grotesque } from "next/font/google";
import s from "./v5.module.css";

const sans = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--v5-sans", display: "swap" });
const mail = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--v5-mail", display: "swap" });

export const metadata: Metadata = {
  title: "Jaeyoung | Monolith",
  description: "Portfolio of Jaeyoung, an AI-native builder who makes web and desktop apps with AI coding agents.",
};

export default function V5Layout({ children }: { children: React.ReactNode }) {
  return <div className={`${s.root} ${sans.variable} ${mail.variable}`}>{children}</div>;
}
