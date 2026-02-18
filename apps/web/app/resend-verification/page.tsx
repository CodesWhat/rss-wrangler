"use client";

import { type FormEvent, useState } from "react";
import { resendVerification } from "@/lib/api";

export default function ResendVerificationPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await resendVerification({ email });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
  }

  return (
    <section className="login-container">
      <div className="login-card">
        <div className="auth-brand">
          <div className="brand-mark" />
          <h1 className="brand-name">Resend Verification</h1>
        </div>
        <p className="muted">Request a new email verification link.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input"
          />

          {submitted ? (
            <p className="muted">
              If an account exists and is not yet verified, a new verification link has been sent.
            </p>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? "Sending..." : "Send verification link"}
          </button>
          <a href="/login" className="muted" style={{ textAlign: "center", display: "block" }}>
            Back to sign in
          </a>
        </form>
      </div>
    </section>
  );
}
