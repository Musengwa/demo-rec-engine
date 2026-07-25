import { FastifyInstance } from "fastify";
import { resolveAuthContext } from "../middleware/auth";
import { buildExplore } from "../services/exploreScorer";
import { getColdStartListings } from "../services/coldStart";
import { getCached, setCached, cacheKey } from "../lib/cache";
import { config } from "../config";
import { ExploreResponse } from "../types";

export async function exploreRoute(app: FastifyInstance) {
  app.get("/api/explore", async (request, reply) => {
    const auth = resolveAuthContext(request);
    const limit = Math.min(
      Number((request.query as any)?.limit) || config.pagination.defaultPageSize,
      config.pagination.maxPageSize
    );

    if (auth.isGuest) {
      const items = await getColdStartListings(limit);
      const body: ExploreResponse = { source: "cold_start", items, nextCursor: null };
      return reply.send(body);
    }

    const key = cacheKey(["explore", auth.userId, limit]);
    const cached = getCached<ExploreResponse>(key);
    if (cached) return reply.send(cached);

    const body = await buildExplore(auth.userId as string, limit);
    setCached(key, body, config.cache.exploreTtlMs);
    return reply.send(body);
  });
}
