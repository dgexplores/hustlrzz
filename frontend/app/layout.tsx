import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hustlrzz | AI mock interview coach",
    template: "%s | Hustlrzz",
  },
  description:
    "Prepare from your resume, pass aptitude-style screening rounds, practise live interviews with a human-sounding AI interviewer, and review answer and body-language feedback.",
  openGraph: {
    title: "Hustlrzz | AI mock interview coach",
    description:
      "Resume-grounded preparation, screening-round assessments, live voice interviews and private presence coaching.",
    type: "website",
    siteName: "Hustlrzz",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hustlrzz | AI mock interview coach",
    description: "Prepare, assess, rehearse, improve - one private interview workspace.",
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
