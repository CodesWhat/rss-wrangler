"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { getReadingStats } from "@/lib/api";
import type { ReadingStats, StatsPeriod } from "@rss-wrangler/contracts";

function formatDwell(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function BarChart({ items, labelKey, valueKey, maxValue }: {
  items: { label: string; value: number }[];
  labelKey?: string;
  valueKey?: string;
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
    value: h.count
  }));

  return (
    <div className="settings-layout">
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Reading Stats</h1>
        <div className="sort-toggle">
          {(["7d", "30d", "all"] as StatsPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`button button-small${period === p ? " button-active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "All time"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <section className="section-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{stats.articlesReadToday}</div>
          <div className="muted">Read today</div>
        </section>
        <section className="section-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{stats.articlesReadWeek}</div>
          <div className="muted">This week</div>
        </section>
        <section className="section-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{stats.articlesReadMonth}</div>
          <div className="muted">This month</div>
        </section>
        <section className="section-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{formatDwell(stats.avgDwellSeconds)}</div>
          <div className="muted">Avg. dwell time</div>
        </section>
        <section className="section-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{stats.readingStreak}</div>
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
          <BarChart
            items={stats.topSources.map((s) => ({ label: s.feedTitle, value: s.count }))}
          />
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
          <BarChart
            items={stats.dailyReads.map((d) => ({ label: d.date, value: d.count }))}
          />
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
