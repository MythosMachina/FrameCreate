import type { FastifyInstance } from "fastify";
import { loadConfig } from "@framecreate/shared";
import { query, execute } from "../db.js";

const config = loadConfig(process.cwd());

export async function registerModelRoutes(app: FastifyInstance) {
  app.get("/api/models", async (request) => {
    const kind = (request.query as { kind?: string }).kind;
    const rows = kind
      ? await query("select * from model_assets where kind = $1 order by updated_at desc", [kind])
      : await query("select * from model_assets order by updated_at desc");
    return rows;
  });

  app.post("/api/models/scan", async () => {
    if (!config.indexerUrl) {
      return { status: "skipped", reason: "indexer not configured" };
    }
    const res = await fetch(`${config.indexerUrl}/scan`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    return { status: res.ok ? "ok" : "error", ...body };
  });

  app.patch("/api/models/:id", async (request) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { tags?: string[]; base_model?: string; trigger_words?: string[]; is_active?: boolean };
    await execute(
      "update model_assets set tags = coalesce($1, tags), base_model = coalesce($2, base_model), trigger_words = coalesce($3, trigger_words), is_active = coalesce($4, is_active), updated_at = now() where id = $5",
      [body.tags ?? null, body.base_model ?? null, body.trigger_words ?? null, body.is_active ?? null, id]
    );
    const [row] = await query("select * from model_assets where id = $1", [id]);
    return row ?? { id };
  });

  app.delete("/api/models/:id", async (request) => {
    const id = Number((request.params as { id: string }).id);
    await execute("update model_assets set is_active = false, updated_at = now() where id = $1", [id]);
    return { id, status: "deactivated" };
  });
}
