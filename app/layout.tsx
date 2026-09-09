import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "preksha — Sovereign AI for Every Investigation",
  description:
    "preksha is an AI-powered criminal network analysis platform — ingest FIRs, call records, financial flows, tower dumps and CCTV metadata into one evidence-grounded investigation graph.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[var(--preksha-bg)] text-[var(--preksha-ink)]">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}