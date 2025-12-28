import type { FastifyInstance } from "fastify";
import { loadConfig } from "@framecreate/shared";

const config = loadConfig(process.cwd());

export async function registerRuntimeRoutes(app: FastifyInstance) {
  app.post("/api/runtime/reload", async (request, reply) => {
    if (!config.workerUrl) {
      reply.code(400);
      return { error: "worker_unconfigured" };
    }
    try {
      const response = await fetch(`${config.workerUrl}/runtime/reload`, { method: "POST" });
      if (!response.ok) {
        reply.code(500);
        return { error: "worker_reload_failed" };
      }
      return { status: "ok" };
    } catch {
      reply.code(500);
      return { error: "worker_unreachable" };
    }
  });
}
