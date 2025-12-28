import Fastify from "fastify";
import { loadConfig } from "@framecreate/shared";
import { JobQueue } from "./queue.js";
import { reloadRuntime } from "./runtime/index.js";

const config = loadConfig(process.cwd());
const queue = new JobQueue(config.concurrency);

const app = Fastify({
  logger: { level: "info" }
});

app.get("/health", async () => ({ status: "ok" }));

app.post("/jobs", async (request, reply) => {
  const { jobId } = request.body as { jobId?: number };
  if (!jobId) {
    reply.code(400);
    return { error: "jobId_required" };
  }
  queue.enqueue(jobId);
  return { status: "queued", jobId };
});

app.post("/jobs/:id/cancel", async (request) => {
  const jobId = Number((request.params as { id: string }).id);
  const cancelled = await queue.cancel(jobId);
  return { status: cancelled ? "cancelled" : "not_found", jobId };
});

app.post("/runtime/reload", async () => {
  await reloadRuntime();
  return { status: "ok" };
});

app.get("/events", async (_request, reply) => {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.flushHeaders();

  const onProgress = (payload: unknown) => {
    reply.raw.write(`event: progress\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const onCompleted = (payload: unknown) => {
    reply.raw.write(`event: completed\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  queue.on("progress", onProgress);
  queue.on("completed", onCompleted);

  reply.raw.write("event: ready\ndata: {}\n\n");

  reply.raw.on("close", () => {
    queue.off("progress", onProgress);
    queue.off("completed", onCompleted);
  });
});

setInterval(() => {
  queue.pollQueued().catch(() => {
    // background polling should not crash
  });
}, 5000);

queue.on("error", (payload) => {
  const error = (payload as { error?: unknown }).error;
  app.log.error({ jobId: (payload as { jobId?: number }).jobId, err: error }, "job failed");
});
queue.on("completed", (payload) => {
  app.log.info(payload, "job completed");
});
queue.on("cancelled", (payload) => {
  app.log.info(payload, "job cancelled");
});

app.listen({ port: config.workerPort, host: "0.0.0.0" });
