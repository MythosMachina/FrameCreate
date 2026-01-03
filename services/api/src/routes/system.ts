import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { loadConfig } from "@framecreate/shared";

const execFileAsync = promisify(execFile);
const config = loadConfig(process.cwd());

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

const systemdAvailable = () => process.platform === "linux" && fs.existsSync("/run/systemd/system");

async function getHealthStatus(baseUrl?: string): Promise<ServiceStatus> {
  if (!baseUrl) {
    return "unknown";
  }
  try {
    const response = await fetch(`${baseUrl}/health`);
    return response.ok ? "active" : "failed";
  } catch {
    return "unknown";
  }
}

export async function registerSystemRoutes(app: FastifyInstance) {
  app.get("/api/system/status", async () => {
    if (systemdAvailable()) {
      const [worker, indexer] = await Promise.all([
        getServiceStatus("framecreate-worker"),
        getServiceStatus("framecreate-indexer")
      ]);

      return {
        worker,
        indexer
      };
    }

    const [worker, indexer] = await Promise.all([
      getHealthStatus(config.workerUrl),
      getHealthStatus(config.indexerUrl)
    ]);

    return {
      worker,
      indexer,
      reason: "systemd_unavailable"
    };
  });
}
