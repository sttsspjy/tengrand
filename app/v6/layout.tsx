import type { Metadata } from "next";
import { Instrument_Serif, Anton, Archivo, Permanent_Marker } from "next/font/google";
import styles from "./n2.module.css";

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--n-serif",
  display: "swap",
});

const slab = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--n-slab",
  display: "swap",
});

const wide = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--n-wide",
  display: "swap",
});

const grease = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  variable: "--n-grease",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jaeyoung | Nocturne",
  description: "Jaeyoung, AI-native builder. About, skills, projects and contact.",
};

export default function Nocturne2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${styles.root} ${serif.variable} ${slab.variable} ${wide.variable} ${grease.variable}`}>
      {children}
    </div>
  );
}
