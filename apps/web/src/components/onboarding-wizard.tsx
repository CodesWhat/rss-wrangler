"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AiMode } from "@rss-wrangler/contracts";
import { addFeed, importOpml, listFeeds, updateSettings } from "@/lib/api";
import feedDirectory from "@/data/feed-directory.json" with { type: "json" };

interface DirectoryEntry {
  name: string;
  url: string;
  description: string;
  category: string;
  popularity: number;
}

interface OnboardingWizardProps {
  feedsCount: number;
  initialAiMode: AiMode;
  onFeedsCountChange: (count: number) => void;
  onDismiss: () => void;
}

type SourceMethod = "url" | "opml" | "directory";

const STARTER_PER_CATEGORY = 2;
const STARTER_MAX = 10;

const DIRECTORY_ENTRIES = (feedDirectory as DirectoryEntry[]).slice();

export function OnboardingWizard({
  feedsCount,
  initialAiMode,
  onFeedsCountChange,
  onDismiss
}: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceMethod, setSourceMethod] = useState<SourceMethod>("url");
  const [feedUrl, setFeedUrl] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [starterBusy, setStarterBusy] = useState(false);
  const [starterAdded, setStarterAdded] = useState(false);
  const [starterMessage, setStarterMessage] = useState("");
  const [aiModeChoice, setAiModeChoice] = useState<AiMode>(initialAiMode);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const entriesByCategory = useMemo(() => {
    const map = new Map<string, DirectoryEntry[]>();
    for (const entry of DIRECTORY_ENTRIES) {
      const bucket = map.get(entry.category) ?? [];
      bucket.push(entry);
      map.set(entry.category, bucket);
    }
    for (const [category, entries] of map.entries()) {
      const sorted = [...entries].sort((a, b) => b.popularity - a.popularity);
      map.set(category, sorted);
    }
    return map;
  }, []);

  const categories = useMemo(
    () => Array.from(entriesByCategory.keys()).sort(),
    [entriesByCategory]
  );

  useEffect(() => {
    setAiModeChoice(initialAiMode);
  }, [initialAiMode]);

  function toggleCategory(category: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(category)) {
        return prev.filter((value) => value !== category);
      }
      return [...prev, category];
    });
  }

  async function refreshFeedsCount() {
    const feeds = await listFeeds();
    onFeedsCountChange(feeds.length);
    return feeds.length;
  }

  async function handleAddFeed() {
    if (!feedUrl.trim()) {
      return;
    }
    setAddMessage("");
    setAddBusy(true);
    const added = await addFeed(feedUrl.trim());
    if (!added) {
      setAddMessage("Could not add feed. Check URL and try again.");
      setAddBusy(false);
      return;
    }

    setFeedUrl("");
    const total = await refreshFeedsCount();
    setAddMessage(`Added feed. You now have ${total} source${total === 1 ? "" : "s"}.`);
    setAddBusy(false);
  }

  async function handleImportOpml(file: File) {
    setAddMessage("");
    setAddBusy(true);
    const result = await importOpml(file);
    if (!result) {
      setAddMessage("OPML import failed. Try a different file.");
      setAddBusy(false);
      return;
    }

    const total = await refreshFeedsCount();
    setAddMessage(
      `Imported ${result.imported} / ${result.total} feeds (${result.skipped} skipped). Total sources: ${total}.`
    );
    setAddBusy(false);
  }

  async function handleAddStarterFeeds() {
    setStarterMessage("");
    if (selectedCategories.length === 0) {
      setStarterMessage("Pick at least one interest first.");
      return;
    }

    setStarterBusy(true);
    const starterUrls: string[] = [];
    const seen = new Set<string>();

    for (const category of selectedCategories) {
      const entries = entriesByCategory.get(category) ?? [];
      for (const entry of entries.slice(0, STARTER_PER_CATEGORY)) {
        if (!seen.has(entry.url)) {
          starterUrls.push(entry.url);
          seen.add(entry.url);
        }
        if (starterUrls.length >= STARTER_MAX) {
          break;
        }
      }
      if (starterUrls.length >= STARTER_MAX) {
        break;
      }
    }

    let addedCount = 0;
    for (const url of starterUrls) {
      const feed = await addFeed(url);
      if (feed) {
        addedCount += 1;
      }
    }

    const total = await refreshFeedsCount();
    setStarterAdded(true);
    setStarterBusy(false);
    setStarterMessage(
      `Added ${addedCount} starter source${addedCount === 1 ? "" : "s"}. Total sources: ${total}.`
    );
  }

  async function handleSaveAiMode() {
    setAiMessage("");
    setAiBusy(true);
    const saved = await updateSettings({ aiMode: aiModeChoice });
    if (!saved) {
      setAiMessage("Could not save AI preference.");
      setAiBusy(false);
      return;
    }

    setAiSaved(true);
    setAiBusy(false);
    setAiMessage("AI preference saved.");
  }

  const sourceDone = feedsCount > 0;
  const interestsDone = selectedCategories.length > 0 || starterAdded;
  const aiDone = aiSaved;
  const progressDone = [sourceDone, interestsDone, aiDone].filter(Boolean).length;
  const addMessageIsError =
    addMessage.startsWith("Could not") || addMessage.startsWith("OPML import failed");

  return (
    <section className="section-card onboarding-wizard">
      <div className="onboarding-header">
        <div>
          <h2 className="onboarding-title">Guided setup</h2>
          <p className="muted">
            Step {step} of 3. {progressDone}/3 checklist complete.
          </p>
        </div>
        <button type="button" className="button button-small" onClick={onDismiss}>
          Skip setup
        </button>
      </div>

      <div className="onboarding-grid">
        <div className="onboarding-main">
          {step === 1 ? (
            <div className="onboarding-step">
              <h3>1. Add your first source</h3>
              <p className="muted">
                Pick one way to start now. You can always use the other methods later in Sources.
              </p>

              <div className="onboarding-methods" role="tablist" aria-label="Source setup method">
                <button
                  type="button"
                  role="tab"
                  aria-selected={sourceMethod === "url"}
                  className={`onboarding-method ${sourceMethod === "url" ? "is-active" : ""}`}
                  onClick={() => setSourceMethod("url")}
                >
                  Feed URL
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sourceMethod === "opml"}
                  className={`onboarding-method ${sourceMethod === "opml" ? "is-active" : ""}`}
                  onClick={() => setSourceMethod("opml")}
                >
                  OPML import
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sourceMethod === "directory"}
                  className={`onboarding-method ${sourceMethod === "directory" ? "is-active" : ""}`}
                  onClick={() => setSourceMethod("directory")}
                >
                  Starter directory
                </button>
              </div>

              <div className="onboarding-card onboarding-method-shell">
                {sourceMethod === "url" ? (
                  <>
                    <label htmlFor="onboarding-feed-url">Feed URL</label>
                    <div className="onboarding-inline">
                      <input
                        id="onboarding-feed-url"
                        type="url"
                        className="input"
                        placeholder="https://example.com/feed.xml"
                        value={feedUrl}
                        onChange={(event) => setFeedUrl(event.target.value)}
                      />
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={handleAddFeed}
                        disabled={addBusy}
                      >
                        {addBusy ? "Adding..." : "Add feed"}
                      </button>
                    </div>
                  </>
                ) : null}

                {sourceMethod === "opml" ? (
                  <>
                    <label htmlFor="onboarding-opml">OPML import</label>
                    <div className="onboarding-inline">
                      <input
                        id="onboarding-opml"
                        ref={fileInputRef}
                        type="file"
                        accept=".opml,.xml"
                        className="input"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void handleImportOpml(file);
                          }
                        }}
                      />
                    </div>
                  </>
                ) : null}

                {sourceMethod === "directory" ? (
                  <>
                    <label>Starter directory</label>
                    <p className="muted">Explore curated feeds and subscribe with one click.</p>
                    <a href="/discover" className="button button-secondary">
                      Open Discover
                    </a>
                  </>
                ) : null}
              </div>

              {addMessage ? (
                <p className={addMessageIsError ? "error-text" : "muted"}>
                  {addMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="onboarding-step">
              <h3>2. Pick interests (optional)</h3>
              <p className="muted">
                Select topics you care about. Add starter feeds from those categories.
              </p>

              <div className="onboarding-chip-row" role="group" aria-label="Interest categories">
                {categories.map((category) => {
                  const active = selectedCategories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`button button-small ${active ? "button-active" : ""}`}
                      onClick={() => toggleCategory(category)}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>

              <div className="onboarding-inline">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleAddStarterFeeds}
                  disabled={starterBusy}
                >
                  {starterBusy ? "Adding..." : "Add starter feeds"}
                </button>
              </div>

              {starterMessage ? (
                <p className={starterMessage.startsWith("Pick ") ? "error-text" : "muted"}>
                  {starterMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="onboarding-step">
              <h3>3. Choose AI mode</h3>
              <p className="muted">
                AI is opt-in. You can change this any time in Settings.
              </p>

              <div className="onboarding-card">
                <label className="onboarding-radio">
                  <input
                    type="radio"
                    name="onboarding-ai-mode"
                    checked={aiModeChoice === "off"}
                    onChange={() => setAiModeChoice("off")}
                  />
                  <span>
                    <strong>Off</strong>
                    <span className="muted"> No summaries or AI digest generation.</span>
                  </span>
                </label>
                <label className="onboarding-radio">
                  <input
                    type="radio"
                    name="onboarding-ai-mode"
                    checked={aiModeChoice === "summaries_digest"}
                    onChange={() => setAiModeChoice("summaries_digest")}
                  />
                  <span>
                    <strong>Summaries + digest</strong>
                    <span className="muted"> Recommended default for daily use.</span>
                  </span>
                </label>
                <label className="onboarding-radio">
                  <input
                    type="radio"
                    name="onboarding-ai-mode"
                    checked={aiModeChoice === "full"}
                    onChange={() => setAiModeChoice("full")}
                  />
                  <span>
                    <strong>Full</strong>
                    <span className="muted"> Most aggressive enrichment and automation.</span>
                  </span>
                </label>
              </div>

              <div className="onboarding-inline">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleSaveAiMode}
                  disabled={aiBusy}
                >
                  {aiBusy ? "Saving..." : "Save AI preference"}
                </button>
              </div>

              {aiMessage ? (
                <p className={aiMessage.startsWith("Could not") ? "error-text" : "muted"}>
                  {aiMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={`onboarding-actions ${step === 1 ? "is-first-step" : ""}`}>
            {step > 1 ? (
              <button
                type="button"
                className="button button-small"
                onClick={() => setStep((prev) => (prev > 1 ? (prev - 1) as 1 | 2 | 3 : prev))}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="button button-small button-primary"
              onClick={() => setStep((prev) => (prev < 3 ? (prev + 1) as 1 | 2 | 3 : prev))}
              disabled={step === 3}
            >
              Next
            </button>
          </div>
        </div>

        <aside className="onboarding-checklist" aria-label="Getting started checklist">
          <h4>Getting started</h4>
          <p className="muted">You can skip anything and return later.</p>
          <ul>
            <li className={sourceDone ? "is-done" : ""}>
              <span>{sourceDone ? "Done" : "Pending"}</span>
              Add your first source
            </li>
            <li className={interestsDone ? "is-done" : ""}>
              <span>{interestsDone ? "Done" : "Optional"}</span>
              Pick interests
            </li>
            <li className={aiDone ? "is-done" : ""}>
              <span>{aiDone ? "Done" : "Pending"}</span>
              Set AI preference
            </li>
          </ul>
          {sourceDone && aiDone ? (
            <button type="button" className="button button-primary" onClick={onDismiss}>
              Finish setup
            </button>
          ) : null}
        </aside>
      </div>

      <style>{`
        .onboarding-wizard {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 1180px;
          margin: 0 auto;
          border: none;
          background: #d9dce3;
          border-color: var(--border-default);
          box-shadow: 0 2px 10px rgba(10, 10, 10, 0.04);
        }
        .onboarding-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .onboarding-title {
          margin: 0;
          font-size: 1.05rem;
        }
        .onboarding-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        .onboarding-main {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          padding: 0.9rem;
          box-shadow: 0 1px 0 rgba(10, 10, 10, 0.04);
        }
        .onboarding-step {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .onboarding-step h3 {
          margin: 0;
        }
        .onboarding-methods {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .onboarding-method {
          border: none;
          background: var(--bg-elevated);
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          padding: 0.35rem 0.6rem;
        }
        .onboarding-method:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .onboarding-method.is-active {
          color: var(--accent);
          background: var(--accent-dim);
        }
        .onboarding-card {
          border: none;
          background: var(--bg-elevated);
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .onboarding-method-shell {
          min-height: 142px;
          max-width: 980px;
        }
        .onboarding-inline {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .onboarding-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .onboarding-radio {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }
        .onboarding-actions {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .onboarding-actions.is-first-step {
          justify-content: flex-end;
        }
        .onboarding-checklist {
          border: 1px solid var(--border-default);
          background: var(--bg-surface);
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          box-shadow: 0 1px 0 rgba(10, 10, 10, 0.04);
        }
        .onboarding-checklist ul {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin: 0;
          padding: 0;
        }
        .onboarding-checklist li {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
        }
        .onboarding-checklist li span {
          font-family: var(--font-mono);
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-tertiary);
          border: 1px solid var(--border-default);
          padding: 2px 6px;
        }
        .onboarding-checklist li.is-done {
          color: var(--success);
        }
        .onboarding-checklist li.is-done span {
          color: var(--success);
          border-color: var(--success);
        }
        @media (min-width: 1024px) {
          .onboarding-grid {
            grid-template-columns: minmax(0, 1fr) 320px;
            align-items: start;
          }
          .onboarding-checklist {
            position: sticky;
            top: 1rem;
          }
        }
      `}</style>
    </section>
  );
}
