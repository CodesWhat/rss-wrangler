#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

const filePath = process.argv[2];

if (!filePath) {
  console.error("[commit-msg] Missing commit message file path.");
  process.exit(1);
}

let raw = "";
try {
  raw = fs.readFileSync(filePath, "utf8");
} catch (error) {
  console.error(`[commit-msg] Failed to read commit message file: ${filePath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const subject = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.length > 0 && !line.startsWith("#"));

if (!subject) {
  console.error("[commit-msg] Commit subject is empty.");
  process.exit(1);
}

const allowedSpecialPrefixes = ["Merge ", "Revert ", "fixup! ", "squash! "];
if (allowedSpecialPrefixes.some((prefix) => subject.startsWith(prefix))) {
  process.exit(0);
}

const emojiToken =
  "(?:\\p{Extended_Pictographic}|:[a-z0-9_+-]+:)";
const commitPattern = new RegExp(
  `^(?:${emojiToken}\\s+)?phase([0-9]+)\\/([a-z0-9][a-z0-9-]*): (?:${emojiToken}\\s+)?([a-z0-9].+)$`,
  "u"
);
if (!commitPattern.test(subject)) {
  console.error("[commit-msg] Invalid commit message format.");
  console.error("[commit-msg] Required: phaseX/slice: intent");
  console.error("[commit-msg] Optional emoji prefix is allowed.");
  console.error("[commit-msg] Examples:");
  console.error("  phase0/tenant-core: scope read_state by tenant");
  console.error("  ✨ phase0/tenant-core: scope read_state by tenant");
  console.error("  phase1/reader-pane: 🚀 add text/original/feed toggle");
  console.error("  phase1/reader-pane: add text/original/feed mode toggle");
  console.error(`[commit-msg] Received: ${subject}`);
  process.exit(1);
}

if (subject.length > 100) {
  console.error("[commit-msg] Commit subject too long (max 100 chars).");
  console.error(`[commit-msg] Current length: ${subject.length}`);
  process.exit(1);
}

process.exit(0);
