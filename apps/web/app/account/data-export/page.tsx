"use client";

import type { AccountDataExportStatus } from "@rss-wrangler/contracts";
import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import {
  downloadAccountDataExport,
  getAccountDataExportStatus,
  requestAccountDataExport,
} from "@/lib/api";

function formatBytes(bytes: number | null): string {
  if (bytes == null) {
    return "unknown size";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: AccountDataExportStatus | null): string {
  if (!status) {
    return "No export requested yet.";
  }
  if (status.status === "pending") {
    return "Export queued.";
  }
  if (status.status === "processing") {
    return "Building export bundle.";
  }
  if (status.status === "completed") {
    return "Export ready for download.";
  }
  return "Export failed.";
}

function DataExportContent() {
  const [status, setStatus] = useState<AccountDataExportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestBusy, setRequestBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refreshStatus = useCallback(async () => {
    const current = await getAccountDataExportStatus();
    setStatus(current);
  }, []);

  useEffect(() => {
    refreshStatus().finally(() => setLoading(false));
  }, [refreshStatus]);

  useEffect(() => {
    if (!status || (status.status !== "pending" && status.status !== "processing")) {
      return;
    }
    const interval = setInterval(() => {
      refreshStatus().catch(() => {
        // Keep polling silent; UI state already tracks errors from actions.
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [status, refreshStatus]);

  async function handleRequestExport() {
    setError("");
    setSuccess("");
    setRequestBusy(true);
    const result = await requestAccountDataExport();
    setRequestBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setStatus(result.status);
    setSuccess(
      result.status.status === "completed"
        ? "A fresh export was generated."
        : "Export request submitted.",
    );
  }

  async function handleDownload() {
    setError("");
    setSuccess("");
    setDownloadBusy(true);
    const result = await downloadAccountDataExport();
    setDownloadBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess("Download started.");
  }

  if (loading) {
    return <p className="muted">Loading export status...</p>;
  }

  const isActive = status?.status === "pending" || status?.status === "processing";

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Account Export</h1>
      </div>

      <section className="section-card">
        <h2>Data portability bundle</h2>
        <p className="muted">
          Generate a JSON export of your account data: subscriptions, saved items, annotations,
          filters/rules, settings, digests, and interaction events.
        </p>

        <div className="settings-form">
          <p className="muted">{statusLabel(status)}</p>

          {status ? (
            <div className="settings-form">
              <p className="muted">Requested: {new Date(status.requestedAt).toLocaleString()}</p>
              {status.startedAt ? (
                <p className="muted">Started: {new Date(status.startedAt).toLocaleString()}</p>
              ) : null}
              {status.completedAt ? (
                <p className="muted">Completed: {new Date(status.completedAt).toLocaleString()}</p>
              ) : null}
              {status.fileSizeBytes != null ? (
                <p className="muted">Bundle size: {formatBytes(status.fileSizeBytes)}</p>
              ) : null}
              {status.errorMessage ? <p className="error-text">{status.errorMessage}</p> : null}
            </div>
          ) : null}

          {success ? <p className="key-status key-status-active">{success}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          <div className="key-edit-row">
            <button
              type="button"
              className="button button-primary"
              disabled={requestBusy || isActive}
              onClick={handleRequestExport}
            >
              {requestBusy ? "Submitting..." : isActive ? "Export in progress" : "Generate export"}
            </button>

            <button
              type="button"
              className="button"
              disabled={downloadBusy || status?.status !== "completed"}
              onClick={handleDownload}
            >
              {downloadBusy ? "Preparing..." : "Download latest export"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export default function AccountDataExportPage() {
  return (
    <ProtectedRoute>
      <DataExportContent />
    </ProtectedRoute>
  );
}
