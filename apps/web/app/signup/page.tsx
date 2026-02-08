"use client";

import { signup } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await signup({ tenantName, tenantSlug, email, username, password });
      if (result.status === "verification_required") {
        router.replace(
          `/login?notice=${encodeURIComponent("Check your email to verify your account before signing in.")}`
        );
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-container">
      <div className="login-card">
        <div className="brand-mark" />
        <h1 className="brand-name">Create Workspace</h1>
        <p className="muted">Set up your hosted account</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="tenantName">Workspace name</label>
          <input
            id="tenantName"
            type="text"
            required
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            className="input"
          />
          <label htmlFor="tenantSlug">Workspace slug</label>
          <input
            id="tenantSlug"
            type="text"
            required
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
            className="input"
            placeholder="acme-news"
          />
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
