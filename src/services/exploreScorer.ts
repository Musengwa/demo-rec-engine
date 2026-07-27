import { config } from "../config";
import { getCandidatePool } from "../data/listings";
import { getUserInteractions, countUserInteractions } from "../data/interactions";
import { getUserTagAffinity, getUserCategoryAffinity } from "../data/tags";
import { getColdStartListings } from "./coldStart";
import { ListingCard, ExploreResponse } from "../types";

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

/** Jaccard-style tag similarity between two listings, used by MMR to penalize near-duplicates. */
function tagSimilarity(a: ListingCard, b: ListingCard): number {
  const setA = new Set(a.tags);
  const setB = new Set(b.tags);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Combined similarity for MMR: tag overlap, plus a same-venue signal so
 * results don't cluster on one venue (e.g. several rooms at the same hotel)
 * even when their tags don't overlap much.
 */
function combinedSimilarity(a: ListingCard, b: ListingCard): number {
  const sameVenue = Boolean(a.venueId) && a.venueId === b.venueId;
  return Math.max(tagSimilarity(a, b), sameVenue ? config.scoring.venueSimilarityWeight : 0);
}

/**
 * Maximal Marginal Relevance re-ranking: greedily picks items that are both
 * relevant (base score) and dissimilar to what's already been picked, so
 * the final list doesn't collapse into ten near-identical listings.
 * lambda closer to 1 = favor relevance, closer to 0 = favor diversity.
 */
function mmrRerank(items: ListingCard[], lambda: number, limit: number): ListingCard[] {
  const remaining = [...items];
  const selected: ListingCard[] = [];

  while (remaining.length > 0 && selected.length < limit) {
    let bestIdx = 0;
    let bestValue = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = remaining[i].score ?? 0;
      const maxSim = selected.length === 0 ? 0 : Math.max(...selected.map((s) => combinedSimilarity(remaining[i], s)));
      const value = lambda * relevance - (1 - lambda) * maxSim;
      if (value > bestValue) {
        bestValue = value;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}

/**
 * Explore differs from Feed in two ways: candidates are weighted toward
 * being *somewhat* adjacent to taste rather than a tight match (inverted
 * distance-style weighting on tag/category overlap), and the final list
 * is diversity re-ranked via MMR so it doesn't just repeat the Feed.
 */
export async function buildExplore(userId: string, limit: number): Promise<ExploreResponse> {
  const interactionCount = await countUserInteractions(userId);

  if (interactionCount < config.coldStart.minInteractionsForPersonalization) {
    const items = await getColdStartListings(limit);
    return { source: "cold_start", items, nextCursor: null };
  }

  const [interactions, tagAffinityRaw, categoryAffinityRaw] = await Promise.all([
    getUserInteractions(userId, 200),
    getUserTagAffinity(userId),
    getUserCategoryAffinity(userId),
  ]);

  const tagAffinity = normalize(tagAffinityRaw);
  const categoryAffinity = normalize(categoryAffinityRaw);

  const alreadySeenIds = interactions.map((i) => i.listing_id);
  const pool = await getCandidatePool(alreadySeenIds, Math.max(limit * 12, 150));

  const scored: ListingCard[] = pool.map((item) => {
    const tagScore = overlapScore(item.tags, tagAffinity);
    const categoryScore = overlapScore(item.categories, categoryAffinity);
    // "adjacent but not a perfect match" — mid-range overlap scores are
    // favored over the very top matches, which Feed already surfaces
    const rawRelevance = tagScore * 0.6 + categoryScore * 0.4;
    const adjacency = 1 - Math.abs(rawRelevance - 0.5) * 2; // peaks at moderate overlap
    return { ...item, score: Math.max(0, adjacency) };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // take a generous pre-diversity shortlist, then MMR down to `limit`
  const shortlist = scored.slice(0, Math.max(limit * 4, 40));
  const diversified = mmrRerank(shortlist, config.scoring.exploreDiversityLambda, limit);

  return { source: "personalized", items: diversified, nextCursor: null };
}
