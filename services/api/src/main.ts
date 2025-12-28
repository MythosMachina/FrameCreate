import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "@framecreate/shared";
import { registerHealthRoutes } from "./routes/health.js";
import { registerModelRoutes } from "./routes/models.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerOutputRoutes } from "./routes/outputs.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerStyleRoutes } from "./routes/styles.js";
import { registerRuntimeRoutes } from "./routes/runtime.js";
import { registerSystemRoutes } from "./routes/system.js";

const config = loadConfig(process.cwd());

const app = Fastify({
  logger: {
    level: "info"
  }
});

await app.register(cors, { origin: true });
await registerHealthRoutes(app);
await registerModelRoutes(app);
await registerJobRoutes(app);
await registerOutputRoutes(app);
await registerSettingsRoutes(app);
await registerStyleRoutes(app);
await registerRuntimeRoutes(app);
await registerSystemRoutes(app);

app.listen({ port: config.apiPort, host: "0.0.0.0" });
