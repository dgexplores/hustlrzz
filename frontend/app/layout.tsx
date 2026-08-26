import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hustlrzz — Interview practice that remembers you",
    template: "%s | Hustlrzz",
  },
  description:
    "Turn your resume into a practice pack, clear aptitude-style screens, and rehearse with an interviewer that focuses on what you need to improve. Private, in your browser.",
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
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    } catch (_) {}
  `;
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen bg-background antialiased" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
