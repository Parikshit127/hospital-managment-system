import type { Metadata } from "next";
import { Outfit, Playfair_Display } from "next/font/google";
import Script from "next/script";
import { ToastProvider } from "@/app/components/ui/Toast";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-playfair",
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
    <html lang="en">
      <body className={`${outfit.variable} ${playfair.variable} font-sans antialiased`}>
        <ToastProvider>
        {children}
        </ToastProvider>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
