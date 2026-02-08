#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");
const ADVISORY_LOCK_ID = 947552319;

function resolveSslConfig(connectionString) {
  if (connectionString.includes("sslmode=disable")) {
    return undefined;
  }

  if (connectionString.includes("sslmode=require") || process.env.DATABASE_SSL === "true") {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: resolveSslConfig(databaseUrl)
  });

  console.info("[migrate] connecting to database");
  await client.connect();

  try {
    console.info("[migrate] acquiring advisory lock");
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_ID]);

    const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.info("[migrate] no migration files found");
      return;
    }

    console.info("[migrate] applying migrations", { count: files.length });

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = await readFile(filePath, "utf8");
      if (sql.trim().length === 0) {
        continue;
      }
      console.info(`[migrate] applying ${file}`);
      await client.query(sql);
    }

    console.info("[migrate] migration pass complete");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]);
    } catch {
      // Best effort unlock on shutdown/error.
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed", error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
