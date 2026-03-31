import type { Metadata } from "next";
import Script from "next/script";
import { ToastProvider } from "@/app/components/ui/Toast";
import { ThemeProvider } from "next-themes";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Avani Hospital OS — Intelligence Platform",
  description: "Next-generation Hospital Operating Intelligence System with AI-powered triage, real-time analytics, and comprehensive patient management.",
  keywords: "hospital management, AI triage, patient management, healthcare analytics, HIPAA compliant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${playfairDisplay.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" disableTransitionOnChange>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
