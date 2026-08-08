import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hustlrzz V2",
  description: "AI mock interview coach — camera body-language tracking, live interviewer, scored coaching reports",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-background" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}