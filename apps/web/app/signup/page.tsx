"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { joinAccount } from "@/lib/api";

export default function SignupPage() {
  const { markAuthenticated } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) {
      setInviteCode(invite);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await joinAccount({
        email,
        username,
        password,
        inviteCode: inviteCode.trim() ? inviteCode.trim() : undefined,
      });
      if (result.status === "verification_required") {
        router.replace(
          `/login?notice=${encodeURIComponent("Check your email to verify your account before signing in.")}`,
        );
        return;
      }
      markAuthenticated();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-container">
      <div className="login-card">
        <div className="auth-brand">
          <div className="brand-mark" />
          <h1 className="brand-name">Create Account</h1>
        </div>
        <p className="muted">Create your user account to start reading.</p>
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
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
          <label htmlFor="inviteCode">Invite code</label>
          <input
            id="inviteCode"
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className="input"
            placeholder="Enter invite code"
          />
          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? "Creating..." : "Create account"}
          </button>
          <a href="/login" className="muted" style={{ textAlign: "center", display: "block" }}>
            Back to sign in
          </a>
        </form>
      </div>
    </section>
  );
}
