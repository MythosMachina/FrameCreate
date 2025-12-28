import { Pool } from "pg";
import { loadConfig } from "@framecreate/shared";

const config = loadConfig(process.cwd());

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function execute(text: string, params?: unknown[]): Promise<void> {
  await pool.query(text, params);
}
