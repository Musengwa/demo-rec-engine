import { supabase } from "../lib/supabaseClient";
import { ListingType } from "../types";

/**
 * Per-listing-type average spend for a user, computed at request time —
 * NOT stored. See design doc Section 3.2: blending across listing types
 * would hide real patterns (e.g. big spender on food, budget on stays).
 */
export async function getUserPriceProfile(
  userId: string
): Promise<Partial<Record<ListingType, { avg: number; count: number }>>> {
  const { data, error } = await supabase
    .from("bookings")
    .select("price_at_booking, listing_type")
    .eq("user_id", userId)
    .in("status", ["confirmed", "completed"]);

  if (error) throw error;

  const buckets: Record<string, number[]> = {};
  for (const row of data ?? []) {
    if (row.price_at_booking == null) continue;
    buckets[row.listing_type] ??= [];
    buckets[row.listing_type].push(Number(row.price_at_booking));
  }

  const result: Partial<Record<ListingType, { avg: number; count: number }>> = {};
  for (const [type, prices] of Object.entries(buckets)) {
    result[type as ListingType] = {
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length,
    };
  }
  return result;
}

/** Simple 3-tier bucket over a raw price, used on both the user and listing side. */
export function priceTier(price: number | null): "budget" | "mid" | "premium" | "unknown" {
  if (price == null) return "unknown";
  if (price < 500) return "budget";
  if (price < 2000) return "mid";
  return "premium";
}
