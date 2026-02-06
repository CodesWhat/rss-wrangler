import type { Metadata } from "next";
import { AppNav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "RSS Wrangler",
  description: "Self-hosted RSS reader with clustering and digest workflow"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <AppNav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
