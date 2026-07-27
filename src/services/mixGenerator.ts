import { config } from "../config";
import { getCandidatePool } from "../data/listings";
import { countUserInteractions, getUserInteractions } from "../data/interactions";
import { getUserTagAffinity } from "../data/tags";
import { getColdStartListings } from "./coldStart";
import { capPerVenue } from "./diversity";
import { Mix, MixesResponse, ListingCard } from "../types";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const TOP_N_TAGS_FOR_MIXES = 4;
const ITEMS_PER_MIX = 10;

/**
 * Builds one named mix per one of the user's top-N tag affinities, e.g.
 * "Weekend Getaways For You" for someone who consistently engages with
 * weekend-tagged listings. Falls back to a couple of generic popularity
 * mixes for cold-start / guest users, so the Dashboard is never empty.
 */
export async function buildMixes(userId: string | null): Promise<MixesResponse> {
  if (!userId) {
    return buildColdStartMixes();
  }

  const interactionCount = await countUserInteractions(userId);
  if (interactionCount < config.coldStart.minInteractionsForPersonalization) {
    return buildColdStartMixes();
  }

  const [interactions, tagAffinity] = await Promise.all([
    getUserInteractions(userId, 200),
    getUserTagAffinity(userId),
  ]);

  const topTags = [...tagAffinity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N_TAGS_FOR_MIXES)
    .map(([tag]) => tag);

  if (topTags.length === 0) {
    return buildColdStartMixes();
  }

  const alreadySeenIds = interactions.map((i) => i.listing_id);
  const pool = await getCandidatePool(alreadySeenIds, 300);

  const mixes: Mix[] = topTags
    .map((tag) => {
      const matching = pool.filter((item) => item.tags.includes(tag));
      const items = capPerVenue(matching, ITEMS_PER_MIX, config.scoring.maxPerVenueMix);
      if (items.length === 0) return null;
      return {
        id: slugify(tag),
        title: `${tag} Picks For You`,
        reason: `Based on your interest in ${tag}`,
        items,
      };
    })
    .filter((m): m is Mix => m !== null);

  return { source: "personalized", mixes };
}

async function buildColdStartMixes(): Promise<MixesResponse> {
  const popular = await getColdStartListings(ITEMS_PER_MIX);
  const trending: Mix = {
    id: "trending-now",
    title: "Trending Now",
    reason: "Popular with other users",
    items: popular,
  };
  return { source: "cold_start", mixes: [trending] };
}
