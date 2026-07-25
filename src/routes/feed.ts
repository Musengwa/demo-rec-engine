import { FastifyInstance } from "fastify";
import { resolveAuthContext } from "../middleware/auth";
import { buildFeed } from "../services/feedScorer";
import { getColdStartListings } from "../services/coldStart";
import { getCached, setCached, cacheKey } from "../lib/cache";
import { config } from "../config";
import { FeedResponse } from "../types";

export async function feedRoute(app: FastifyInstance) {
  app.get("/api/feed", async (request, reply) => {
    const auth = resolveAuthContext(request);
    const limit = Math.min(
      Number((request.query as any)?.limit) || config.pagination.defaultPageSize,
      config.pagination.maxPageSize
    );

    if (auth.isGuest) {
      const items = await getColdStartListings(limit);
      const body: FeedResponse = { source: "cold_start", items, nextCursor: null };
      return reply.send(body);
    }

    const key = cacheKey(["feed", auth.userId, limit]);
    const cached = getCached<FeedResponse>(key);
    if (cached) return reply.send(cached);

    const body = await buildFeed(auth.userId as string, limit);
    setCached(key, body, config.cache.feedTtlMs);
    return reply.send(body);
  });
}
