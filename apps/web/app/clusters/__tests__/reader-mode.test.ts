import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ReaderMode = "feed" | "original" | "text";
type StoryTextSource = "extracted_full_text" | "summary_fallback" | "unavailable";

const READER_MODE_STORAGE_KEY = "reader-mode-default";
const VALID_READER_MODES: ReadonlySet<string> = new Set(["feed", "original", "text"]);

function getStoredReaderMode(): ReaderMode | null {
  try {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(READER_MODE_STORAGE_KEY);
    if (stored && VALID_READER_MODES.has(stored)) {
      return stored as ReaderMode;
    }
  } catch {
    return null;
  }
  return null;
}

function setStoredReaderMode(mode: ReaderMode): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(READER_MODE_STORAGE_KEY, mode);
  } catch {
    // noop
  }
}

function resolveReaderMode(
  perFeedDefault: ReaderMode | null,
  storedDefault: ReaderMode | null,
  storyTextSource: StoryTextSource,
): ReaderMode {
  const fallback = storyTextSource === "unavailable" ? "feed" : "text";
  return perFeedDefault ?? storedDefault ?? fallback;
}

const localStorageStore: Record<string, string> = {};
let localStorageMock: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  for (const key of Object.keys(localStorageStore)) {
    delete localStorageStore[key];
  }

  localStorageMock = {
    getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageStore[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageStore[key];
    }),
  };

  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("localStorage", localStorageMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveReaderMode", () => {
  it("uses per-feed default when set", () => {
    expect(resolveReaderMode("original", "text", "extracted_full_text")).toBe("original");
  });

  it("falls back to localStorage last-used mode when no per-feed default", () => {
    expect(resolveReaderMode(null, "text", "extracted_full_text")).toBe("text");
  });

  it("falls back to text mode when extracted text available and no preferences", () => {
    expect(resolveReaderMode(null, null, "extracted_full_text")).toBe("text");
  });

  it("falls back to text mode when summary fallback and no preferences", () => {
    expect(resolveReaderMode(null, null, "summary_fallback")).toBe("text");
  });

  it("falls back to feed mode when text source is unavailable and no preferences", () => {
    expect(resolveReaderMode(null, null, "unavailable")).toBe("feed");
  });

  it("per-feed default overrides localStorage even when localStorage is set", () => {
    expect(resolveReaderMode("feed", "original", "extracted_full_text")).toBe("feed");
  });

  it("per-feed default overrides extraction-state fallback", () => {
    expect(resolveReaderMode("text", null, "unavailable")).toBe("text");
  });

  it("localStorage overrides extraction-state fallback", () => {
    expect(resolveReaderMode(null, "original", "unavailable")).toBe("original");
  });
});

describe("getStoredReaderMode", () => {
  it("returns null when nothing stored", () => {
    expect(getStoredReaderMode()).toBeNull();
  });

  it("returns stored mode when valid", () => {
    localStorageStore[READER_MODE_STORAGE_KEY] = "original";
    expect(getStoredReaderMode()).toBe("original");
  });

  it("returns null for invalid stored value", () => {
    localStorageStore[READER_MODE_STORAGE_KEY] = "invalid-mode";
    expect(getStoredReaderMode()).toBeNull();
  });

  it("returns null for empty stored value", () => {
    localStorageStore[READER_MODE_STORAGE_KEY] = "";
    expect(getStoredReaderMode()).toBeNull();
  });

  it("handles localStorage throwing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("access denied");
      },
    });
    expect(getStoredReaderMode()).toBeNull();
  });
});

describe("setStoredReaderMode", () => {
  it("writes mode to localStorage", () => {
    setStoredReaderMode("text");
    expect(localStorageStore[READER_MODE_STORAGE_KEY]).toBe("text");
  });

  it("overwrites previous mode", () => {
    setStoredReaderMode("feed");
    setStoredReaderMode("original");
    expect(localStorageStore[READER_MODE_STORAGE_KEY]).toBe("original");
  });

  it("survives localStorage throwing", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    expect(() => setStoredReaderMode("text")).not.toThrow();
  });
});

describe("text mode availability", () => {
  it("resolves to feed when no extracted text available and no preferences", () => {
    const mode = resolveReaderMode(null, null, "unavailable");
    expect(mode).toBe("feed");
  });

  it("resolves to text when extracted text available and no preferences", () => {
    const mode = resolveReaderMode(null, null, "extracted_full_text");
    expect(mode).toBe("text");
  });

  it("resolves to text when summary fallback available and no preferences", () => {
    const mode = resolveReaderMode(null, null, "summary_fallback");
    expect(mode).toBe("text");
  });
});
