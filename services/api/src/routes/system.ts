import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ServiceStatus = "active" | "inactive" | "failed" | "unknown";

const normalizeStatus = (value: string): ServiceStatus => {
  const trimmed = value.trim();
  if (trimmed === "active") {
    return "active";
  }
  if (trimmed === "inactive" || trimmed === "failed") {
    return trimmed;
  }
  return "unknown";
};

async function getServiceStatus(service: string): Promise<ServiceStatus> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", service]);
    return normalizeStatus(stdout);
  } catch {
    return "unknown";
  }
}

export async function registerSystemRoutes(app: FastifyInstance) {
  app.get("/api/system/status", async () => {
    const [worker, indexer] = await Promise.all([
      getServiceStatus("framecreate-worker"),
      getServiceStatus("framecreate-indexer")
    ]);

    return {
      worker,
      indexer
    };
  });
}
