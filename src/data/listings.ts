import { supabase } from "../lib/supabaseClient";
import { ListingCard, ListingType } from "../types";

// A listing's location is no longer a direct FK — it hangs off the listing's
// venue instead: listings.venue_id -> venues.id -> venues.location_id -> locations.id.
// venues.location_id is nullable, so a venue (and therefore its listings) can
// legitimately have no resolved location.
const LISTING_SELECT = `
  id, title, listing_type, price, is_active,
  venues ( id, name, locations ( city, country, lat, lng ) ),
  tag_listings ( tags ( name ) ),
  category_listings ( categories ( name ) )
`;

// Raw shape returned by the enrichment query above, before mapping to ListingCard.
interface ListingRow {
  id: string;
  title: string;
  listing_type: ListingType;
  price: number | null;
  is_active: boolean;
  venues: {
    id: string;
    name: string;
    locations: { city: string | null; country: string | null; lat: number | null; lng: number | null } | null;
  } | null;
  images: { image_url: string }[];
  tag_listings: { tags: { name: string } }[];
  category_listings: { categories: { name: string } }[];
}

function mapRow(row: ListingRow, score?: number): ListingCard {
  const venueLocation = row.venues?.locations ?? null;
  return {
    id: row.id,
    title: row.title,
    listingType: row.listing_type,
    price: row.price,
    coverImageUrl: row.images?.[0]?.image_url ?? null,
    location: venueLocation
      ? { city: venueLocation.city, country: venueLocation.country, lat: venueLocation.lat, lng: venueLocation.lng }
      : null,
    venueId: row.venues?.id ?? null,
    venueName: row.venues?.name ?? null,
    tags: (row.tag_listings ?? []).map((t) => t.tags.name),
    categories: (row.category_listings ?? []).map((c) => c.categories.name),
    ...(score !== undefined ? { score } : {}),
  };
}

// Cover image lives in one of three type-specific tables. This helper picks
// the right one at query time rather than needing a unified images table.
function imageTableFor(listingType: ListingType): "stay_images" | "event_images" | "offering_images" {
  if (listingType === "stay") return "stay_images";
  if (listingType === "event") return "event_images";
  return "offering_images";
}

/**
 * Fetch enriched listing rows (location + tags + categories + cover image)
 * for a given set of listing ids. Used by every scorer as the final step
 * before returning results to a route.
 */
export async function getListingsByIds(ids: string[]): Promise<ListingCard[]> {
  if (ids.length === 0) return [];

  // listings can be of mixed type, so we fetch base rows first, then
  // attach the correct image table per row.
  const { data: baseRows, error } = await supabase
    .from("listings")
    .select(LISTING_SELECT)
    .in("id", ids)
    .eq("is_active", true);

  if (error) throw error;
  if (!baseRows) return [];

  const byType: Record<ListingType, string[]> = { stay: [], event: [], offering: [] };
  for (const row of baseRows as unknown as ListingRow[]) {
    byType[row.listing_type].push(row.id);
  }

  const imagesByListingId: Record<string, string> = {};
  for (const listingType of Object.keys(byType) as ListingType[]) {
    const listingIds = byType[listingType];
    if (listingIds.length === 0) continue;
    const table = imageTableFor(listingType);
    const { data: imgRows } = await supabase
      .from(table)
      .select("listing_id, image_url, is_cover, sort_order")
      .in("listing_id", listingIds)
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true });
    for (const img of imgRows ?? []) {
      if (!imagesByListingId[img.listing_id]) {
        imagesByListingId[img.listing_id] = img.image_url;
      }
    }
  }

  const cards = (baseRows as unknown as ListingRow[]).map((row) =>
    mapRow({ ...row, images: imagesByListingId[row.id] ? [{ image_url: imagesByListingId[row.id] }] : [] })
  );

  // preserve the order the caller passed in (important: scorers pass ids
  // already ranked by score, and we don't want to lose that ordering)
  const byId = new Map(cards.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is ListingCard => Boolean(c));
}

/**
 * Fetch a pool of active, enriched candidate listings, excluding ones the
 * user has already interacted with. This is the pool the feed/explore
 * scorers rank. `limit` here is the pool size, not the final page size —
 * scorers pull a larger pool than they return so ranking has something to
 * work with.
 *
 * `venueId`, when passed, scopes the pool to a single venue — used by the
 * venue-page scorer.
 */
export async function getCandidatePool(
  excludeIds: string[],
  poolLimit: number,
  venueId?: string
): Promise<ListingCard[]> {
  // newest-first: gives every pool a deterministic order, and lets cold-start
  // callers (e.g. the venue page for guests) just take the pool as-is.
  let query = supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(poolLimit);

  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return [];

  const ids = (data as unknown as ListingRow[]).map((r) => r.id);
  return getListingsByIds(ids);
}


export async function getPopularListingIds(limit: number): Promise<string[]> {
  const { data, error } = await supabase
    .from("interactions")
    .select("listing_id, score")
    .gt("score", 0);

  if (error) throw error;
  if (!data) return [];

  const totals = new Map<string, number>();
  for (const row of data) {
    totals.set(row.listing_id, (totals.get(row.listing_id) ?? 0) + row.score);
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([listingId]) => listingId);
}
