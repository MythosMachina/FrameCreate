import Fastify from "fastify";
import { loadConfig } from "@framecreate/shared";
import { scanAll, closeScanner } from "./scanner.js";

const config = loadConfig(process.cwd());

const app = Fastify({
  logger: { level: "info" }
});

app.get("/health", async () => ({ status: "ok" }));

app.post("/scan", async () => {
  const startedAt = Date.now();
  const result = await scanAll();
  return { ...result, elapsed_ms: Date.now() - startedAt };
});

const closeSignals = ["SIGINT", "SIGTERM"] as const;
closeSignals.forEach((signal) => {
  process.on(signal, async () => {
    await closeScanner();
    process.exit(0);
  });
});

app.listen({ port: config.indexerPort, host: "0.0.0.0" });
