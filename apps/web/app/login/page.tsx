"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
  const { authenticated, loading, loginUser } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNotice(params.get("notice") ?? "");
  }, []);

  useEffect(() => {
    if (!loading && authenticated) {
      router.replace("/");
    }
  }, [loading, authenticated, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await loginUser({ username, password });
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;
  if (authenticated) return null;

  return (
    <section className="login-container">
      <div className="login-card">
        <div className="auth-brand">
          <div className="brand-mark" />
          <h1 className="brand-name">RSS_WRANGLER</h1>
        </div>
        <p className="muted">Sign in to continue</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
          {notice ? <p className="muted">{notice}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
          <a
            href="/forgot-password"
            className="muted"
            style={{ textAlign: "center", display: "block" }}
          >
            Forgot password?
          </a>
          <a
            href="/resend-verification"
            className="muted"
            style={{ textAlign: "center", display: "block" }}
          >
            Resend verification email
          </a>
          <a href="/signup" className="muted" style={{ textAlign: "center", display: "block" }}>
            Create an account
          </a>
        </form>
      </div>
    </section>
  );
}
