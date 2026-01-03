import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { loadConfig } from "@framecreate/shared";

const config = loadConfig(process.cwd());

export async function registerEventRoutes(app: FastifyInstance) {
  app.get("/api/events", async (_request, reply) => {
    if (!config.workerUrl) {
      reply.code(400);
      return { error: "worker_unconfigured" };
    }

    const controller = new AbortController();
    try {
      const response = await fetch(`${config.workerUrl}/events`, { signal: controller.signal });
      if (!response.ok || !response.body) {
        reply.code(502);
        return { error: "worker_unreachable" };
      }

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      const stream = Readable.fromWeb(response.body as unknown as WebReadableStream);
      stream.pipe(reply.raw);

      reply.raw.on("close", () => {
        controller.abort();
        stream.destroy();
      });

      return reply;
    } catch {
      reply.code(502);
      return { error: "worker_unreachable" };
    }
  });
}
