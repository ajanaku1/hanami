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

const themeInit = `(() => {
  try {
    const saved = localStorage.getItem("hanami-theme");
    let theme = saved;
    if (theme !== "light" && theme !== "dark") {
      theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`;

export const metadata: Metadata = {
  title: "Hanami — TEE-attested whitelist screening on 0G",
  description: "Certify an AI bouncer, screen applicants privately, and export a Merkle whitelist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${serif.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body className="min-h-screen flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
