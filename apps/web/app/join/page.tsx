"use client";

import { joinWorkspace } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export default function JoinWorkspacePage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tenant = params.get("tenant");
    const invite = params.get("invite");
    if (tenant) {
      setTenantSlug(tenant);
    }
    if (invite) {
      setInviteCode(invite);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await joinWorkspace({
        tenantSlug,
        email,
        username,
        password,
        inviteCode: inviteCode.trim() ? inviteCode.trim() : undefined
      });
      if (result.status === "verification_required") {
        const notice = "Check your email to verify your account before signing in.";
        router.replace(
          `/login?tenant=${encodeURIComponent(tenantSlug)}&notice=${encodeURIComponent(notice)}`
        );
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-container">
      <div className="login-card">
        <div className="brand-mark" />
        <h1 className="brand-name">Join Workspace</h1>
        <p className="muted">Create your user in an existing workspace</p>
        <form onSubmit={handleSubmit} className="login-form">
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

          <label htmlFor="inviteCode">Invite code</label>
          <input
            id="inviteCode"
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className="input"
            placeholder="Paste invite code (required for private workspaces)"
          />

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? "Joining..." : "Join workspace"}
          </button>

          <a href="/login" className="muted" style={{ textAlign: "center", display: "block" }}>
            Back to sign in
          </a>
        </form>
      </div>
    </section>
  );
}
