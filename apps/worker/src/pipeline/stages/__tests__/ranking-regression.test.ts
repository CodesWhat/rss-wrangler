import { describe, expect, it } from "vitest";

type FeedWeight = "prefer" | "neutral" | "deprioritize";

interface RankingInput {
  ageHours: number;
  isSaved: boolean;
  clusterSize: number;
  feedWeight: FeedWeight;
  dwellSeconds: number;
  clicked: boolean;
  notInterested: boolean;
  topicAffinityScore: number;
  folderAffinityScore: number;
  topicUnreadCount: number;
  explorationEligible: boolean;
}

interface RankingFactors {
  recency: number;
  saved: number;
  clusterSize: number;
  sourceWeight: number;
  engagement: number;
  topicAffinity: number;
  folderAffinity: number;
  diversityPenalty: number;
  explorationBoost: number;
  finalScore: number;
}

function computeRecency(ageHours: number): number {
  return 1.0 / Math.max(1, ageHours);
}

function computeSaved(isSaved: boolean): number {
  return isSaved ? 0.5 : 0;
}

function computeClusterSize(size: number): number {
  return Math.min(size / 10.0, 1);
}

function computeSourceWeight(weight: FeedWeight): number {
  if (weight === "prefer") return 0.3;
  if (weight === "deprioritize") return -0.3;
  return 0;
}

function computeEngagement(dwellSeconds: number, clicked: boolean, notInterested: boolean): number {
  const dwellPart = Math.min(dwellSeconds / 120.0, 0.25);
  const clickPart = clicked ? 0.15 : 0;
  const notInterestedPart = notInterested ? -2.5 : 0;
  return dwellPart + clickPart + notInterestedPart;
}

function computeTopicAffinity(raw: number): number {
  return Math.min(Math.max(raw, -0.35), 0.35);
}

function computeFolderAffinity(raw: number): number {
  return Math.min(Math.max(raw, -0.25), 0.25);
}

function computeDiversityPenalty(topicUnreadCount: number): number {
  return -Math.min(Math.max(topicUnreadCount - 3, 0) * 0.05, 0.35);
}

function computeExplorationBoost(eligible: boolean): number {
  return eligible ? 0.22 : 0;
}

function computeRanking(input: RankingInput): RankingFactors {
  const recency = computeRecency(input.ageHours);
  const saved = computeSaved(input.isSaved);
  const clusterSize = computeClusterSize(input.clusterSize);
  const sourceWeight = computeSourceWeight(input.feedWeight);
  const engagement = computeEngagement(input.dwellSeconds, input.clicked, input.notInterested);
  const topicAffinity = computeTopicAffinity(input.topicAffinityScore);
  const folderAffinity = computeFolderAffinity(input.folderAffinityScore);
  const diversityPenalty = computeDiversityPenalty(input.topicUnreadCount);
  const explorationBoost = computeExplorationBoost(input.explorationEligible);

  const finalScore =
    recency +
    saved +
    clusterSize +
    sourceWeight +
    engagement +
    topicAffinity +
    folderAffinity +
    diversityPenalty +
    explorationBoost;

  return {
    recency,
    saved,
    clusterSize,
    sourceWeight,
    engagement,
    topicAffinity,
    folderAffinity,
    diversityPenalty,
    explorationBoost,
    finalScore,
  };
}

function makeInput(overrides: Partial<RankingInput> = {}): RankingInput {
  return {
    ageHours: 1,
    isSaved: false,
    clusterSize: 1,
    feedWeight: "neutral",
    dwellSeconds: 0,
    clicked: false,
    notInterested: false,
    topicAffinityScore: 0,
    folderAffinityScore: 0,
    topicUnreadCount: 0,
    explorationEligible: false,
    ...overrides,
  };
}

function rankByScore(inputs: RankingInput[]): RankingFactors[] {
  return inputs.map((i) => computeRanking(i)).sort((a, b) => b.finalScore - a.finalScore);
}

describe("ranking formula: individual factors", () => {
  it("recency decays inversely with age in hours", () => {
    expect(computeRecency(1)).toBe(1.0);
    expect(computeRecency(2)).toBe(0.5);
    expect(computeRecency(10)).toBeCloseTo(0.1);
    expect(computeRecency(100)).toBeCloseTo(0.01);
  });

  it("recency floors at 1 for sub-hour ages", () => {
    expect(computeRecency(0)).toBe(1.0);
    expect(computeRecency(0.5)).toBe(1.0);
  });

  it("saved items get a flat 0.5 bonus", () => {
    expect(computeSaved(true)).toBe(0.5);
    expect(computeSaved(false)).toBe(0);
  });

  it("cluster size scales linearly up to cap of 1.0 at size 10", () => {
    expect(computeClusterSize(1)).toBeCloseTo(0.1);
    expect(computeClusterSize(5)).toBeCloseTo(0.5);
    expect(computeClusterSize(10)).toBeCloseTo(1.0);
    expect(computeClusterSize(20)).toBeCloseTo(1.0);
  });

  it("source weight maps prefer to +0.3 and deprioritize to -0.3", () => {
    expect(computeSourceWeight("prefer")).toBe(0.3);
    expect(computeSourceWeight("neutral")).toBe(0);
    expect(computeSourceWeight("deprioritize")).toBe(-0.3);
  });

  it("engagement accumulates dwell, click, and not-interested signals", () => {
    expect(computeEngagement(0, false, false)).toBe(0);
    expect(computeEngagement(120, false, false)).toBeCloseTo(0.25);
    expect(computeEngagement(240, false, false)).toBeCloseTo(0.25);
    expect(computeEngagement(0, true, false)).toBe(0.15);
    expect(computeEngagement(0, false, true)).toBe(-2.5);
    expect(computeEngagement(120, true, false)).toBeCloseTo(0.4);
  });

  it("topic affinity is clamped to [-0.35, 0.35]", () => {
    expect(computeTopicAffinity(0)).toBe(0);
    expect(computeTopicAffinity(0.2)).toBeCloseTo(0.2);
    expect(computeTopicAffinity(1.0)).toBeCloseTo(0.35);
    expect(computeTopicAffinity(-1.0)).toBeCloseTo(-0.35);
  });

  it("folder affinity is clamped to [-0.25, 0.25]", () => {
    expect(computeFolderAffinity(0)).toBe(0);
    expect(computeFolderAffinity(0.1)).toBeCloseTo(0.1);
    expect(computeFolderAffinity(0.5)).toBeCloseTo(0.25);
    expect(computeFolderAffinity(-0.5)).toBeCloseTo(-0.25);
  });

  it("diversity penalty starts at 0 for <= 3 unread in topic", () => {
    expect(computeDiversityPenalty(0)).toBeCloseTo(0);
    expect(computeDiversityPenalty(1)).toBeCloseTo(0);
    expect(computeDiversityPenalty(3)).toBeCloseTo(0);
  });

  it("diversity penalty grows at -0.05 per excess item above 3, capped at -0.35", () => {
    expect(computeDiversityPenalty(4)).toBeCloseTo(-0.05);
    expect(computeDiversityPenalty(6)).toBeCloseTo(-0.15);
    expect(computeDiversityPenalty(10)).toBeCloseTo(-0.35);
    expect(computeDiversityPenalty(100)).toBeCloseTo(-0.35);
  });

  it("exploration boost is 0.22 when eligible, 0 otherwise", () => {
    expect(computeExplorationBoost(true)).toBe(0.22);
    expect(computeExplorationBoost(false)).toBe(0);
  });
});

describe("ranking formula: final score composition", () => {
  it("baseline neutral item at 1 hour age has predictable score", () => {
    const result = computeRanking(makeInput());
    expect(result.recency).toBe(1.0);
    expect(result.saved).toBe(0);
    expect(result.clusterSize).toBeCloseTo(0.1);
    expect(result.sourceWeight).toBe(0);
    expect(result.engagement).toBe(0);
    expect(result.topicAffinity).toBe(0);
    expect(result.folderAffinity).toBe(0);
    expect(result.diversityPenalty).toBeCloseTo(0);
    expect(result.explorationBoost).toBe(0);
    expect(result.finalScore).toBeCloseTo(1.1);
  });

  it("final score is the sum of all individual factors", () => {
    const input = makeInput({
      ageHours: 2,
      isSaved: true,
      clusterSize: 5,
      feedWeight: "prefer",
      dwellSeconds: 60,
      clicked: true,
      notInterested: false,
      topicAffinityScore: 0.2,
      folderAffinityScore: 0.1,
      topicUnreadCount: 5,
      explorationEligible: false,
    });
    const r = computeRanking(input);
    const expectedSum =
      r.recency +
      r.saved +
      r.clusterSize +
      r.sourceWeight +
      r.engagement +
      r.topicAffinity +
      r.folderAffinity +
      r.diversityPenalty +
      r.explorationBoost;
    expect(r.finalScore).toBeCloseTo(expectedSum);
  });
});

describe("ranking regression: recency bias", () => {
  it("newer items rank higher than older items, all else equal", () => {
    const newer = makeInput({ ageHours: 1 });
    const older = makeInput({ ageHours: 24 });
    const ranked = rankByScore([older, newer]);
    expect(ranked[0]!.recency).toBeGreaterThan(ranked[1]!.recency);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("a 1-hour-old item scores higher than a 48-hour-old item", () => {
    const fresh = computeRanking(makeInput({ ageHours: 1 }));
    const stale = computeRanking(makeInput({ ageHours: 48 }));
    expect(fresh.finalScore).toBeGreaterThan(stale.finalScore);
    expect(fresh.recency - stale.recency).toBeGreaterThan(0.9);
  });
});

describe("ranking regression: source weight boost", () => {
  it("prefer-weight items rank higher than neutral items, all else equal", () => {
    const preferred = makeInput({ feedWeight: "prefer" });
    const neutral = makeInput({ feedWeight: "neutral" });
    const ranked = rankByScore([neutral, preferred]);
    expect(ranked[0]!.sourceWeight).toBe(0.3);
    expect(ranked[1]!.sourceWeight).toBe(0);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("source weight boost is exactly +0.3 over neutral baseline", () => {
    const preferred = computeRanking(makeInput({ feedWeight: "prefer" }));
    const neutral = computeRanking(makeInput({ feedWeight: "neutral" }));
    expect(preferred.finalScore - neutral.finalScore).toBeCloseTo(0.3);
  });
});

describe("ranking regression: source weight penalty", () => {
  it("deprioritized items rank lower than neutral items", () => {
    const deprioritized = makeInput({ feedWeight: "deprioritize" });
    const neutral = makeInput({ feedWeight: "neutral" });
    const ranked = rankByScore([deprioritized, neutral]);
    expect(ranked[0]!.sourceWeight).toBe(0);
    expect(ranked[1]!.sourceWeight).toBe(-0.3);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("source weight penalty is exactly -0.3 from neutral baseline", () => {
    const deprioritized = computeRanking(makeInput({ feedWeight: "deprioritize" }));
    const neutral = computeRanking(makeInput({ feedWeight: "neutral" }));
    expect(neutral.finalScore - deprioritized.finalScore).toBeCloseTo(0.3);
  });

  it("prefer-weight items always outrank deprioritize-weight items by 0.6", () => {
    const preferred = computeRanking(makeInput({ feedWeight: "prefer" }));
    const deprioritized = computeRanking(makeInput({ feedWeight: "deprioritize" }));
    expect(preferred.finalScore - deprioritized.finalScore).toBeCloseTo(0.6);
  });
});

describe("ranking regression: cluster size boost", () => {
  it("larger clusters rank higher than smaller clusters", () => {
    const large = makeInput({ clusterSize: 8 });
    const small = makeInput({ clusterSize: 1 });
    const ranked = rankByScore([small, large]);
    expect(ranked[0]!.clusterSize).toBeGreaterThan(ranked[1]!.clusterSize);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("cluster size factor difference between 8-article and 1-article cluster is 0.7", () => {
    const large = computeRanking(makeInput({ clusterSize: 8 }));
    const small = computeRanking(makeInput({ clusterSize: 1 }));
    expect(large.clusterSize - small.clusterSize).toBeCloseTo(0.7);
  });

  it("cluster size caps at size 10 with no additional benefit beyond that", () => {
    const at10 = computeRanking(makeInput({ clusterSize: 10 }));
    const at20 = computeRanking(makeInput({ clusterSize: 20 }));
    expect(at10.clusterSize).toBe(at20.clusterSize);
    expect(at10.finalScore).toBe(at20.finalScore);
  });
});

describe("ranking regression: diversity penalty", () => {
  it("topics with 3 or fewer unread items get no penalty", () => {
    const noPenalty = computeRanking(makeInput({ topicUnreadCount: 3 }));
    expect(noPenalty.diversityPenalty).toBeCloseTo(0);
  });

  it("topics with many unread items are penalized to reduce topic dominance", () => {
    const heavy = makeInput({ topicUnreadCount: 10 });
    const light = makeInput({ topicUnreadCount: 2 });
    const ranked = rankByScore([heavy, light]);
    expect(ranked[0]!.diversityPenalty).toBeCloseTo(0);
    expect(ranked[1]!.diversityPenalty).toBeLessThan(0);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("penalty is bounded at -0.35 even for extreme unread counts", () => {
    const extreme = computeRanking(makeInput({ topicUnreadCount: 1000 }));
    expect(extreme.diversityPenalty).toBeCloseTo(-0.35);
  });
});

describe("ranking regression: topic affinity", () => {
  it("items matching preferred topics rank higher", () => {
    const highAffinity = makeInput({ topicAffinityScore: 0.3 });
    const noAffinity = makeInput({ topicAffinityScore: 0 });
    const ranked = rankByScore([noAffinity, highAffinity]);
    expect(ranked[0]!.topicAffinity).toBeGreaterThan(ranked[1]!.topicAffinity);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("negative topic affinity penalizes items from disliked topics", () => {
    const disliked = computeRanking(makeInput({ topicAffinityScore: -0.3 }));
    const neutral = computeRanking(makeInput({ topicAffinityScore: 0 }));
    expect(disliked.finalScore).toBeLessThan(neutral.finalScore);
  });
});

describe("ranking regression: deterministic stability", () => {
  it("same input produces identical ranking order across 3 runs", () => {
    const inputs = [
      makeInput({ ageHours: 2, feedWeight: "prefer", clusterSize: 5 }),
      makeInput({ ageHours: 1, feedWeight: "neutral", clusterSize: 1 }),
      makeInput({ ageHours: 10, feedWeight: "deprioritize", clusterSize: 3 }),
      makeInput({ ageHours: 4, feedWeight: "neutral", clusterSize: 8, topicAffinityScore: 0.25 }),
      makeInput({ ageHours: 1, feedWeight: "neutral", clusterSize: 1, topicUnreadCount: 20 }),
    ];

    const run1 = rankByScore(inputs).map((r) => r.finalScore);
    const run2 = rankByScore(inputs).map((r) => r.finalScore);
    const run3 = rankByScore(inputs).map((r) => r.finalScore);

    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });

  it("ranking order is stable when items have distinct scores", () => {
    const inputs = [
      makeInput({ ageHours: 100, feedWeight: "deprioritize" }),
      makeInput({ ageHours: 1, feedWeight: "prefer", clusterSize: 10 }),
      makeInput({ ageHours: 5, feedWeight: "neutral", clusterSize: 3 }),
    ];

    const ranked = rankByScore(inputs);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
    expect(ranked[1]!.finalScore).toBeGreaterThan(ranked[2]!.finalScore);
  });

  it("scores are identical for identical inputs regardless of array position", () => {
    const a = computeRanking(makeInput({ ageHours: 3, feedWeight: "prefer" }));
    const b = computeRanking(makeInput({ ageHours: 3, feedWeight: "prefer" }));
    expect(a.finalScore).toBe(b.finalScore);
    expect(a).toEqual(b);
  });
});

describe("ranking regression: breakout override preserves visibility", () => {
  it("severity keyword in title triggers breakout_shown for muted items", () => {
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

    function checkBreakout(text: string, feedWeight: string, clusterSize: number): string | null {
      const severityMatch = SEVERITY_PATTERN.exec(text);
      if (severityMatch) return `severity_keyword:${severityMatch[1]}`;
      if (feedWeight === "prefer") return "high_reputation_source";
      if (clusterSize >= 4) return `cluster_size:${clusterSize}`;
      return null;
    }

    expect(checkBreakout("Critical vulnerability discovered", "neutral", 1)).toBe(
      "severity_keyword:Critical",
    );
    expect(checkBreakout("Major data breach at company", "neutral", 1)).toBe(
      "severity_keyword:data breach",
    );
    expect(checkBreakout("Ransomware hits hospital", "neutral", 1)).toBe(
      "severity_keyword:Ransomware",
    );
  });

  it("high reputation source triggers breakout even without severity keywords", () => {
    function checkBreakout(text: string, feedWeight: string, clusterSize: number): string | null {
      const SEVERITY_KEYWORDS = ["hack", "breach", "vulnerability", "critical", "ransomware"];
      const SEVERITY_PATTERN = new RegExp(`\\b(${SEVERITY_KEYWORDS.join("|")})\\b`, "i");
      const severityMatch = SEVERITY_PATTERN.exec(text);
      if (severityMatch) return `severity_keyword:${severityMatch[1]}`;
      if (feedWeight === "prefer") return "high_reputation_source";
      if (clusterSize >= 4) return `cluster_size:${clusterSize}`;
      return null;
    }

    expect(checkBreakout("routine news about sports", "prefer", 1)).toBe("high_reputation_source");
  });

  it("large cluster size triggers breakout for muted content", () => {
    function checkBreakout(text: string, feedWeight: string, clusterSize: number): string | null {
      const SEVERITY_KEYWORDS = ["hack", "breach", "vulnerability", "critical", "ransomware"];
      const SEVERITY_PATTERN = new RegExp(`\\b(${SEVERITY_KEYWORDS.join("|")})\\b`, "i");
      const severityMatch = SEVERITY_PATTERN.exec(text);
      if (severityMatch) return `severity_keyword:${severityMatch[1]}`;
      if (feedWeight === "prefer") return "high_reputation_source";
      if (clusterSize >= 4) return `cluster_size:${clusterSize}`;
      return null;
    }

    expect(checkBreakout("mundane topic", "neutral", 4)).toBe("cluster_size:4");
    expect(checkBreakout("mundane topic", "neutral", 8)).toBe("cluster_size:8");
  });

  it("breakout is not triggered without severity, reputation, or cluster size", () => {
    function checkBreakout(text: string, feedWeight: string, clusterSize: number): string | null {
      const SEVERITY_KEYWORDS = ["hack", "breach", "vulnerability", "critical", "ransomware"];
      const SEVERITY_PATTERN = new RegExp(`\\b(${SEVERITY_KEYWORDS.join("|")})\\b`, "i");
      const severityMatch = SEVERITY_PATTERN.exec(text);
      if (severityMatch) return `severity_keyword:${severityMatch[1]}`;
      if (feedWeight === "prefer") return "high_reputation_source";
      if (clusterSize >= 4) return `cluster_size:${clusterSize}`;
      return null;
    }

    expect(checkBreakout("mundane topic discussed", "neutral", 2)).toBeNull();
    expect(checkBreakout("mundane topic discussed", "deprioritize", 1)).toBeNull();
  });
});

describe("ranking regression: combined factor interactions", () => {
  it("preferred source with old age can outrank neutral source with recent age", () => {
    const oldPreferred = makeInput({ ageHours: 3, feedWeight: "prefer", clusterSize: 10 });
    const freshNeutral = makeInput({ ageHours: 1, feedWeight: "neutral", clusterSize: 1 });
    const rOld = computeRanking(oldPreferred);
    const rFresh = computeRanking(freshNeutral);
    expect(rOld.finalScore).toBeGreaterThan(rFresh.finalScore);
  });

  it("saved item with old age outranks unsaved fresh item", () => {
    const oldSaved = makeInput({ ageHours: 10, isSaved: true });
    const freshUnsaved = makeInput({ ageHours: 2 });
    const rOld = computeRanking(oldSaved);
    const rFresh = computeRanking(freshUnsaved);
    expect(rOld.finalScore).toBeGreaterThan(rFresh.finalScore);
  });

  it("not-interested penalty (-2.5) overwhelms moderate positive signals", () => {
    const notInterested = makeInput({
      ageHours: 1,
      feedWeight: "neutral",
      clusterSize: 1,
      notInterested: true,
    });
    const baseline = makeInput({ ageHours: 1, feedWeight: "neutral", clusterSize: 1 });
    const rNot = computeRanking(notInterested);
    const rBase = computeRanking(baseline);
    expect(rNot.engagement).toBe(-2.5);
    expect(rNot.finalScore).toBeLessThan(0);
    expect(rNot.finalScore).toBeLessThan(rBase.finalScore);
  });

  it("exploration boost can push unseen neutral items above slightly older items", () => {
    const explored = makeInput({ ageHours: 2, explorationEligible: true });
    const similar = makeInput({ ageHours: 2, explorationEligible: false });
    const rExplored = computeRanking(explored);
    const rSimilar = computeRanking(similar);
    expect(rExplored.finalScore - rSimilar.finalScore).toBeCloseTo(0.22);
  });

  it("full ranking of 6 items with mixed signals produces expected order", () => {
    const items: Array<{ label: string; input: RankingInput }> = [
      {
        label: "fresh-preferred-big-cluster",
        input: makeInput({ ageHours: 1, feedWeight: "prefer", clusterSize: 8 }),
      },
      {
        label: "fresh-neutral-small",
        input: makeInput({ ageHours: 1, feedWeight: "neutral", clusterSize: 1 }),
      },
      {
        label: "old-preferred-saved",
        input: makeInput({ ageHours: 12, feedWeight: "prefer", isSaved: true, clusterSize: 3 }),
      },
      {
        label: "medium-high-topic-affinity",
        input: makeInput({ ageHours: 3, topicAffinityScore: 0.35, clusterSize: 4 }),
      },
      {
        label: "fresh-deprioritized",
        input: makeInput({ ageHours: 1, feedWeight: "deprioritize", clusterSize: 1 }),
      },
      { label: "stale-not-interested", input: makeInput({ ageHours: 48, notInterested: true }) },
    ];

    const ranked = items
      .map((i) => ({ label: i.label, score: computeRanking(i.input).finalScore }))
      .sort((a, b) => b.score - a.score);

    expect(ranked[0]!.label).toBe("fresh-preferred-big-cluster");
    expect(ranked[ranked.length - 1]!.label).toBe("stale-not-interested");

    const scores = ranked.map((r) => r.score);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]!);
    }
  });
});

// ─── Engagement signal regression ─────────────────────────────────────────

describe("ranking regression: engagement signal boosting", () => {
  it("dwell time boosts ranking proportional to seconds spent", () => {
    const longDwell = makeInput({ dwellSeconds: 120 });
    const shortDwell = makeInput({ dwellSeconds: 20 });
    const noDwell = makeInput({ dwellSeconds: 0 });
    const ranked = rankByScore([noDwell, shortDwell, longDwell]);
    expect(ranked[0]!.engagement).toBeGreaterThan(ranked[1]!.engagement);
    expect(ranked[1]!.engagement).toBeGreaterThan(ranked[2]!.engagement);
  });

  it("dwell time caps at 0.25 regardless of how long the user dwells", () => {
    const r120 = computeRanking(makeInput({ dwellSeconds: 120 }));
    const r600 = computeRanking(makeInput({ dwellSeconds: 600 }));
    expect(r120.engagement).toBeCloseTo(0.25);
    expect(r600.engagement).toBeCloseTo(0.25);
    expect(r120.finalScore).toBeCloseTo(r600.finalScore);
  });

  it("click signal adds exactly 0.15 to engagement", () => {
    const clicked = computeRanking(makeInput({ clicked: true }));
    const notClicked = computeRanking(makeInput({ clicked: false }));
    expect(clicked.engagement - notClicked.engagement).toBeCloseTo(0.15);
    expect(clicked.finalScore - notClicked.finalScore).toBeCloseTo(0.15);
  });

  it("dwell + click stack additively up to 0.4 max engagement", () => {
    const maxEngagement = computeRanking(makeInput({ dwellSeconds: 120, clicked: true }));
    expect(maxEngagement.engagement).toBeCloseTo(0.4);
  });

  it("clicked item outranks unclicked item at same age", () => {
    const clicked = makeInput({ ageHours: 2, clicked: true });
    const notClicked = makeInput({ ageHours: 2, clicked: false });
    const ranked = rankByScore([notClicked, clicked]);
    expect(ranked[0]!.engagement).toBeGreaterThan(ranked[1]!.engagement);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("moderate dwell on older item can close gap with fresh no-engagement item", () => {
    const olderEngaged = computeRanking(
      makeInput({ ageHours: 3, dwellSeconds: 120, clicked: true }),
    );
    const freshNoEngagement = computeRanking(makeInput({ ageHours: 2 }));
    // Engagement factor (0.4) should narrow the recency gap (0.5 - 0.333 = ~0.167)
    expect(olderEngaged.engagement).toBeCloseTo(0.4);
    expect(olderEngaged.finalScore).toBeGreaterThan(freshNoEngagement.finalScore);
  });
});

// ─── Folder affinity regression ───────────────────────────────────────────

describe("ranking regression: folder affinity", () => {
  it("items in high-affinity folders rank higher than neutral folder items", () => {
    const highFolder = makeInput({ folderAffinityScore: 0.2 });
    const neutralFolder = makeInput({ folderAffinityScore: 0 });
    const ranked = rankByScore([neutralFolder, highFolder]);
    expect(ranked[0]!.folderAffinity).toBeGreaterThan(ranked[1]!.folderAffinity);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("negative folder affinity penalizes items from disliked folders", () => {
    const disliked = computeRanking(makeInput({ folderAffinityScore: -0.2 }));
    const neutral = computeRanking(makeInput({ folderAffinityScore: 0 }));
    expect(disliked.finalScore).toBeLessThan(neutral.finalScore);
    expect(disliked.folderAffinity).toBeCloseTo(-0.2);
  });

  it("folder affinity clamp prevents scores outside [-0.25, 0.25]", () => {
    const extreme = computeRanking(makeInput({ folderAffinityScore: 999 }));
    const negExtreme = computeRanking(makeInput({ folderAffinityScore: -999 }));
    expect(extreme.folderAffinity).toBeCloseTo(0.25);
    expect(negExtreme.folderAffinity).toBeCloseTo(-0.25);
    expect(extreme.folderAffinity - negExtreme.folderAffinity).toBeCloseTo(0.5);
  });

  it("folder and topic affinity stack for items in a preferred topic within a preferred folder", () => {
    const both = computeRanking(makeInput({ topicAffinityScore: 0.3, folderAffinityScore: 0.2 }));
    const topicOnly = computeRanking(
      makeInput({ topicAffinityScore: 0.3, folderAffinityScore: 0 }),
    );
    const folderOnly = computeRanking(
      makeInput({ topicAffinityScore: 0, folderAffinityScore: 0.2 }),
    );
    expect(both.finalScore).toBeGreaterThan(topicOnly.finalScore);
    expect(both.finalScore).toBeGreaterThan(folderOnly.finalScore);
    expect(both.finalScore - topicOnly.finalScore).toBeCloseTo(0.2);
  });
});

// ─── Dismiss suppression regression ───────────────────────────────────────

describe("ranking regression: dismiss suppression", () => {
  it("not-interested signal sinks item to negative score territory", () => {
    const dismissed = computeRanking(makeInput({ notInterested: true }));
    expect(dismissed.finalScore).toBeLessThan(0);
  });

  it("not-interested penalty of -2.5 overwhelms prefer weight + saved + big cluster combined", () => {
    const dismissedWithBoosts = computeRanking(
      makeInput({
        notInterested: true,
        feedWeight: "prefer",
        isSaved: true,
        clusterSize: 10,
      }),
    );
    // prefer(0.3) + saved(0.5) + cluster(1.0) + recency(1.0) = 2.8, minus 2.5 = 0.3
    // Still positive but much lower than baseline of 1.1
    const baseline = computeRanking(makeInput());
    expect(dismissedWithBoosts.finalScore).toBeLessThan(baseline.finalScore);
  });

  it("dismissed items always rank below equivalent non-dismissed items", () => {
    const dismissed = makeInput({ ageHours: 1, feedWeight: "prefer", notInterested: true });
    const notDismissed = makeInput({ ageHours: 24, feedWeight: "deprioritize" });
    const ranked = rankByScore([dismissed, notDismissed]);
    expect(ranked[0]!.engagement).toBe(0);
    expect(ranked[1]!.engagement).toBe(-2.5);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("dismiss penalty is exactly -2.5 from engagement baseline", () => {
    const dismissed = computeRanking(makeInput({ notInterested: true }));
    const notDismissed = computeRanking(makeInput({ notInterested: false }));
    expect(notDismissed.engagement - dismissed.engagement).toBeCloseTo(2.5);
  });

  it("dismiss penalty persists even with maximum positive engagement", () => {
    const dismissedAndEngaged = computeRanking(
      makeInput({
        notInterested: true,
        dwellSeconds: 120,
        clicked: true,
      }),
    );
    // dwell(0.25) + click(0.15) + notInterested(-2.5) = -2.1
    expect(dismissedAndEngaged.engagement).toBeCloseTo(-2.1);
    expect(dismissedAndEngaged.finalScore).toBeLessThan(0);
  });
});

// ─── Exploration quota regression ─────────────────────────────────────────

describe("ranking regression: exploration quota", () => {
  it("exploration-eligible items rank above otherwise-identical ineligible items by 0.22", () => {
    const eligible = computeRanking(makeInput({ explorationEligible: true }));
    const ineligible = computeRanking(makeInput({ explorationEligible: false }));
    expect(eligible.finalScore - ineligible.finalScore).toBeCloseTo(0.22);
  });

  it("exploration boost is not large enough to overcome source weight prefer advantage", () => {
    const explored = computeRanking(
      makeInput({ explorationEligible: true, feedWeight: "neutral" }),
    );
    const preferred = computeRanking(
      makeInput({ explorationEligible: false, feedWeight: "prefer" }),
    );
    // exploration(0.22) vs prefer(0.3) — prefer wins
    expect(preferred.finalScore).toBeGreaterThan(explored.finalScore);
  });

  it("exploration boost can overcome deprioritize penalty", () => {
    const explored = computeRanking(
      makeInput({ explorationEligible: true, feedWeight: "deprioritize" }),
    );
    const noExplore = computeRanking(
      makeInput({ explorationEligible: false, feedWeight: "deprioritize" }),
    );
    expect(explored.finalScore).toBeGreaterThan(noExplore.finalScore);
    // But still below neutral baseline
    const neutral = computeRanking(makeInput({ feedWeight: "neutral" }));
    expect(explored.finalScore).toBeLessThan(neutral.finalScore);
  });

  it("exploration boost stacks with topic affinity", () => {
    const both = computeRanking(makeInput({ explorationEligible: true, topicAffinityScore: 0.2 }));
    const affinityOnly = computeRanking(
      makeInput({ explorationEligible: false, topicAffinityScore: 0.2 }),
    );
    const exploreOnly = computeRanking(
      makeInput({ explorationEligible: true, topicAffinityScore: 0 }),
    );
    expect(both.finalScore).toBeGreaterThan(affinityOnly.finalScore);
    expect(both.finalScore).toBeGreaterThan(exploreOnly.finalScore);
  });
});

// ─── Seeded multi-item regression snapshot ────────────────────────────────

describe("ranking regression: seeded 10-item snapshot", () => {
  const seededItems: Array<{ label: string; input: RankingInput }> = [
    {
      label: "A-fresh-prefer-big",
      input: makeInput({
        ageHours: 1,
        feedWeight: "prefer",
        clusterSize: 10,
        dwellSeconds: 60,
        clicked: true,
        topicAffinityScore: 0.2,
        folderAffinityScore: 0.1,
      }),
    },
    {
      label: "B-fresh-neutral-small",
      input: makeInput({ ageHours: 1, feedWeight: "neutral", clusterSize: 1 }),
    },
    {
      label: "C-medium-saved",
      input: makeInput({ ageHours: 6, feedWeight: "neutral", clusterSize: 3, isSaved: true }),
    },
    {
      label: "D-old-prefer-saved",
      input: makeInput({
        ageHours: 24,
        feedWeight: "prefer",
        clusterSize: 5,
        isSaved: true,
        topicAffinityScore: 0.15,
      }),
    },
    {
      label: "E-fresh-deprioritize",
      input: makeInput({ ageHours: 1, feedWeight: "deprioritize", clusterSize: 2 }),
    },
    {
      label: "F-medium-explored",
      input: makeInput({
        ageHours: 4,
        feedWeight: "neutral",
        clusterSize: 1,
        explorationEligible: true,
      }),
    },
    {
      label: "G-stale-big-cluster",
      input: makeInput({ ageHours: 48, feedWeight: "neutral", clusterSize: 10 }),
    },
    {
      label: "H-heavy-topic-penalty",
      input: makeInput({
        ageHours: 2,
        feedWeight: "neutral",
        clusterSize: 3,
        topicUnreadCount: 15,
      }),
    },
    {
      label: "I-dismiss-fresh",
      input: makeInput({ ageHours: 1, feedWeight: "neutral", clusterSize: 1, notInterested: true }),
    },
    {
      label: "J-dismiss-prefer",
      input: makeInput({ ageHours: 1, feedWeight: "prefer", clusterSize: 10, notInterested: true }),
    },
  ];

  it("produces a deterministic ordering across multiple runs", () => {
    const run1 = seededItems
      .map((i) => ({ label: i.label, score: computeRanking(i.input).finalScore }))
      .sort((a, b) => b.score - a.score);
    const run2 = seededItems
      .map((i) => ({ label: i.label, score: computeRanking(i.input).finalScore }))
      .sort((a, b) => b.score - a.score);

    expect(run1.map((r) => r.label)).toEqual(run2.map((r) => r.label));
    expect(run1.map((r) => r.score)).toEqual(run2.map((r) => r.score));
  });

  it("top-ranked item is the fresh preferred big cluster with engagement", () => {
    const ranked = seededItems
      .map((i) => ({ label: i.label, score: computeRanking(i.input).finalScore }))
      .sort((a, b) => b.score - a.score);
    expect(ranked[0]!.label).toBe("A-fresh-prefer-big");
  });

  it("dismissed items always rank at the bottom regardless of other boosts", () => {
    const ranked = seededItems
      .map((i) => ({ label: i.label, score: computeRanking(i.input).finalScore }))
      .sort((a, b) => b.score - a.score);
    const bottomTwo = ranked
      .slice(-2)
      .map((r) => r.label)
      .sort();
    expect(bottomTwo).toContain("I-dismiss-fresh");
    expect(bottomTwo).toContain("J-dismiss-prefer");
  });

  it("saved items get meaningful boost vs unsaved at same age", () => {
    const savedScore = computeRanking(
      seededItems.find((i) => i.label === "C-medium-saved")!.input,
    ).finalScore;
    const unsavedEquiv = computeRanking(
      makeInput({ ageHours: 6, feedWeight: "neutral", clusterSize: 3, isSaved: false }),
    ).finalScore;
    expect(savedScore - unsavedEquiv).toBeCloseTo(0.5);
  });

  it("stale big cluster outranks explored small due to cluster size dominance", () => {
    const exploredScore = computeRanking(
      seededItems.find((i) => i.label === "F-medium-explored")!.input,
    ).finalScore;
    const staleScore = computeRanking(
      seededItems.find((i) => i.label === "G-stale-big-cluster")!.input,
    ).finalScore;
    // cluster size (1.0) on the stale item overwhelms exploration boost (0.22)
    // even though the explored item is much fresher (4h vs 48h)
    expect(staleScore).toBeGreaterThan(exploredScore);
  });
});

// ─── Auto-read settings model ─────────────────────────────────────────────

type MarkReadMode = "off" | "on_scroll" | "on_open";

interface AutoReadSettings {
  markReadOnScroll: MarkReadMode;
  markReadOnScrollListDelayMs: number;
  markReadOnScrollCompactDelayMs: number;
  markReadOnScrollCardDelayMs: number;
  markReadOnScrollListThreshold: number;
  markReadOnScrollCompactThreshold: number;
  markReadOnScrollCardThreshold: number;
  markReadOnScrollFeedOverrides: Record<
    string,
    {
      mode?: MarkReadMode;
      delayMs?: number;
      threshold?: number;
    }
  >;
}

type ViewMode = "list" | "compact" | "card";

function resolveAutoReadForFeed(
  settings: AutoReadSettings,
  feedId: string | null,
  viewMode: ViewMode,
): { mode: MarkReadMode; delayMs: number; threshold: number } {
  const override = feedId ? settings.markReadOnScrollFeedOverrides[feedId] : undefined;

  const mode = override?.mode ?? settings.markReadOnScroll;

  let delayMs: number;
  let threshold: number;
  if (viewMode === "list") {
    delayMs = override?.delayMs ?? settings.markReadOnScrollListDelayMs;
    threshold = override?.threshold ?? settings.markReadOnScrollListThreshold;
  } else if (viewMode === "compact") {
    delayMs = override?.delayMs ?? settings.markReadOnScrollCompactDelayMs;
    threshold = override?.threshold ?? settings.markReadOnScrollCompactThreshold;
  } else {
    delayMs = override?.delayMs ?? settings.markReadOnScrollCardDelayMs;
    threshold = override?.threshold ?? settings.markReadOnScrollCardThreshold;
  }

  return { mode, delayMs, threshold };
}

function makeAutoReadSettings(overrides: Partial<AutoReadSettings> = {}): AutoReadSettings {
  return {
    markReadOnScroll: "off",
    markReadOnScrollListDelayMs: 1500,
    markReadOnScrollCompactDelayMs: 1500,
    markReadOnScrollCardDelayMs: 1500,
    markReadOnScrollListThreshold: 0.6,
    markReadOnScrollCompactThreshold: 0.6,
    markReadOnScrollCardThreshold: 0.6,
    markReadOnScrollFeedOverrides: {},
    ...overrides,
  };
}

describe("auto-read: mode resolution", () => {
  it("defaults to off when no overrides", () => {
    const settings = makeAutoReadSettings();
    const result = resolveAutoReadForFeed(settings, null, "list");
    expect(result.mode).toBe("off");
  });

  it("uses global on_scroll mode when enabled", () => {
    const settings = makeAutoReadSettings({ markReadOnScroll: "on_scroll" });
    const result = resolveAutoReadForFeed(settings, "feed-1", "list");
    expect(result.mode).toBe("on_scroll");
  });

  it("uses global on_open mode when enabled", () => {
    const settings = makeAutoReadSettings({ markReadOnScroll: "on_open" });
    const result = resolveAutoReadForFeed(settings, "feed-1", "card");
    expect(result.mode).toBe("on_open");
  });

  it("per-feed override takes precedence over global mode", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollFeedOverrides: {
        "feed-A": { mode: "off" },
        "feed-B": { mode: "on_open" },
      },
    });
    expect(resolveAutoReadForFeed(settings, "feed-A", "list").mode).toBe("off");
    expect(resolveAutoReadForFeed(settings, "feed-B", "list").mode).toBe("on_open");
    expect(resolveAutoReadForFeed(settings, "feed-C", "list").mode).toBe("on_scroll");
  });

  it("null feedId falls back to global settings", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollFeedOverrides: { "feed-A": { mode: "off" } },
    });
    const result = resolveAutoReadForFeed(settings, null, "list");
    expect(result.mode).toBe("on_scroll");
  });
});

describe("auto-read: per-view threshold tuning", () => {
  it("list view uses list threshold", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollListThreshold: 0.7,
      markReadOnScrollCompactThreshold: 0.5,
      markReadOnScrollCardThreshold: 0.3,
    });
    expect(resolveAutoReadForFeed(settings, "feed-1", "list").threshold).toBeCloseTo(0.7);
  });

  it("compact view uses compact threshold", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollListThreshold: 0.7,
      markReadOnScrollCompactThreshold: 0.5,
      markReadOnScrollCardThreshold: 0.3,
    });
    expect(resolveAutoReadForFeed(settings, "feed-1", "compact").threshold).toBeCloseTo(0.5);
  });

  it("card view uses card threshold", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollListThreshold: 0.7,
      markReadOnScrollCompactThreshold: 0.5,
      markReadOnScrollCardThreshold: 0.3,
    });
    expect(resolveAutoReadForFeed(settings, "feed-1", "card").threshold).toBeCloseTo(0.3);
  });
});

describe("auto-read: per-view delay tuning", () => {
  it("list view uses list delay", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollListDelayMs: 2000,
      markReadOnScrollCompactDelayMs: 1000,
      markReadOnScrollCardDelayMs: 500,
    });
    expect(resolveAutoReadForFeed(settings, "feed-1", "list").delayMs).toBe(2000);
  });

  it("compact view uses compact delay", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollListDelayMs: 2000,
      markReadOnScrollCompactDelayMs: 1000,
      markReadOnScrollCardDelayMs: 500,
    });
    expect(resolveAutoReadForFeed(settings, "feed-1", "compact").delayMs).toBe(1000);
  });

  it("card view uses card delay", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollListDelayMs: 2000,
      markReadOnScrollCompactDelayMs: 1000,
      markReadOnScrollCardDelayMs: 500,
    });
    expect(resolveAutoReadForFeed(settings, "feed-1", "card").delayMs).toBe(500);
  });
});

describe("auto-read: per-feed override of threshold and delay", () => {
  it("feed override threshold takes precedence over view-specific threshold", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollListThreshold: 0.6,
      markReadOnScrollFeedOverrides: {
        "feed-A": { threshold: 0.9 },
      },
    });
    expect(resolveAutoReadForFeed(settings, "feed-A", "list").threshold).toBeCloseTo(0.9);
    expect(resolveAutoReadForFeed(settings, "feed-B", "list").threshold).toBeCloseTo(0.6);
  });

  it("feed override delay takes precedence over view-specific delay", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollCardDelayMs: 1500,
      markReadOnScrollFeedOverrides: {
        "feed-A": { delayMs: 3000 },
      },
    });
    expect(resolveAutoReadForFeed(settings, "feed-A", "card").delayMs).toBe(3000);
    expect(resolveAutoReadForFeed(settings, "feed-B", "card").delayMs).toBe(1500);
  });

  it("feed override can set mode, delay, and threshold independently", () => {
    const settings = makeAutoReadSettings({
      markReadOnScroll: "on_scroll",
      markReadOnScrollListDelayMs: 1500,
      markReadOnScrollListThreshold: 0.6,
      markReadOnScrollFeedOverrides: {
        "feed-A": { mode: "on_open" },
        "feed-B": { delayMs: 500 },
        "feed-C": { threshold: 0.8 },
      },
    });
    const a = resolveAutoReadForFeed(settings, "feed-A", "list");
    expect(a.mode).toBe("on_open");
    expect(a.delayMs).toBe(1500);
    expect(a.threshold).toBeCloseTo(0.6);

    const b = resolveAutoReadForFeed(settings, "feed-B", "list");
    expect(b.mode).toBe("on_scroll");
    expect(b.delayMs).toBe(500);
    expect(b.threshold).toBeCloseTo(0.6);

    const c = resolveAutoReadForFeed(settings, "feed-C", "list");
    expect(c.mode).toBe("on_scroll");
    expect(c.delayMs).toBe(1500);
    expect(c.threshold).toBeCloseTo(0.8);
  });
});

describe("auto-read: scroll threshold behavior", () => {
  function shouldMarkRead(
    visibleFraction: number,
    threshold: number,
    dwellMs: number,
    delayMs: number,
    mode: MarkReadMode,
  ): boolean {
    if (mode === "off") return false;
    if (mode === "on_open") return true;
    // on_scroll: check intersection threshold + delay
    return visibleFraction >= threshold && dwellMs >= delayMs;
  }

  it("does not mark read when mode is off", () => {
    expect(shouldMarkRead(1.0, 0.6, 5000, 1500, "off")).toBe(false);
  });

  it("marks read immediately in on_open mode regardless of scroll position", () => {
    expect(shouldMarkRead(0, 0.6, 0, 1500, "on_open")).toBe(true);
    expect(shouldMarkRead(0.1, 0.9, 0, 5000, "on_open")).toBe(true);
  });

  it("does not mark read when visibility is below threshold", () => {
    expect(shouldMarkRead(0.3, 0.6, 5000, 1500, "on_scroll")).toBe(false);
  });

  it("does not mark read when dwell time is below delay", () => {
    expect(shouldMarkRead(0.8, 0.6, 500, 1500, "on_scroll")).toBe(false);
  });

  it("marks read when both threshold and delay are met", () => {
    expect(shouldMarkRead(0.7, 0.6, 2000, 1500, "on_scroll")).toBe(true);
  });

  it("marks read at exact threshold boundary", () => {
    expect(shouldMarkRead(0.6, 0.6, 1500, 1500, "on_scroll")).toBe(true);
  });

  it("does not mark read when visibility is just below threshold", () => {
    expect(shouldMarkRead(0.59, 0.6, 5000, 1500, "on_scroll")).toBe(false);
  });

  it("zero delay means mark read as soon as threshold is met", () => {
    expect(shouldMarkRead(0.8, 0.6, 0, 0, "on_scroll")).toBe(true);
  });
});
