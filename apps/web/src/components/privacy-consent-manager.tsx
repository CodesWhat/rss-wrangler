"use client";

import type { PrivacyConsent } from "@rss-wrangler/contracts";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { SettingsIcon, XIcon } from "@/components/icons";
import { getPrivacyConsent, updatePrivacyConsent } from "@/lib/api";

interface ConsentDraft {
  analytics: boolean;
  advertising: boolean;
  functional: boolean;
}

function toDraft(consent: PrivacyConsent): ConsentDraft {
  return {
    analytics: consent.analytics,
    advertising: consent.advertising,
    functional: consent.functional,
  };
}

const DEFAULT_CONSENT: PrivacyConsent = {
  necessary: true,
  analytics: false,
  advertising: false,
  functional: false,
  consentCapturedAt: null,
  regionCode: null,
  requiresExplicitConsent: false,
};

export function PrivacyConsentManager() {
  const { authenticated, loading } = useAuth();
  const [consent, setConsent] = useState<PrivacyConsent | null>(null);
  const [draft, setDraft] = useState<ConsentDraft>({
    analytics: false,
    advertising: false,
    functional: false,
  });
  const [open, setOpen] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState(false);

  useEffect(() => {
    if (!authenticated || loading) {
      return;
    }

    let cancelled = false;
    async function loadConsent() {
      setLoadingConsent(true);
      const value = await getPrivacyConsent();
      if (cancelled) {
        return;
      }
      if (value) {
        setConsent(value);
        setDraft(toDraft(value));
      } else {
        setConsent(DEFAULT_CONSENT);
        setDraft(toDraft(DEFAULT_CONSENT));
      }
      setLoadingConsent(false);
    }

    loadConsent();
    return () => {
      cancelled = true;
    };
  }, [authenticated, loading]);

  useEffect(() => {
    if (!authenticated) {
      setConsent(null);
      setOpen(false);
      setDismissedBanner(false);
      setError("");
      setLoadingConsent(false);
    }
  }, [authenticated]);

  const hasCapturedConsent = useMemo(() => {
    return Boolean(consent?.consentCapturedAt);
  }, [consent]);

  async function saveConsent(next: ConsentDraft) {
    setSaving(true);
    setError("");
    const result = await updatePrivacyConsent(next);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return false;
    }

    setConsent(result.consent);
    setDraft(toDraft(result.consent));
    setDismissedBanner(true);
    return true;
  }

  async function handleAcceptRecommended() {
    const ok = await saveConsent({
      analytics: true,
      advertising: false,
      functional: true,
    });
    if (ok) {
      setOpen(false);
    }
  }

  async function handleRejectAll() {
    const ok = await saveConsent({
      analytics: false,
      advertising: false,
      functional: false,
    });
    if (ok) {
      setOpen(false);
    }
  }

  async function handleSaveSettings() {
    const ok = await saveConsent(draft);
    if (ok) {
      setOpen(false);
    }
  }

  if (loading || !authenticated) {
    return null;
  }

  const showBanner = !loadingConsent && consent && !hasCapturedConsent && !dismissedBanner && !open;

  return (
    <>
      {showBanner && (
        <section className="privacy-banner" aria-label="Privacy choices">
          <div className="privacy-banner-copy">
            <strong>Privacy choices</strong>
            <p>
              Necessary storage is always on. Optional analytics/advertising stay off until you opt
              in.
              {consent?.requiresExplicitConsent
                ? " We detected a region that requires explicit consent for non-essential scripts."
                : ""}
            </p>
          </div>
          <div className="privacy-banner-actions">
            <button
              type="button"
              className="button button-small"
              onClick={() => setOpen(true)}
              disabled={saving}
            >
              Privacy settings
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={handleRejectAll}
              disabled={saving}
            >
              Reject all
            </button>
            <button
              type="button"
              className="button button-small button-primary"
              onClick={handleAcceptRecommended}
              disabled={saving}
            >
              {saving ? "Saving..." : "Accept recommended"}
            </button>
          </div>
        </section>
      )}

      {consent && (
        <button
          type="button"
          className="privacy-fab"
          onClick={() => setOpen(true)}
          aria-label="Open privacy settings"
        >
          <SettingsIcon />
          Privacy settings
        </button>
      )}

      {open && consent && (
        <section
          className="privacy-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-title"
        >
          <div className="privacy-panel-header">
            <h3 id="privacy-title">Privacy settings</h3>
            <button
              type="button"
              className="button button-small"
              onClick={() => setOpen(false)}
              aria-label="Close privacy settings"
            >
              <XIcon />
            </button>
          </div>
          <p className="muted">
            Necessary storage is required for authentication and app operation. Optional categories
            are opt-in.
          </p>
          {consent.regionCode ? (
            <p className="muted">
              Detected region: <strong>{consent.regionCode}</strong>
              {consent.requiresExplicitConsent
                ? " (explicit opt-in required for non-essential categories)."
                : "."}
            </p>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}

          <div className="privacy-grid">
            <label className="privacy-toggle">
              <span>
                <strong>Necessary</strong>
                <span className="muted"> Always enabled</span>
              </span>
              <input type="checkbox" checked readOnly disabled />
            </label>

            <label className="privacy-toggle">
              <span>
                <strong>Analytics</strong>
                <span className="muted"> Product usage measurement</span>
              </span>
              <input
                type="checkbox"
                checked={draft.analytics}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, analytics: event.target.checked }));
                }}
              />
            </label>

            <label className="privacy-toggle">
              <span>
                <strong>Functional</strong>
                <span className="muted"> Optional UX enhancements</span>
              </span>
              <input
                type="checkbox"
                checked={draft.functional}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, functional: event.target.checked }));
                }}
              />
            </label>

            <label className="privacy-toggle">
              <span>
                <strong>Advertising</strong>
                <span className="muted"> Sponsored placement targeting</span>
              </span>
              <input
                type="checkbox"
                checked={draft.advertising}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, advertising: event.target.checked }));
                }}
              />
            </label>
          </div>

          <div className="privacy-panel-actions">
            <button
              type="button"
              className="button button-small"
              onClick={handleRejectAll}
              disabled={saving}
            >
              Reject all
            </button>
            <button
              type="button"
              className="button button-small button-primary"
              onClick={handleSaveSettings}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save choices"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
