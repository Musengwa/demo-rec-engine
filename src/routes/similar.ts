import { FastifyInstance } from "fastify";
import { getSimilarListings } from "../services/similarListings";
import { getCached, setCached, cacheKey } from "../lib/cache";
import { config } from "../config";
import { SimilarListingsResponse } from "../types";

export async function similarRoute(app: FastifyInstance) {
  app.get("/api/listings/:id/similar", async (request, reply) => {
    const { id } = request.params as { id: string };
    const limit = Math.min(
      Number((request.query as any)?.limit) || 10,
      config.pagination.maxPageSize
    );

    // not user-specific, so no guest/auth branch needed here — cache key is just the listing
    const key = cacheKey(["similar", id, limit]);
    const cached = getCached<SimilarListingsResponse>(key);
    if (cached) return reply.send(cached);

    const body = await getSimilarListings(id, limit);
    setCached(key, body, config.cache.similarTtlMs);
    return reply.send(body);
  });
}
