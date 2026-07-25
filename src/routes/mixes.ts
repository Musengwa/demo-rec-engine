import { FastifyInstance } from "fastify";
import { resolveAuthContext } from "../middleware/auth";
import { buildMixes } from "../services/mixGenerator";
import { getCached, setCached, cacheKey } from "../lib/cache";
import { config } from "../config";
import { MixesResponse } from "../types";

export async function mixesRoute(app: FastifyInstance) {
  app.get("/api/mixes", async (request, reply) => {
    const auth = resolveAuthContext(request);

    const key = cacheKey(["mixes", auth.userId]);
    const cached = getCached<MixesResponse>(key);
    if (cached) return reply.send(cached);

    const body = await buildMixes(auth.isGuest ? null : auth.userId);
    setCached(key, body, config.cache.mixesTtlMs);
    return reply.send(body);
  });
}
