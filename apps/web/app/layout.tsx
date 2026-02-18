import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { AppNav } from "@/components/nav";
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
  const privacyConsentEnabled = process.env.NEXT_PUBLIC_ENABLE_PRIVACY_CONSENT === "true";

  return (
    <html lang="en" className={`${mono.variable} ${sans.variable}`}>
      <body>
        <AuthProvider>
          <div className="app-shell">
            <a href="#main-content" className="skip-to-main">
              Skip to main content
            </a>
            <AppNav />
            <main id="main-content" className="main">
              {children}
            </main>
            {privacyConsentEnabled ? <PrivacyConsentManager /> : null}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
