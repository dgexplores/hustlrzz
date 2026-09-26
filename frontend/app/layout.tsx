import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Hustlrzz — Interview practice that remembers you",
    template: "%s | Hustlrzz",
  },
  description:
    "Turn your resume into a practice pack, clear aptitude-style screens, and rehearse with an interviewer that focuses on what you need to improve. Private, in your browser.",
  manifest: "/manifest.json",
  openGraph: {
    title: "Hustlrzz — Interview practice that remembers you",
    description: "Preparation, screening rounds and live practice in one private workspace.",
    type: "website",
    siteName: "Hustlrzz",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hustlrzz — Interview practice that remembers you",
    description: "Prepare, assess, rehearse, improve.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `
    try {
      const preference = localStorage.getItem('hustlrzz-theme') || 'system';
      const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    } catch (_) {}
  `;
  const swScript = `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});}`;
  return (
    <html lang="en" suppressHydrationWarning className={GeistSans.variable}>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </head>
      <body className="min-h-dvh bg-background antialiased" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
