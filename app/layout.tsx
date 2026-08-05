import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/providers/SessionProvider";
import { ToastProvider } from "@/providers/ToastProvider";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "GReviewPilot — AI Google Reputation Platform",
    template: "%s — GReviewPilot",
  },
  description:
    "GReviewPilot is the AI growth platform for Google reputation. Automate reviews with AI replies, QR campaigns, sentiment analytics, and local SEO — built for modern businesses.",
  openGraph: {
    type: "website",
    siteName: "GReviewPilot",
    title: "GReviewPilot — AI Google Reputation Platform",
    description:
      "Build trust. Automate reviews. Grow your business with AI. The AI-first platform for Google reviews, reputation, and local SEO.",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: [{ url: "/assets/images/logo/favicon-icon.png", type: "image/png" }],
    shortcut: "/assets/images/logo/favicon-icon.png",
    apple: "/assets/images/logo/favicon-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable}`}>
      <body>
        <SessionProvider>
          {children}
          <ToastProvider />
        </SessionProvider>
      </body>
    </html>
  );
}
