import type { FastifyInstance } from "fastify";
import { loadConfig } from "@framecreate/shared";
import fs from "node:fs";
import path from "node:path";
import { presetStylesById } from "../styles/presets.js";
import { query } from "../db.js";

const config = loadConfig(process.cwd());

type JobParams = {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  sampler?: string;
  scheduler?: string;
  seed?: number;
  batch_count?: number;
  model_asset_id?: number;
  lora_asset_ids?: number[];
  lora_weights?: number[];
  preset_style_ids?: string[];
};

type JobRow = {
  id: number;
  status: string;
  prompt: string;
  negative_prompt: string;
  prompt_variants: string[] | null;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  sampler: string | null;
  scheduler: string | null;
  seed: number | null;
  batch_count: number;
  model_asset_id: number | null;
  lora_asset_ids: number[] | null;
  lora_weights: number[] | null;
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export async function registerJobRoutes(app: FastifyInstance) {
  const loadDefaults = async () => {
    const rows = await query<{ key: string; value: string }>(
      "select key, value from app_settings where key = any($1)",
      [["default_sampler", "default_scheduler"]]
    );
    const map = rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    return {
      default_sampler: map.default_sampler ?? "euler",
      default_scheduler: map.default_scheduler ?? "karras"
    };
  };

  app.get("/api/jobs", async () => {
    const rows = await query<JobRow>(
      "select * from generation_jobs order by created_at desc limit 200"
    );
    return rows;
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [job] = await query<JobRow>("select * from generation_jobs where id = $1", [id]);
    if (!job) {
      reply.code(404);
      return { error: "not_found" };
    }
    const outputs = await query("select * from generation_outputs where job_id = $1 order by id", [id]);
    return { ...job, outputs };
  });

  app.get("/api/jobs/:id/preview", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const filePath = path.resolve(config.thumbnailsDir, `job_${id}_preview.jpg`);
    if (!filePath.startsWith(path.resolve(config.thumbnailsDir))) {
      reply.code(400);
      return { error: "invalid_path" };
    }
    if (!fs.existsSync(filePath)) {
      reply.code(404);
      return { error: "not_found" };
    }
    reply.type("image/jpeg");
    return fs.createReadStream(filePath);
  });

  app.post("/api/jobs", async (request, reply) => {
    const body = request.body as JobParams;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      reply.code(400);
      return { error: "prompt_required" };
    }

    const presetIds = Array.isArray(body.preset_style_ids) ? body.preset_style_ids : [];
    const presetStyles = presetIds
      .map((id) => presetStylesById[id])
      .filter((style) => Boolean(style));
    const presetPrompts = presetStyles
      .map((style) => style.prompt)
      .filter((value) => value.length > 0);
    const presetNegative = presetStyles
      .map((style) => style.negative_prompt)
      .filter((value) => value.length > 0);
    const combinedPrompt = presetPrompts.length > 0
      ? `${presetPrompts.join(" ")} ${prompt}`
      : prompt;
    const combinedNegative = [body.negative_prompt ?? "", ...presetNegative]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .join(", ");

    const wildcardRegex = /__([a-zA-Z0-9_-]+)__/g;
    const matches = [...combinedPrompt.matchAll(wildcardRegex)];
    const wildcardNames = Array.from(new Set(matches.map((match) => match[1])));
    const wildcardMap = new Map<string, string[]>();
    wildcardNames.forEach((name) => {
      const filePath = path.join(config.wildcardsDir, `${name}.txt`);
      if (!fs.existsSync(filePath)) {
        wildcardMap.set(name, []);
        return;
      }
      const raw = fs.readFileSync(filePath, "utf-8");
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      wildcardMap.set(name, lines);
    });
    const batchCount = body.batch_count ?? 1;
    const promptVariants = wildcardMap.size === 0
      ? []
      : Array.from({ length: batchCount }, (_value, index) =>
          combinedPrompt.replace(wildcardRegex, (_match, name: string) => {
            const values = wildcardMap.get(name) ?? [];
            return values[index] ?? "";
          })
        );
    const resolvedPrompt = promptVariants.length > 0 ? promptVariants[0] : combinedPrompt;

    const defaults = await loadDefaults();
    const sampler = body.sampler ?? defaults.default_sampler;
    const scheduler = body.scheduler ?? defaults.default_scheduler;

    const [job] = await query<JobRow>(
      `insert into generation_jobs
        (status, prompt, negative_prompt, width, height, steps, cfg_scale, sampler, scheduler, seed, batch_count, model_asset_id, lora_asset_ids, lora_weights, prompt_variants)
       values
        ('queued', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       returning *`,
      [
        resolvedPrompt,
        combinedNegative,
        body.width ?? 1024,
        body.height ?? 1024,
        body.steps ?? 30,
        body.cfg_scale ?? 7.5,
        sampler,
        scheduler,
        body.seed ?? null,
        batchCount,
        body.model_asset_id ?? null,
        body.lora_asset_ids ?? null,
        body.lora_weights ?? null,
        promptVariants.length > 0 ? JSON.stringify(promptVariants) : null
      ]
    );

    if (config.workerUrl) {
      fetch(`${config.workerUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id })
      }).catch(() => {
        // worker will pull queued jobs on its own; no hard dependency here
      });
    }

    return job;
  });

  app.post("/api/jobs/:id/cancel", async (request) => {
    const id = Number((request.params as { id: string }).id);
    await query(
      "update generation_jobs set status = 'cancelled', updated_at = now() where id = $1 and status = 'queued'",
      [id]
    );

    if (config.workerUrl) {
      fetch(`${config.workerUrl}/jobs/${id}/cancel`, { method: "POST" }).catch(() => {
        // best-effort cancellation
      });
    }

    return { status: "cancelled", id };
  });
}
