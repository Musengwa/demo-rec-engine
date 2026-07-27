import { config } from "../config";
import { getVenueById } from "../data/venues";
import { getCandidatePool } from "../data/listings";
import { getUserInteractions, countUserInteractions } from "../data/interactions";
import { getUserTagAffinity, getUserCategoryAffinity } from "../data/tags";
import { AuthContext, ListingCard, VenueListingsResponse } from "../types";

function normalize(map: Map<string, number>): Map<string, number> {
  const max = Math.max(1, ...map.values());
  const out = new Map<string, number>();
  for (const [k, v] of map) out.set(k, v / max);
  return out;
}

function overlapScore(itemTags: string[], affinity: Map<string, number>): number {
  if (itemTags.length === 0) return 0;
  const total = itemTags.reduce((sum, tag) => sum + (affinity.get(tag) ?? 0), 0);
  return total / itemTags.length;
}

/**
 * "Listings at this venue" — ranked for the current user the same way Feed
 * ranks (tag/category affinity), scoped to a single venue. Location isn't a
 * useful signal here (every listing in the pool shares the venue's
 * location), so unlike Feed this only weighs tag/category overlap.
 */
export async function buildVenueListings(
  venueId: string,
  auth: AuthContext,
  limit: number
): Promise<VenueListingsResponse | null> {
  const venue = await getVenueById(venueId);
  if (!venue) return null;

  if (auth.isGuest) {
    const pool = await getCandidatePool([], limit, venueId);
    return { venue, source: "cold_start", items: pool.slice(0, limit), nextCursor: null };
  }

  const userId = auth.userId as string;
  const interactionCount = await countUserInteractions(userId);

  if (interactionCount < config.coldStart.minInteractionsForPersonalization) {
    const pool = await getCandidatePool([], limit, venueId);
    return { venue, source: "cold_start", items: pool.slice(0, limit), nextCursor: null };
  }

  const [interactions, tagAffinityRaw, categoryAffinityRaw] = await Promise.all([
    getUserInteractions(userId, 200),
    getUserTagAffinity(userId),
    getUserCategoryAffinity(userId),
  ]);

  const tagAffinity = normalize(tagAffinityRaw);
  const categoryAffinity = normalize(categoryAffinityRaw);

  const alreadySeenIds = interactions.map((i) => i.listing_id);
  const pool = await getCandidatePool(alreadySeenIds, Math.max(limit * 4, 50), venueId);

  const scored: ListingCard[] = pool.map((item) => {
    const tagScore = overlapScore(item.tags, tagAffinity);
    const categoryScore = overlapScore(item.categories, categoryAffinity);
    const score = tagScore * 0.6 + categoryScore * 0.4;
    return { ...item, score };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return { venue, source: "personalized", items: scored.slice(0, limit), nextCursor: null };
}
