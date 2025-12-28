import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

type SettingRow = {
  key: string;
  value: string;
};

const defaults = {
  default_sampler: "euler",
  default_scheduler: "karras",
  preview_enabled: "true",
  preview_interval: "3"
};

async function loadSettings() {
  const keys = Object.keys(defaults);
  const rows = await query<SettingRow>(
    "select key, value from app_settings where key = any($1)",
    [keys]
  );
  const values = rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  return {
    default_sampler: values.default_sampler ?? defaults.default_sampler,
    default_scheduler: values.default_scheduler ?? defaults.default_scheduler,
    preview_enabled: values.preview_enabled ? values.preview_enabled !== "false" : true,
    preview_interval: Number(values.preview_interval ?? defaults.preview_interval)
  };
}

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", async () => {
    return loadSettings();
  });

  app.put("/api/settings", async (request) => {
    const body = request.body as Partial<Record<keyof typeof defaults, string | boolean | number>>;
    const updates: Array<[string, string]> = [];

    if (typeof body.default_sampler === "string" && body.default_sampler.trim()) {
      updates.push(["default_sampler", body.default_sampler.trim()]);
    }
    if (typeof body.default_scheduler === "string" && body.default_scheduler.trim()) {
      updates.push(["default_scheduler", body.default_scheduler.trim()]);
    }
    if (typeof body.preview_enabled === "boolean") {
      updates.push(["preview_enabled", body.preview_enabled ? "true" : "false"]);
    }
    if (typeof body.preview_interval === "number" && Number.isFinite(body.preview_interval)) {
      updates.push(["preview_interval", String(Math.max(1, Math.floor(body.preview_interval)))]);
    }

    for (const [key, value] of updates) {
      await query(
        "insert into app_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()",
        [key, value]
      );
    }

    return loadSettings();
  });
}
