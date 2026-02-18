import type { Pool } from "pg";

// Severity keywords that trigger breakout for muted content
const SEVERITY_KEYWORDS = [
  "hack",
  "hacked",
  "breach",
  "breached",
  "0day",
  "zero-day",
  "zeroday",
  "arrest",
  "arrested",
  "indictment",
  "doj",
  "cisa",
  "fbi",
  "state-backed",
  "state-sponsored",
  "nation-state",
  "outage",
  "down",
  "disruption",
  "ransomware",
  "exploit",
  "vulnerability",
  "critical",
  "emergency",
  "recall",
  "leak",
  "leaked",
  "data breach",
];

const SEVERITY_PATTERN = new RegExp(`\\b(${SEVERITY_KEYWORDS.join("|")})\\b`, "i");

/** Maximum length for a regex pattern to guard against ReDoS. */
const MAX_REGEX_LENGTH = 500;

/** Timeout for regex execution in milliseconds (best-effort via source length cap). */
const MAX_REGEX_SOURCE_LENGTH = 100_000;

type FilterTarget = "keyword" | "author" | "domain" | "url_pattern";
type FilterType = "phrase" | "regex";
type FilterMode = "mute" | "block" | "keep";

interface FilterRule {
  id: string;
  pattern: string;
  target: FilterTarget;
  type: FilterType;
  mode: FilterMode;
  breakoutEnabled: boolean;
  feedId: string | null;
  folderId: string | null;
}

export interface ItemForFilter {
  itemId: string;
  title: string;
  summary: string | null;
  author: string | null;
  url: string | null;
  feedId: string | null;
  folderId: string | null;
}

interface FilterResult {
  action: "pass" | "hidden" | "breakout_shown";
  ruleId: string | null;
  breakoutReason: string | null;
}

/**
 * Extract domain from a URL string.
 * Returns lowercase hostname or empty string on failure.
 */
function extractDomain(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Check if a rule's scope matches the item's feed/folder.
 * A rule with null feedId/folderId is global (matches everything).
 */
function ruleMatchesScope(rule: FilterRule, item: ItemForFilter): boolean {
  if (rule.feedId && rule.feedId !== item.feedId) return false;
  if (rule.folderId && rule.folderId !== item.folderId) return false;
  return true;
}

/**
 * Get the text to match against based on the filter target.
 */
function getTargetText(target: FilterTarget, item: ItemForFilter): string {
  switch (target) {
    case "keyword":
      return `${item.title} ${item.summary || ""}`;
    case "author":
      return item.author || "";
    case "domain":
      return extractDomain(item.url);
    case "url_pattern":
      return item.url || "";
  }
}

/**
 * Safe regex test: validates pattern length and truncates input
 * to prevent ReDoS.
 */
function safeRegexTest(pattern: string, text: string): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) {
    console.warn("[filter] regex pattern too long, skipping", { length: pattern.length });
    return false;
  }
  const safeText =
    text.length > MAX_REGEX_SOURCE_LENGTH ? text.slice(0, MAX_REGEX_SOURCE_LENGTH) : text;
  try {
    const re = new RegExp(pattern, "i");
    return re.test(safeText);
  } catch {
    return false;
  }
}

/**
 * Test whether a single rule matches the given text.
 */
function patternMatches(rule: FilterRule, text: string): boolean {
  if (rule.type === "phrase") {
    return text.toLowerCase().includes(rule.pattern.toLowerCase());
  }
  // regex
  return safeRegexTest(rule.pattern, text);
}

/**
 * Pre-filter soft gate: check items against filter rules.
 * Muted items are NOT dropped -- they are tagged so they can still participate
 * in clustering and breakout checks.
 *
 * Keep/allow mode: if any `keep` filters apply to an item's scope,
 * the item must match at least one to pass. Non-matching items are hidden.
 *
 * Returns a map of itemId -> FilterResult.
 */
export async function preFilterSoftGate(
  pool: Pool,
  accountId: string,
  items: ItemForFilter[],
): Promise<Map<string, FilterResult>> {
  const rules = await loadFilterRules(pool, accountId);
  const results = new Map<string, FilterResult>();

  // Separate keep rules from mute/block rules
  const keepRules = rules.filter((r) => r.mode === "keep");
  const muteBlockRules = rules.filter((r) => r.mode !== "keep");

  for (const item of items) {
    // --- Keep/allow mode ---
    // Find keep rules that are in scope for this item
    const scopedKeepRules = keepRules.filter((r) => ruleMatchesScope(r, item));

    if (scopedKeepRules.length > 0) {
      // At least one keep rule exists for this scope.
      // The item must match at least one to pass through.
      const matchesAnyKeep = scopedKeepRules.some((rule) => {
        const text = getTargetText(rule.target, item);
        return patternMatches(rule, text);
      });

      if (!matchesAnyKeep) {
        // Item does not match any keep filter in its scope -- hide it
        results.set(item.itemId, {
          action: "hidden",
          ruleId: scopedKeepRules[0]?.id ?? null,
          breakoutReason: null,
        });
        continue;
      }
    }

    // --- Standard mute/block matching ---
    const matchResult = matchRulesForItem(muteBlockRules, item);

    if (!matchResult) {
      results.set(item.itemId, { action: "pass", ruleId: null, breakoutReason: null });
    } else if (matchResult.mode === "block") {
      results.set(item.itemId, {
        action: "hidden",
        ruleId: matchResult.ruleId,
        breakoutReason: null,
      });
    } else {
      // Muted: keep for now, will check breakout after clustering
      results.set(item.itemId, {
        action: "hidden",
        ruleId: matchResult.ruleId,
        breakoutReason: null,
      });
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
  accountId: string,
  clusterIds: string[],
): Promise<void> {
  if (clusterIds.length === 0) return;

  const rules = await loadFilterRules(pool, accountId);
  if (rules.length === 0) return;

  for (const clusterId of clusterIds) {
    await processClusterFilter(pool, accountId, clusterId, rules);
  }
}

async function processClusterFilter(
  pool: Pool,
  accountId: string,
  clusterId: string,
  rules: FilterRule[],
): Promise<void> {
  // Get the cluster representative and members
  const clusterInfo = await pool.query<{
    rep_title: string;
    rep_summary: string | null;
    rep_author: string | null;
    rep_url: string | null;
    rep_feed_id: string | null;
    rep_folder_id: string | null;
    rep_feed_weight: string;
    size: number;
  }>(
    `SELECT i.title AS rep_title, i.summary AS rep_summary,
            i.author AS rep_author, i.url AS rep_url,
            i.feed_id AS rep_feed_id, f.folder_id AS rep_folder_id,
            f.weight AS rep_feed_weight, c.size
     FROM cluster c
     JOIN item i ON i.id = c.rep_item_id
     JOIN feed f ON f.id = i.feed_id
     WHERE c.id = $1
       AND c.tenant_id = $2`,
    [clusterId, accountId],
  );

  const info = clusterInfo.rows[0];
  if (!info) return;

  const repItem: ItemForFilter = {
    itemId: clusterId,
    title: info.rep_title,
    summary: info.rep_summary,
    author: info.rep_author,
    url: info.rep_url,
    feedId: info.rep_feed_id,
    folderId: info.rep_folder_id,
  };

  // Only use mute/block rules for post-cluster filtering (keep rules handled in pre-filter)
  const muteBlockRules = rules.filter((r) => r.mode !== "keep");
  const matchResult = matchRulesForItem(muteBlockRules, repItem);

  if (!matchResult) return; // No filter match on representative
  if (matchResult.mode === "block") {
    // Hard block: record hidden event
    await recordFilterEvent(pool, accountId, matchResult.ruleId, clusterId, "hidden");
    return;
  }

  // Mute mode: check breakout conditions
  if (!matchResult.breakoutEnabled) {
    await recordFilterEvent(pool, accountId, matchResult.ruleId, clusterId, "hidden");
    return;
  }

  const repText = `${info.rep_title} ${info.rep_summary || ""}`;
  const breakoutReason = checkBreakout(repText, info.rep_feed_weight, info.size);

  if (breakoutReason) {
    await recordFilterEvent(pool, accountId, matchResult.ruleId, clusterId, "breakout_shown");
    console.info("[filter] breakout triggered", {
      clusterId,
      ruleId: matchResult.ruleId,
      reason: breakoutReason,
    });
  } else {
    await recordFilterEvent(pool, accountId, matchResult.ruleId, clusterId, "hidden");
  }
}

function checkBreakout(text: string, feedWeight: string, clusterSize: number): string | null {
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

/**
 * Match mute/block rules against a single item, considering target type and scope.
 */
function matchRulesForItem(
  rules: FilterRule[],
  item: ItemForFilter,
): { ruleId: string; mode: "mute" | "block"; breakoutEnabled: boolean } | null {
  for (const rule of rules) {
    // Skip rules that don't apply to this item's scope
    if (!ruleMatchesScope(rule, item)) continue;

    const text = getTargetText(rule.target, item);
    if (patternMatches(rule, text)) {
      return {
        ruleId: rule.id,
        mode: rule.mode as "mute" | "block",
        breakoutEnabled: rule.breakoutEnabled,
      };
    }
  }

  return null;
}

async function loadFilterRules(pool: Pool, accountId: string): Promise<FilterRule[]> {
  const result = await pool.query<{
    id: string;
    pattern: string;
    target: string | null;
    type: "phrase" | "regex";
    mode: "mute" | "block" | "keep";
    breakout_enabled: boolean;
    feed_id: string | null;
    folder_id: string | null;
  }>(
    `SELECT id, pattern, target, type, mode, breakout_enabled, feed_id, folder_id
     FROM filter_rule
     WHERE tenant_id = $1`,
    [accountId],
  );

  return result.rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    target: (r.target as FilterTarget) ?? "keyword",
    type: r.type,
    mode: r.mode,
    breakoutEnabled: r.breakout_enabled,
    feedId: r.feed_id ?? null,
    folderId: r.folder_id ?? null,
  }));
}

async function recordFilterEvent(
  pool: Pool,
  accountId: string,
  ruleId: string,
  clusterId: string,
  action: "hidden" | "breakout_shown",
): Promise<void> {
  await pool.query(
    `INSERT INTO filter_event (tenant_id, rule_id, cluster_id, action) VALUES ($1, $2, $3, $4)`,
    [accountId, ruleId, clusterId, action],
  );
}
