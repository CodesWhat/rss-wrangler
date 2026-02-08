"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function JoinWorkspacePage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextParams = new URLSearchParams();
    const invite = params.get("invite");
    if (invite) {
      nextParams.set("invite", invite);
    }
    const query = nextParams.toString();
    router.replace(query ? `/signup?${query}` : "/signup");
  }, [router]);

  return (
    <section className="login-container">
      <div className="login-card">
        <div className="auth-brand">
          <div className="brand-mark" />
          <h1 className="brand-name">Create Account</h1>
        </div>
        <p className="muted">Redirecting to account creation...</p>
      </div>
    </section>
  );
}
