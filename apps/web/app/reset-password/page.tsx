"use client";

import { type FormEvent, useEffect, useState } from "react";
import { resetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setError("Missing reset token.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setSubmitting(true);
    const result = await resetPassword({ token, newPassword });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDone(true);
  }

  return (
    <section className="login-container">
      <div className="login-card">
        <div className="auth-brand">
          <div className="brand-mark" />
          <h1 className="brand-name">Set New Password</h1>
        </div>
        <p className="muted">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="input"
          />

          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="input"
          />

          {done ? <p className="muted">Password updated. You can sign in now.</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" className="button button-primary" disabled={submitting || done}>
            {submitting ? "Updating..." : "Update password"}
          </button>
          <a href="/login" className="muted" style={{ textAlign: "center", display: "block" }}>
            Back to sign in
          </a>
        </form>
      </div>
    </section>
  );
}
