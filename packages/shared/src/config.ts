import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  FRAMECREATE_ROOT: z.string().optional(),
  FRAMECREATE_DATABASE_URL: z.string().min(1),
  FRAMECREATE_MODELS_DIR: z.string().optional(),
  FRAMECREATE_LORAS_DIR: z.string().optional(),
  FRAMECREATE_EMBEDDINGS_DIR: z.string().optional(),
  FRAMECREATE_OUTPUTS_DIR: z.string().optional(),
  FRAMECREATE_THUMBNAILS_DIR: z.string().optional(),
  FRAMECREATE_WILDCARDS_DIR: z.string().optional(),
  FRAMECREATE_WORKER_URL: z.string().optional(),
  FRAMECREATE_INDEXER_URL: z.string().optional(),
  FRAMECREATE_PORT: z.string().optional(),
  FRAMECREATE_WORKER_PORT: z.string().optional(),
  FRAMECREATE_INDEXER_PORT: z.string().optional(),
  FRAMECREATE_CONCURRENCY: z.string().optional()
});

export type FrameCreateConfig = {
  rootDir: string;
  databaseUrl: string;
  modelsDir: string;
  lorasDir: string;
  embeddingsDir: string;
  outputsDir: string;
  thumbnailsDir: string;
  wildcardsDir: string;
  workerUrl?: string;
  indexerUrl?: string;
  apiPort: number;
  workerPort: number;
  indexerPort: number;
  concurrency: number;
};

export function loadConfig(cwd = process.cwd()): FrameCreateConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  const env = parsed.data;
  const rootDir = env.FRAMECREATE_ROOT
    ? path.resolve(env.FRAMECREATE_ROOT)
    : path.resolve(cwd);
  const resolveFromRoot = (subpath: string) => path.resolve(rootDir, subpath);

  return {
    rootDir,
    databaseUrl: env.FRAMECREATE_DATABASE_URL,
    modelsDir: env.FRAMECREATE_MODELS_DIR ?? resolveFromRoot("storage/models"),
    lorasDir: env.FRAMECREATE_LORAS_DIR ?? resolveFromRoot("storage/loras"),
    embeddingsDir: env.FRAMECREATE_EMBEDDINGS_DIR ?? resolveFromRoot("storage/embeddings"),
    outputsDir: env.FRAMECREATE_OUTPUTS_DIR ?? resolveFromRoot("storage/outputs"),
    thumbnailsDir: env.FRAMECREATE_THUMBNAILS_DIR ?? resolveFromRoot("storage/thumbnails"),
    wildcardsDir: env.FRAMECREATE_WILDCARDS_DIR ?? resolveFromRoot("storage/wildcards"),
    workerUrl: env.FRAMECREATE_WORKER_URL,
    indexerUrl: env.FRAMECREATE_INDEXER_URL,
    apiPort: Number(env.FRAMECREATE_PORT ?? 4100),
    workerPort: Number(env.FRAMECREATE_WORKER_PORT ?? 4200),
    indexerPort: Number(env.FRAMECREATE_INDEXER_PORT ?? 4300),
    concurrency: Number(env.FRAMECREATE_CONCURRENCY ?? 1)
  };
}
