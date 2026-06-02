import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jaeyoung — AI-Native Builder",
  description:
    "I ship entire products with AI. Portfolio of Jaeyoung, vibecoder and AI-native builder.",
  openGraph: {
    title: "Jaeyoung — AI-Native Builder",
    description: "I ship entire products with AI.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
