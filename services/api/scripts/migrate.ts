import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { loadConfig } from "@framecreate/shared";

const config = loadConfig(process.cwd());
const pool = new Pool({ connectionString: config.databaseUrl });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");

async function ensureTable() {
  await pool.query(
    "create table if not exists schema_migrations (id serial primary key, name text unique not null, applied_at timestamptz not null default now())"
  );
}

async function appliedMigrations(): Promise<Set<string>> {
  const res = await pool.query("select name from schema_migrations order by id");
  return new Set(res.rows.map((row) => row.name));
}

async function run() {
  await ensureTable();
  const applied = await appliedMigrations();
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf-8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (name) values ($1)", [file]);
      await pool.query("commit");
      console.log(`applied ${file}`);
    } catch (error) {
      await pool.query("rollback");
      console.error(`failed ${file}`);
      throw error;
    }
  }

  await pool.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
