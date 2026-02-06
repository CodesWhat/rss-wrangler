import { getSettings } from "@/lib/api";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <section className="section-card">
      <h1>Settings</h1>
      <ul className="list">
        <li>AI mode: {settings.aiMode}</li>
        <li>Provider: {settings.aiProvider}</li>
        <li>Monthly cap: ${settings.monthlyAiCapUsd}</li>
        <li>Fallback to local: {settings.aiFallbackToLocal ? "enabled" : "disabled"}</li>
        <li>Digest away trigger: {settings.digestAwayHours}h</li>
        <li>Digest backlog trigger: {settings.digestBacklogThreshold} clusters</li>
        <li>Feed poll interval: {settings.feedPollMinutes} minutes</li>
      </ul>
    </section>
  );
}
