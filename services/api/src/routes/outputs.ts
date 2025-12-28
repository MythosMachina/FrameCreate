import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@framecreate/shared";
import { query } from "../db.js";

const config = loadConfig(process.cwd());

type OutputRow = {
  id: number;
  job_id: number;
  file_path: string;
  width: number;
  height: number;
  seed: number | null;
  prompt: string;
  negative_prompt: string | null;
  steps: number;
  cfg_scale: number;
  sampler: string | null;
  scheduler: string | null;
  created_at: string;
};

export async function registerOutputRoutes(app: FastifyInstance) {
  app.get("/api/outputs", async () => {
    const rows = await query<OutputRow>(
      `select o.id, o.job_id, o.file_path, o.width, o.height, o.seed,
              coalesce(o.prompt, j.prompt) as prompt,
              coalesce(o.negative_prompt, j.negative_prompt) as negative_prompt,
              j.steps, j.cfg_scale, j.sampler, j.scheduler, j.created_at
       from generation_outputs o
       join generation_jobs j on j.id = o.job_id
       order by o.id desc
       limit 200`
    );

    return rows.map((row) => {
      const fileName = path.basename(row.file_path);
      return {
        ...row,
        file_name: fileName,
        url: `/outputs/${fileName}`
      };
    });
  });

  app.get("/outputs/:name", async (request, reply) => {
    const name = (request.params as { name: string }).name;
    const safeName = path.basename(name);
    const filePath = path.resolve(config.outputsDir, safeName);

    if (!filePath.startsWith(path.resolve(config.outputsDir))) {
      reply.code(400);
      return { error: "invalid_path" };
    }

    if (!fs.existsSync(filePath)) {
      reply.code(404);
      return { error: "not_found" };
    }

    reply.type("image/png");
    return fs.createReadStream(filePath);
  });

  app.delete("/api/outputs/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const [row] = await query<Pick<OutputRow, "file_path">>("select file_path from generation_outputs where id = $1", [id]);
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }
    const filePath = path.resolve(row.file_path);
    if (!filePath.startsWith(path.resolve(config.outputsDir))) {
      reply.code(400);
      return { error: "invalid_path" };
    }
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    await query("delete from generation_outputs where id = $1", [id]);
    return { status: "deleted", id };
  });
}
