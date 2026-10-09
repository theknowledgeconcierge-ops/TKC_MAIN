import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const provided = process.env.TEST_DATABASE_URL;
const directory = mkdtempSync(join(tmpdir(), "tkc-pg-"));
const bin = process.env.PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited ${result.status}`);
}
let started = false;
try {
  const port = 24000 + Math.floor(Math.random() * 15000);
  const url = provided ?? `postgresql://postgres@127.0.0.1:${port}/postgres`;
  if (!provided) {
    run(join(bin, "initdb"), [
      "-D",
      directory,
      "-U",
      "postgres",
      "-A",
      "trust",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    run(join(bin, "pg_ctl"), [
      "-D",
      directory,
      "-l",
      join(directory, "server.log"),
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-w",
      "start",
    ]);
    started = true;
    const bootstrap = join(directory, "bootstrap.sql");
    writeFileSync(
      bootstrap,
      "create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects(id uuid primary key, bucket_id text); alter table storage.objects enable row level security;",
    );
    run(join(bin, "psql"), [url, "-v", "ON_ERROR_STOP=1", "-f", bootstrap]);
  }
  // Only use TEST_DATABASE_URL with an isolated test database, never production.
  run(provided ? "psql" : join(bin, "psql"), [
    url,
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "supabase/migrations/202610090001_storefront.sql",
  ]);
  run("node", ["node_modules/vitest/vitest.mjs", "run", "tests/database"], {
    ...process.env,
    TEST_DATABASE_URL: url,
  });
} finally {
  if (started)
    spawnSync(
      join(bin, "pg_ctl"),
      ["-D", directory, "-m", "fast", "-w", "stop"],
      { stdio: "inherit" },
    );
  rmSync(directory, { recursive: true, force: true });
}
