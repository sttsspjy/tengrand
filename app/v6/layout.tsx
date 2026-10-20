import type { Metadata } from "next";
import { Fraunces, Martian_Mono } from "next/font/google";
import styles from "./n2.module.css";

const serif = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--n-serif",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--n-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jaeyoung | Nocturne",
  description: "Jaeyoung, AI-native builder. About, craft, skills, projects and contact.",
};

export default function NocturneLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${styles.root} ${serif.variable} ${mono.variable}`}>{children}</div>;
}
