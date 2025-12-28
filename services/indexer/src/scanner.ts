import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import fg from "fast-glob";
import { Pool } from "pg";
import { loadConfig } from "@framecreate/shared";

export type AssetKind = "checkpoint" | "lora" | "embedding";

type ScanResult = {
  scanned: number;
  upserted: number;
  deactivated: number;
};

const config = loadConfig(process.cwd());

const pool = new Pool({ connectionString: config.databaseUrl });

const kindMap: Record<AssetKind, string[]> = {
  checkpoint: ["**/*.safetensors", "**/*.ckpt", "**/*.pt", "**/*.onnx"],
  lora: ["**/*.safetensors", "**/*.pt"],
  embedding: ["**/*.pt", "**/*.bin"]
};

const kindRoot: Record<AssetKind, string> = {
  checkpoint: config.modelsDir,
  lora: config.lorasDir,
  embedding: config.embeddingsDir
};

async function hashFile(filePath: string) {
  const hash = crypto.createHash("sha256");
  const stream = (await fs.open(filePath, "r")).createReadStream();
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function readSidecar(basePath: string) {
  const jsonPath = `${basePath}.json`;
  const txtPath = `${basePath}.txt`;
  let metadata: Record<string, unknown> | null = null;
  let triggerWords: string[] | null = null;

  try {
    const json = await fs.readFile(jsonPath, "utf-8");
    metadata = JSON.parse(json);
  } catch {
    // ignore missing metadata
  }

  try {
    const txt = await fs.readFile(txtPath, "utf-8");
    triggerWords = txt
      .split(/[,\n]/)
      .map((word) => word.trim())
      .filter(Boolean);
  } catch {
    // ignore missing trigger file
  }

  return { metadata, triggerWords };
}

async function upsertAsset({
  kind,
  name,
  filePath,
  sizeBytes,
  mtime,
  sha256,
  metadata,
  triggerWords
}: {
  kind: AssetKind;
  name: string;
  filePath: string;
  sizeBytes: number;
  mtime: number;
  sha256: string;
  metadata: Record<string, unknown> | null;
  triggerWords: string[] | null;
}) {
  await pool.query(
    `insert into model_assets (kind, name, path, size_bytes, sha256, mtime, metadata, trigger_words)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (path) do update
       set name = excluded.name,
           size_bytes = excluded.size_bytes,
           sha256 = excluded.sha256,
           mtime = excluded.mtime,
           metadata = coalesce(excluded.metadata, model_assets.metadata),
           trigger_words = coalesce(excluded.trigger_words, model_assets.trigger_words),
           is_active = true,
           updated_at = now()`,
    [kind, name, filePath, sizeBytes, sha256, mtime, metadata, triggerWords]
  );
}

async function deactivateMissing(kind: AssetKind, knownPaths: string[]) {
  const res = await pool.query(
    "update model_assets set is_active = false, updated_at = now() where kind = $1 and path <> all($2)",
    [kind, knownPaths]
  );
  return res.rowCount ?? 0;
}

export async function scanAll(): Promise<ScanResult> {
  let scanned = 0;
  let upserted = 0;
  let deactivated = 0;

  for (const kind of Object.keys(kindRoot) as AssetKind[]) {
    const root = kindRoot[kind];
    const patterns = kindMap[kind];
    const files = await fg(patterns, { cwd: root, absolute: true, onlyFiles: true, followSymbolicLinks: true });
    const normalizedPaths: string[] = [];

    for (const file of files) {
      scanned += 1;
      const stats = await fs.stat(file);
      const basePath = file.replace(path.extname(file), "");
      const { metadata, triggerWords } = await readSidecar(basePath);
      const sha256 = await hashFile(file);
      const name = path.basename(file, path.extname(file));
      await upsertAsset({
        kind,
        name,
        filePath: file,
        sizeBytes: stats.size,
        mtime: stats.mtimeMs,
        sha256,
        metadata,
        triggerWords
      });
      normalizedPaths.push(file);
      upserted += 1;
    }

    if (normalizedPaths.length > 0) {
      deactivated += await deactivateMissing(kind, normalizedPaths);
    }
  }

  return { scanned, upserted, deactivated };
}

export async function closeScanner() {
  await pool.end();
}
