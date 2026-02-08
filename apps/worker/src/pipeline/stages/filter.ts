import type { Pool } from "pg";

// Severity keywords that trigger breakout for muted content
const SEVERITY_KEYWORDS = [
  "hack", "hacked", "breach", "breached", "0day", "zero-day", "zeroday",
  "arrest", "arrested", "indictment", "doj", "cisa", "fbi",
  "state-backed", "state-sponsored", "nation-state",
  "outage", "down", "disruption", "ransomware", "exploit",
  "vulnerability", "critical", "emergency", "recall",
  "leak", "leaked", "data breach",
];

const SEVERITY_PATTERN = new RegExp(
  `\\b(${SEVERITY_KEYWORDS.join("|")})\\b`,
  "i"
);

interface FilterRule {
  id: string;
  pattern: string;
  type: "phrase" | "regex";
  mode: "mute" | "block";
  breakoutEnabled: boolean;
}

interface ItemForFilter {
  itemId: string;
  title: string;
  summary: string | null;
}

interface FilterResult {
  action: "pass" | "hidden" | "breakout_shown";
  ruleId: string | null;
  breakoutReason: string | null;
}

/**
 * Pre-filter soft gate: check items against filter rules using title + summary.
 * Muted items are NOT dropped -- they are tagged so they can still participate
 * in clustering and breakout checks.
 *
 * Returns a map of itemId -> FilterResult.
 */
export async function preFilterSoftGate(
  pool: Pool,
  tenantId: string,
  items: ItemForFilter[]
): Promise<Map<string, FilterResult>> {
  const rules = await loadFilterRules(pool, tenantId);
  const results = new Map<string, FilterResult>();

  for (const item of items) {
    const text = `${item.title} ${item.summary || ""}`;
    const matchResult = matchRules(rules, text);

    if (!matchResult) {
      results.set(item.itemId, { action: "pass", ruleId: null, breakoutReason: null });
    } else if (matchResult.mode === "block") {
      results.set(item.itemId, { action: "hidden", ruleId: matchResult.ruleId, breakoutReason: null });
    } else {
      // Muted: keep for now, will check breakout after clustering
      results.set(item.itemId, { action: "hidden", ruleId: matchResult.ruleId, breakoutReason: null });
    }
  }

  return results;
}

/**
 * Post-cluster filter with breakout logic.
 * For each cluster that contains muted items, check breakout conditions:
 * 1. Severity keywords in representative's title/summary
 * 2. Source is in high-reputation list (feed weight = 'prefer')
 * 3. Cluster size >= N outlets within 24h (default N=4)
 */
export async function postClusterFilter(
  pool: Pool,
  tenantId: string,
  clusterIds: string[]
): Promise<void> {
  if (clusterIds.length === 0) return;

  const rules = await loadFilterRules(pool, tenantId);
  if (rules.length === 0) return;

  for (const clusterId of clusterIds) {
    await processClusterFilter(pool, tenantId, clusterId, rules);
  }
}

async function processClusterFilter(
  pool: Pool,
  tenantId: string,
  clusterId: string,
  rules: FilterRule[]
): Promise<void> {
  // Get the cluster representative and members
  const clusterInfo = await pool.query<{
    rep_title: string;
    rep_summary: string | null;
    rep_feed_weight: string;
    size: number;
  }>(
    `SELECT i.title AS rep_title, i.summary AS rep_summary, f.weight AS rep_feed_weight, c.size
     FROM cluster c
     JOIN item i ON i.id = c.rep_item_id
     JOIN feed f ON f.id = i.feed_id
     WHERE c.id = $1
       AND c.tenant_id = $2`,
    [clusterId, tenantId]
  );

  const info = clusterInfo.rows[0];
  if (!info) return;

  const repText = `${info.rep_title} ${info.rep_summary || ""}`;
  const matchResult = matchRules(rules, repText);

  if (!matchResult) return; // No filter match on representative
  if (matchResult.mode === "block") {
    // Hard block: record hidden event
    await recordFilterEvent(pool, tenantId, matchResult.ruleId, clusterId, "hidden");
    return;
  }

  // Mute mode: check breakout conditions
  if (!matchResult.breakoutEnabled) {
    await recordFilterEvent(pool, tenantId, matchResult.ruleId, clusterId, "hidden");
    return;
  }

  const breakoutReason = checkBreakout(repText, info.rep_feed_weight, info.size);

  if (breakoutReason) {
    await recordFilterEvent(pool, tenantId, matchResult.ruleId, clusterId, "breakout_shown");
    console.info("[filter] breakout triggered", {
      clusterId,
      ruleId: matchResult.ruleId,
      reason: breakoutReason,
    });
  } else {
    await recordFilterEvent(pool, tenantId, matchResult.ruleId, clusterId, "hidden");
  }
}

function checkBreakout(
  text: string,
  feedWeight: string,
  clusterSize: number
): string | null {
  // Condition 1: Severity keywords
  const severityMatch = SEVERITY_PATTERN.exec(text);
  if (severityMatch) {
    return `severity_keyword:${severityMatch[1]}`;
  }

  // Condition 2: High reputation source
  if (feedWeight === "prefer") {
    return "high_reputation_source";
  }

  // Condition 3: Cluster size >= 4 (multi-outlet coverage)
  if (clusterSize >= 4) {
    return `cluster_size:${clusterSize}`;
  }

  return null;
}

function matchRules(
  rules: FilterRule[],
  text: string
): { ruleId: string; mode: "mute" | "block"; breakoutEnabled: boolean } | null {
  const lowerText = text.toLowerCase();

  for (const rule of rules) {
    let matched = false;

    if (rule.type === "phrase") {
      matched = lowerText.includes(rule.pattern.toLowerCase());
    } else if (rule.type === "regex") {
      try {
        const re = new RegExp(rule.pattern, "i");
        matched = re.test(text);
      } catch {
        // Invalid regex, skip
        console.warn("[filter] invalid regex pattern", { ruleId: rule.id, pattern: rule.pattern });
      }
    }

    if (matched) {
      return { ruleId: rule.id, mode: rule.mode, breakoutEnabled: rule.breakoutEnabled };
    }
  }

  return null;
}

async function loadFilterRules(pool: Pool, tenantId: string): Promise<FilterRule[]> {
  const result = await pool.query<{
    id: string;
    pattern: string;
    type: "phrase" | "regex";
    mode: "mute" | "block";
    breakout_enabled: boolean;
  }>(
    `SELECT id, pattern, type, mode, breakout_enabled
     FROM filter_rule
     WHERE tenant_id = $1`,
    [tenantId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    type: r.type,
    mode: r.mode,
    breakoutEnabled: r.breakout_enabled,
  }));
}

async function recordFilterEvent(
  pool: Pool,
  tenantId: string,
  ruleId: string,
  clusterId: string,
  action: "hidden" | "breakout_shown"
): Promise<void> {
  await pool.query(
    `INSERT INTO filter_event (tenant_id, rule_id, cluster_id, action) VALUES ($1, $2, $3, $4)`,
    [tenantId, ruleId, clusterId, action]
  );
}
