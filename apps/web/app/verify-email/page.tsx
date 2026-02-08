"use client";

import { verifyEmail } from "@/lib/api";
import { useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function runVerification() {
      if (token === null) {
        return;
      }
      if (!token) {
        if (!cancelled) {
          setState("error");
          setMessage("Missing verification token.");
        }
        return;
      }

      const result = await verifyEmail(token);
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setState("success");
        setMessage("Email verified. You can sign in now.");
      } else {
        setState("error");
        setMessage(result.error);
      }
    }

    runVerification();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className="login-container">
      <div className="login-card">
        <div className="auth-brand">
          <div className="brand-mark" />
          <h1 className="brand-name">Verify Email</h1>
        </div>
        <p className={state === "error" ? "error-text" : "muted"}>{message}</p>
        <a href="/login" className="button button-primary" style={{ textAlign: "center" }}>
          Go to sign in
        </a>
      </div>
    </section>
  );
}
