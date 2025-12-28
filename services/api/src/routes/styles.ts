import type { FastifyInstance } from "fastify";
import { presetStyles } from "../styles/presets.js";

export async function registerStyleRoutes(app: FastifyInstance) {
  app.get("/api/styles", async () => {
    return presetStyles.map((style) => ({
      id: style.id,
      name: style.name
    }));
  });
}
