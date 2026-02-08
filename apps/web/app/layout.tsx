import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AppNav } from "@/components/nav";
import { AuthProvider } from "@/components/auth-provider";
import { PrivacyConsentManager } from "@/components/privacy-consent-manager";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

const sans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RSS Wrangler",
  description: "Self-hosted RSS reader with clustering and digest workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable}`}>
      <body>
        <AuthProvider>
          <div className="app-shell">
            <AppNav />
            <main className="main">{children}</main>
            <PrivacyConsentManager />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
