import type { Metadata } from "next";
import Script from "next/script";
import { ToastProvider } from "@/app/components/ui/Toast";
import { ThemeProvider } from "next-themes";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
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
