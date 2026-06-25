import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { SupportChatWidget } from "@/components/SupportChatWidget";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alpha Mirror — Copy elite on-chain traders",
  description:
    "Identify top 0.5% crypto wallets by risk-adjusted ROI and mirror their strategies with your own wallet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <MaintenanceBanner />
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <SupportChatWidget />
          <FeedbackWidget />
        </Providers>
      </body>
    </html>
  );
}