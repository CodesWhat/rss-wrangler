#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const DIRECTORY_PATH = path.resolve(
  process.cwd(),
  "apps/web/src/data/feed-directory.json"
);

function resolveSslConfig(connectionString) {
  if (connectionString.includes("sslmode=disable")) {
    return undefined;
  }
  if (
    connectionString.includes("sslmode=require") ||
    process.env.DATABASE_SSL === "true"
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[seed-directory] DATABASE_URL is not set");
    process.exit(1);
  }

  console.info("[seed-directory] reading feed directory file");
  const raw = await readFile(DIRECTORY_PATH, "utf8");
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries) || entries.length === 0) {
    console.error("[seed-directory] feed-directory.json is empty or not an array");
    process.exit(1);
  }

  console.info(`[seed-directory] found ${entries.length} entries`);

  const client = new Client({
    connectionString: databaseUrl,
    ssl: resolveSslConfig(databaseUrl),
  });

  console.info("[seed-directory] connecting to database");
  await client.connect();

  let inserted = 0;
  let updated = 0;
  let errored = 0;

  try {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const feedUrl = entry.url;
      const title = entry.name;
      const description = entry.description ?? null;
      const category = entry.category;
      const popularityRank = entry.popularity ?? null;

      if (!feedUrl || !title || !category) {
        console.warn(
          `[seed-directory] skipping entry ${i + 1}: missing url, name, or category`
        );
        errored++;
        continue;
      }

      try {
        const result = await client.query(
          `INSERT INTO feed_directory (feed_url, title, description, category, popularity_rank)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (feed_url) DO UPDATE SET
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             popularity_rank = EXCLUDED.popularity_rank
           RETURNING (xmax = 0) AS is_insert`,
          [feedUrl, title, description, category, popularityRank]
        );

        const isInsert = result.rows[0]?.is_insert;
        if (isInsert) {
          inserted++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(
          `[seed-directory] error upserting entry ${i + 1} (${feedUrl}):`,
          err instanceof Error ? err.message : String(err)
        );
        errored++;
      }
    }

    console.info(
      `[seed-directory] complete: ${inserted} inserted, ${updated} updated, ${errored} errored (${entries.length} total)`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    "[seed-directory] failed",
    error instanceof Error ? error.message : String(error)
  );
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
