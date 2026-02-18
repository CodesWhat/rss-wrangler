"use client";

import type { ReadingStats, StatsPeriod } from "@rss-wrangler/contracts";
import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { getReadingStats } from "@/lib/api";
import { cn } from "@/lib/cn";

function formatDwell(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function BarChart({
  items,
  maxValue,
}: {
  items: { label: string; value: number }[];
  maxValue?: number;
}) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="bar-chart">
      {items.map((item) => (
        <div key={item.label} className="bar-row">
          <span className="bar-label">{item.label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
          <span className="bar-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatsContent() {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>("7d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getReadingStats(period).then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, [period]);

  if (loading || !stats) {
    return <p className="muted">Loading stats...</p>;
  }

  const peakHoursFormatted = stats.peakHours.map((h) => ({
    label: `${h.hour.toString().padStart(2, "0")}:00`,
    value: h.count,
  }));
  const parseFormatItems = [
    { label: "RSS", value: stats.feedParseByFormat.rss },
    { label: "JSON Feed", value: stats.feedParseByFormat.json },
    { label: "Atom", value: stats.feedParseByFormat.atom },
    { label: "RDF", value: stats.feedParseByFormat.rdf },
  ];
  const parseFormatTotal = parseFormatItems.reduce((sum, item) => sum + item.value, 0);
  const autoReadPeriodLabel =
    period === "7d" ? "last 7d" : period === "30d" ? "last 30d" : "all time";

  return (
    <div className="settings-layout">
      <div className="page-header">
        <div className="row">
          <h1 className="page-title">Reading Stats</h1>
          <div className="sort-toggle">
            {(["7d", "30d", "all"] as StatsPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                className={cn("sort-btn", period === p && "active")}
                onClick={() => setPeriod(p)}
              >
                {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "All time"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="folder-grid">
        <section className="section-card">
          <div className="bar-value stat-value">{stats.articlesReadToday}</div>
          <div className="muted">Read today</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{stats.articlesReadWeek}</div>
          <div className="muted">This week</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{stats.articlesReadMonth}</div>
          <div className="muted">This month</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{stats.autoReadOnScrollCount}</div>
          <div className="muted">Auto-read (scroll, {autoReadPeriodLabel})</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{stats.autoReadOnOpenCount}</div>
          <div className="muted">Auto-read (open, {autoReadPeriodLabel})</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{stats.autoReadTotalCount}</div>
          <div className="muted">Auto-read total ({autoReadPeriodLabel})</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{stats.feedParseSuccessCount}</div>
          <div className="muted">Feed parses succeeded ({autoReadPeriodLabel})</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{stats.feedParseFailureCount}</div>
          <div className="muted">Feed parses failed ({autoReadPeriodLabel})</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{formatDwell(stats.avgDwellSeconds)}</div>
          <div className="muted">Avg. dwell time</div>
        </section>
        <section className="section-card">
          <div className="bar-value stat-value">{stats.readingStreak}</div>
          <div className="muted">Day streak</div>
        </section>
      </div>

      {/* Topic breakdown */}
      {stats.folderBreakdown.length > 0 && (
        <section className="section-card">
          <h2>Reading by topic</h2>
          <BarChart
            items={stats.folderBreakdown.map((f) => ({ label: f.folderName, value: f.count }))}
          />
        </section>
      )}

      {/* Top sources */}
      {stats.topSources.length > 0 && (
        <section className="section-card">
          <h2>Top sources</h2>
          <BarChart items={stats.topSources.map((s) => ({ label: s.feedTitle, value: s.count }))} />
        </section>
      )}

      {parseFormatTotal > 0 && (
        <section className="section-card">
          <h2>Feed parse formats ({autoReadPeriodLabel})</h2>
          <BarChart items={parseFormatItems} />
        </section>
      )}

      {/* Peak reading hours */}
      {peakHoursFormatted.length > 0 && (
        <section className="section-card">
          <h2>Peak reading hours</h2>
          <BarChart items={peakHoursFormatted} />
        </section>
      )}

      {/* Daily reads */}
      {stats.dailyReads.length > 0 && (
        <section className="section-card">
          <h2>Daily reads</h2>
          <BarChart items={stats.dailyReads.map((d) => ({ label: d.date, value: d.count }))} />
        </section>
      )}
    </div>
  );
}

export default function StatsPage() {
  return (
    <ProtectedRoute>
      <StatsContent />
    </ProtectedRoute>
  );
}
