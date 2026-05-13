import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const serif = Cormorant_Garamond({
  variable: "--font-serif-loaded",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const sans = Inter({ variable: "--font-sans-loaded", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-loaded", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hanami",
  description: "An AI bouncer for your whitelist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
