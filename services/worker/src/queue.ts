import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadConfig } from "@framecreate/shared";
import { execute, query } from "./db.js";
import { generateImage } from "./runtime/index.js";

const config = loadConfig(process.cwd());

export type JobRecord = {
  id: number;
  prompt: string;
  negative_prompt: string;
  prompt_variants: string[] | null;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  sampler: string;
  scheduler: string | null;
  seed: number | null;
  batch_count: number;
  model_asset_id: number | null;
  lora_asset_ids: number[] | null;
  lora_weights: number[] | null;
};

type ModelRow = {
  id: number;
  path: string;
};

type LoraRow = {
  id: number;
  path: string;
};

export class JobQueue extends EventEmitter {
  private queue: number[] = [];
  private active = 0;
  private activeJobs = new Set<number>();
  private cancelledJobs = new Set<number>();

  constructor(private readonly concurrency: number) {
    super();
  }

  enqueue(jobId: number) {
    if (!this.queue.includes(jobId)) {
      this.queue.push(jobId);
      this.process();
    }
  }

  async cancel(jobId: number) {
    const index = this.queue.indexOf(jobId);
    if (index === -1) {
      if (this.activeJobs.has(jobId)) {
        this.cancelledJobs.add(jobId);
        const cancelPath = this.getCancelPath(jobId);
        try {
          fs.writeFileSync(cancelPath, "cancel");
        } catch {
          // best-effort cancellation marker
        }
        this.emit("cancelled", { jobId });
        return true;
      }
      return false;
    }
    this.queue.splice(index, 1);
    await execute(
      "update generation_jobs set status = 'cancelled', updated_at = now(), finished_at = now() where id = $1 and status = 'queued'",
      [jobId]
    );
    this.emit("cancelled", { jobId });
    return true;
  }

  async pollQueued() {
    const rows = await query<JobRecord>(
      "select * from generation_jobs where status = 'queued' order by created_at asc limit 10"
    );
    rows.forEach((job) => this.enqueue(job.id));
  }

  private process() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (jobId === undefined) {
        continue;
      }
      this.active += 1;
      this.run(jobId)
        .catch((error) => {
          this.emit("error", { jobId, error });
        })
        .finally(() => {
          this.active -= 1;
          this.process();
        });
    }
  }

  private async run(jobId: number) {
    const cancelPath = this.getCancelPath(jobId);
    this.activeJobs.add(jobId);
    this.cancelledJobs.delete(jobId);
    if (fs.existsSync(cancelPath)) {
      try {
        fs.unlinkSync(cancelPath);
      } catch {
        // ignore stale cancel markers
      }
    }
    try {
      const [job] = await query<JobRecord>("select * from generation_jobs where id = $1", [jobId]);
      if (!job) {
        return;
      }

      await execute(
        "update generation_jobs set status = 'running', started_at = now(), updated_at = now(), progress = 0 where id = $1",
        [jobId]
      );

      const seed = job.seed ?? crypto.randomInt(1, 999999999);
      const outputs: string[] = [];

      const [modelRow] = job.model_asset_id
        ? await query<ModelRow>("select id, path from model_assets where id = $1", [job.model_asset_id])
        : await query<ModelRow>("select id, path from model_assets where kind = 'checkpoint' and is_active = true order by updated_at desc limit 1");

      if (!modelRow) {
        await execute(
          "update generation_jobs set status = 'failed', error = 'model_not_found', finished_at = now(), updated_at = now() where id = $1",
          [jobId]
        );
        this.emit("error", { jobId, error: "model_not_found" });
        return;
      }

      const loraIds = job.lora_asset_ids ?? [];
      const loraWeights = job.lora_weights ?? [];
      let loras: { path: string; weight: number }[] = [];
      if (loraIds.length > 0) {
        const rows = await query<LoraRow>(
          "select id, path from model_assets where id = any($1) and kind = 'lora'",
          [loraIds]
        );
        const rowMap = new Map(rows.map((row) => [row.id, row]));
        loras = loraIds
          .map((id, index) => {
            const row = rowMap.get(id);
            if (!row) {
              return null;
            }
            const weight = loraWeights[index] ?? 1;
            return { path: row.path, weight: Math.min(1, Math.max(0.1, weight)) };
          })
          .filter((entry): entry is { path: string; weight: number } => Boolean(entry));
      }

      const previewSettings = await query<{ key: string; value: string }>(
        "select key, value from app_settings where key = any($1)",
        [["preview_enabled", "preview_interval"]]
      );
      const previewMap = previewSettings.reduce<Record<string, string>>((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const previewEnabled = previewMap.preview_enabled ? previewMap.preview_enabled !== "false" : true;
      const previewInterval = Number(previewMap.preview_interval ?? 6);

      for (let i = 0; i < job.batch_count; i += 1) {
        if (this.cancelledJobs.has(jobId)) {
          await execute(
            "update generation_jobs set status = 'cancelled', updated_at = now(), finished_at = now() where id = $1",
            [jobId]
          );
          this.emit("cancelled", { jobId });
          return;
        }
        const outputName = `job_${jobId}_${i}_${Date.now()}.png`;
        const outputPath = path.join(config.outputsDir, outputName);
        const outputSeed = seed + i;
        const previewPath = path.join(config.thumbnailsDir, `job_${jobId}_preview.jpg`);
        const prompt = job.prompt_variants?.[i] ?? job.prompt;

        await generateImage({
          prompt,
          negativePrompt: job.negative_prompt ?? "",
          width: job.width,
          height: job.height,
          steps: job.steps,
          cfgScale: job.cfg_scale,
          sampler: job.sampler,
          scheduler: job.scheduler,
          seed: outputSeed,
          outputPath,
          modelPath: modelRow.path,
          loras,
          previewEnabled,
          previewInterval,
          previewPath,
          cancelPath
        });
        await execute(
          "insert into generation_outputs (job_id, file_path, width, height, seed, prompt, negative_prompt) values ($1, $2, $3, $4, $5, $6, $7)",
          [jobId, outputPath, job.width, job.height, outputSeed, prompt, job.negative_prompt ?? ""]
        );

        outputs.push(outputPath);

        const progress = (i + 1) / job.batch_count;
        await execute("update generation_jobs set progress = $1, updated_at = now() where id = $2", [progress, jobId]);
        this.emit("progress", { jobId, progress });
      }

      await execute(
        "update generation_jobs set status = 'completed', progress = 1, finished_at = now(), updated_at = now() where id = $1",
        [jobId]
      );

      this.emit("completed", { jobId, outputs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.cancelledJobs.has(jobId) || message.toLowerCase().includes("cancelled")) {
        await execute(
          "update generation_jobs set status = 'cancelled', error = null, finished_at = now(), updated_at = now() where id = $1",
          [jobId]
        );
        this.emit("cancelled", { jobId });
      } else {
        await execute(
          "update generation_jobs set status = 'failed', error = $1, finished_at = now(), updated_at = now() where id = $2",
          [message, jobId]
        );
        this.emit("error", { jobId, error });
      }
    } finally {
      this.activeJobs.delete(jobId);
      this.cancelledJobs.delete(jobId);
      if (fs.existsSync(cancelPath)) {
        try {
          fs.unlinkSync(cancelPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  private getCancelPath(jobId: number) {
    return path.join(config.thumbnailsDir, `job_${jobId}.cancel`);
  }
}
