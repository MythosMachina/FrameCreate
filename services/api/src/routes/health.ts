import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    await query("select 1 as ok");
    return { status: "ok" };
  });
}
