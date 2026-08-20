import type { Metadata } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const serif = Cormorant_Garamond({
  variable: "--font-serif-loaded",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const sans = Source_Sans_3({ variable: "--font-sans-loaded", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-loaded", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hanami — TEE-attested whitelist screening on 0G",
  description: "Certify an AI bouncer, screen applicants privately, and export a Merkle whitelist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
