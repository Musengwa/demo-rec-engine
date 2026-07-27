import { getCandidatePool } from "../data/listings";
import { getVenuesByIds } from "../data/venues";
import { SimilarVenuesResponse } from "../types";

/**
 * Content-based "venues like this one" — mirrors the content_fallback path
 * in similarListings.ts, but aggregated per venue instead of per listing:
 * pool the target venue's own tags/categories, score every other active
 * listing's overlap against that pool, then sum those scores up by venue.
 * There's no venue-level booking-affinity table (only listing_pair_affinity),
 * so this content approach is the only signal available.
 */
export async function getSimilarVenues(venueId: string, limit: number): Promise<SimilarVenuesResponse> {
  const ownListings = await getCandidatePool([], 200, venueId);
  if (ownListings.length === 0) return { venues: [] };

  const sourceTags = new Set(ownListings.flatMap((l) => l.tags));
  const sourceCategories = new Set(ownListings.flatMap((l) => l.categories));

  const ownListingIds = ownListings.map((l) => l.id);
  const others = await getCandidatePool(ownListingIds, 500);

  const scoreByVenue = new Map<string, number>();
  for (const item of others) {
    if (!item.venueId || item.venueId === venueId) continue;
    const tagOverlap = item.tags.filter((t) => sourceTags.has(t)).length;
    const categoryOverlap = item.categories.filter((c) => sourceCategories.has(c)).length;
    const score = tagOverlap * 2 + categoryOverlap;
    if (score <= 0) continue;
    scoreByVenue.set(item.venueId, (scoreByVenue.get(item.venueId) ?? 0) + score);
  }

  const topVenueIds = [...scoreByVenue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const venues = await getVenuesByIds(topVenueIds);
  // preserve score-ranked order — getVenuesByIds returns in the order requested
  return { venues };
}
