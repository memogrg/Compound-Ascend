import type { Metadata, Viewport } from "next";
import { Manrope, Sora, Space_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/layout/theme-provider";

/** Tipografías del design system v2: Sora (display), Manrope (cuerpo), Space Mono (datos). */
const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});
const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "CARTERA+ — Sistema Financiero",
  description:
    "Tu asesor financiero personal con IA. Ordena tu dinero, toma control, construye y protege tu patrimonio, y mide tu Rich Life.",
  applicationName: "CARTERA+",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F2EC" },
    { media: "(prefers-color-scheme: dark)", color: "#15140F" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${sora.variable} ${manrope.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Anti-parpadeo de tema: fija data-theme antes de pintar. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
