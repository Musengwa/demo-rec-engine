import { getTopPairPartners } from "../data/pairAffinity";
import { getListingsByIds, getCandidatePool } from "../data/listings";
import { SimilarListingsResponse } from "../types";

const MIN_PAIR_RESULTS_BEFORE_FALLBACK = 3;

/**
 * "People who booked this also booked" — reads listing_pair_affinity first.
 * If that table is sparse for this listing (new listing, low booking volume;
 * expected early on, see design doc Section 3.1), falls back to a
 * content-based match on shared tags/categories instead of returning
 * an empty or tiny list.
 */
export async function getSimilarListings(listingId: string, limit: number): Promise<SimilarListingsResponse> {
  const partners = await getTopPairPartners(listingId, limit);

  if (partners.length >= MIN_PAIR_RESULTS_BEFORE_FALLBACK) {
    const items = await getListingsByIds(partners.map((p) => p.listing_id_b));
    return { source: "pair_affinity", items };
  }

  const [source] = await getListingsByIds([listingId]);
  if (!source) {
    return { source: "content_fallback", items: [] };
  }

  const pool = await getCandidatePool([listingId], 200);
  const scored = pool
    .map((item) => {
      const tagOverlap = item.tags.filter((t) => source.tags.includes(t)).length;
      const categoryOverlap = item.categories.filter((c) => source.categories.includes(c)).length;
      return { ...item, score: tagOverlap * 2 + categoryOverlap };
    })
    .filter((item) => (item.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  return { source: "content_fallback", items: scored };
}
