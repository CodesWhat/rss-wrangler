"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceInvite } from "@rss-wrangler/contracts";
import { ProtectedRoute } from "@/components/protected-route";
import {
  createWorkspaceInvite,
  listWorkspaceInvites,
  revokeWorkspaceInvite
} from "@/lib/api";

function statusLabel(invite: WorkspaceInvite): string {
  if (invite.status === "pending") {
    return "Pending";
  }
  if (invite.status === "consumed") {
    return "Used";
  }
  if (invite.status === "revoked") {
    return "Revoked";
  }
  return "Expired";
}

function InvitesContent() {
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [createBusy, setCreateBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastCreated, setLastCreated] = useState<WorkspaceInvite | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    listWorkspaceInvites()
      .then((rows) => setInvites(rows))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreateInvite() {
    setError("");
    setCreateBusy(true);
    const result = await createWorkspaceInvite({
      email: email.trim() || undefined,
      expiresInDays
    });
    setCreateBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setInvites((prev) => [result.invite, ...prev]);
    setLastCreated(result.invite);
    setEmail("");
  }

  async function handleRevoke(inviteId: string) {
    setError("");
    setRevokingId(inviteId);
    const result = await revokeWorkspaceInvite(inviteId);
    setRevokingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInvites((prev) => prev.map((row) => (row.id === inviteId ? result.invite : row)));
  }

  const pendingCount = useMemo(
    () => invites.filter((invite) => invite.status === "pending").length,
    [invites]
  );

  if (loading) {
    return <p className="muted">Loading invites...</p>;
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Workspace Invites</h1>
      </div>

      <section className="section-card">
        <h2>Create invite</h2>
        <p className="muted">
          Invite-only join is enforced after your first account. Pending invites: {pendingCount}.
        </p>

        <div className="settings-form">
          <label htmlFor="invite-email">
            Restrict to email (optional)
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              placeholder="person@example.com"
            />
          </label>

          <label htmlFor="invite-expiry">
            Expires in
            <select
              id="invite-expiry"
              value={String(expiresInDays)}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
            >
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>

          <button
            type="button"
            className="button button-primary"
            onClick={handleCreateInvite}
            disabled={createBusy}
          >
            {createBusy ? "Creating..." : "Create invite"}
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {lastCreated?.inviteCode ? (
        <section className="section-card">
          <h2>Latest invite secret</h2>
          <p className="muted">This code is shown once. Save it now.</p>
          <div className="settings-form">
            <label htmlFor="invite-code-latest">
              Invite code
              <input
                id="invite-code-latest"
                className="input"
                readOnly
                value={lastCreated.inviteCode}
              />
            </label>
            {lastCreated.inviteUrl ? (
              <label htmlFor="invite-url-latest">
                Join URL
                <input
                  id="invite-url-latest"
                  className="input"
                  readOnly
                  value={lastCreated.inviteUrl}
                />
              </label>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="section-card">
        <h2>Recent invites</h2>
        {invites.length === 0 ? (
          <p className="muted">No invites yet.</p>
        ) : (
          <table className="feed-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.email ?? "Any email"}</td>
                  <td>{statusLabel(invite)}</td>
                  <td>{new Date(invite.createdAt).toLocaleString()}</td>
                  <td>{new Date(invite.expiresAt).toLocaleString()}</td>
                  <td>
                    {invite.status === "pending" ? (
                      <button
                        type="button"
                        className="button button-small button-danger"
                        onClick={() => {
                          void handleRevoke(invite.id);
                        }}
                        disabled={revokingId === invite.id}
                      >
                        {revokingId === invite.id ? "Revoking..." : "Revoke"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export default function WorkspaceInvitesPage() {
  return (
    <ProtectedRoute>
      <InvitesContent />
    </ProtectedRoute>
  );
}
