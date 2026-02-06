"use client";

import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { authenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace("/login");
    }
  }, [loading, authenticated, router]);

  if (loading) {
    return <div className="muted" style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>;
  }

  if (!authenticated) {
    return null;
  }

  return <>{children}</>;
}
