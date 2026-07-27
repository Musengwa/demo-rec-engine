import { config } from "../config";
import { getCandidatePool } from "../data/listings";
import { getUserInteractions, countUserInteractions } from "../data/interactions";
import { getUserTagAffinity, getUserCategoryAffinity, getMostRecentPositiveListingId } from "../data/tags";
import { getUserLocation } from "../data/profiles";
import { getTopPairPartners } from "../data/pairAffinity";
import { getColdStartListings } from "./coldStart";
import { capPerVenue } from "./diversity";
import { ListingCard, FeedResponse } from "../types";

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
 * Ranks a candidate pool for a given user and returns the top `limit` items.
 * See design doc Section 5 for the four signals combined here.
 */
export async function buildFeed(userId: string, limit: number): Promise<FeedResponse> {
  const interactionCount = await countUserInteractions(userId);

  if (interactionCount < config.coldStart.minInteractionsForPersonalization) {
    const items = await getColdStartListings(limit);
    return { source: "cold_start", items, nextCursor: null };
  }

  const [interactions, tagAffinityRaw, categoryAffinityRaw, userLocation, recentListingId] = await Promise.all([
    getUserInteractions(userId, 200),
    getUserTagAffinity(userId),
    getUserCategoryAffinity(userId),
    getUserLocation(userId),
    getMostRecentPositiveListingId(userId),
  ]);

  const tagAffinity = normalize(tagAffinityRaw);
  const categoryAffinity = normalize(categoryAffinityRaw);

  const alreadySeenIds = interactions.map((i) => i.listing_id);
  const pool = await getCandidatePool(alreadySeenIds, Math.max(limit * 8, 100));

  // "goes with what you just looked at" boost, from listing_pair_affinity
  const recentPartnerScores = new Map<string, number>();
  if (recentListingId) {
    const partners = await getTopPairPartners(recentListingId, 20);
    for (const partner of partners) {
      recentPartnerScores.set(partner.listing_id_b, partner.score);
    }
  }

  const weights = config.scoring.weights;

  const scored: ListingCard[] = pool.map((item) => {
    const tagScore = overlapScore(item.tags, tagAffinity);
    const categoryScore = overlapScore(item.categories, categoryAffinity);
    const locationScore = userLocation && item.location?.city && item.location.city === userLocation ? 1 : 0;
    const pairBoost = recentPartnerScores.get(item.id) ?? 0;

    const score =
      weights.tagOverlap * tagScore +
      weights.categoryOverlap * categoryScore +
      weights.locationProximity * locationScore +
      weights.recencyDecayedInteraction * pairBoost;

    return { ...item, score };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const items = capPerVenue(scored, limit, config.scoring.maxPerVenueFeed);
  return { source: "personalized", items, nextCursor: null };
}
