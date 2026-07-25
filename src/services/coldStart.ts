import { getListingsByIds, getPopularListingIds } from "../data/listings";
import { ListingCard } from "../types";

/**
 * Shared fallback path for guests, brand-new users, and users with too few
 * interactions to personalize meaningfully. See design doc Section 4 —
 * these three cases all resolve to this same function.
 */
export async function getColdStartListings(limit: number): Promise<ListingCard[]> {
  const popularIds = await getPopularListingIds(limit);
  return getListingsByIds(popularIds);
}
