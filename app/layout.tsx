import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-display",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "SAT Gamer — Level Up Your SAT Score",
  description:
    "Gamified Digital SAT Verbal prep. Earn gaming time by mastering reading and writing skills.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${geistSans.variable} font-sans antialiased`}
      >
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
