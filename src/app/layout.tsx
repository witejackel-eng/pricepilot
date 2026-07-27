import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PricePilot — Product Pricing and Profit Optimiser",
  description: "Import product spreadsheets, calculate landed costs, compare pricing strategies and export profitable selling prices privately in your browser.",
  keywords: ["PricePilot", "pricing", "profit", "margin", "markup", "GST", "landed cost", "e-commerce", "product pricing"],
  authors: [{ name: "PricePilot Team" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "PricePilot — Product Pricing and Profit Optimiser",
    description: "Private, browser-based product pricing and profit analysis",
    url: "https://pricepilot.app",
    siteName: "PricePilot",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PricePilot",
    description: "Private, browser-based product pricing and profit analysis",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
