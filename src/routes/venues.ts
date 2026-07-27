import { FastifyInstance } from "fastify";
import { resolveAuthContext } from "../middleware/auth";
import { buildVenueListings } from "../services/venueScorer";
import { getSimilarVenues } from "../services/similarVenues";
import { getCached, setCached, cacheKey } from "../lib/cache";
import { config } from "../config";
import { VenueListingsResponse, SimilarVenuesResponse } from "../types";

export async function venuesRoute(app: FastifyInstance) {
  app.get("/api/venues/:id/listings", async (request, reply) => {
    const { id } = request.params as { id: string };
    const auth = resolveAuthContext(request);
    const limit = Math.min(
      Number((request.query as any)?.limit) || config.pagination.defaultPageSize,
      config.pagination.maxPageSize
    );

    const key = cacheKey(["venue-listings", id, auth.userId, limit]);
    const cached = getCached<VenueListingsResponse>(key);
    if (cached) return reply.send(cached);

    const body = await buildVenueListings(id, auth, limit);
    if (!body) {
      return reply.status(404).send({ ok: false, error: "Venue not found." });
    }

    setCached(key, body, config.cache.feedTtlMs);
    return reply.send(body);
  });

  app.get("/api/venues/:id/similar", async (request, reply) => {
    const { id } = request.params as { id: string };
    const limit = Math.min(
      Number((request.query as any)?.limit) || 10,
      config.pagination.maxPageSize
    );

    // not user-specific, so no guest/auth branch needed here — cache key is just the venue
    const key = cacheKey(["similar-venues", id, limit]);
    const cached = getCached<SimilarVenuesResponse>(key);
    if (cached) return reply.send(cached);

    const body = await getSimilarVenues(id, limit);
    setCached(key, body, config.cache.similarTtlMs);
    return reply.send(body);
  });
}
