import { supabase } from "../lib/supabaseClient";
import { config } from "../config";

export interface PairAffinityRow {
  listing_id_b: string;
  score: number;
  co_bookings: number;
}

/** Top-K partners for a given listing, read from the nightly-refreshed table. */
export async function getTopPairPartners(listingId: string, limit = 10): Promise<PairAffinityRow[]> {
  const { data, error } = await supabase
    .from("listing_pair_affinity")
    .select("listing_id_b, score, co_bookings")
    .eq("listing_id_a", listingId)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * Rebuilds listing_pair_affinity from confirmed/completed bookings.
 * This is the query-layer function called by the nightly job in jobs/refreshPairAffinity.ts.
 * Mirrors the SQL in the design doc appendix, expressed as a single RPC call
 * for simplicity — see the SQL function this expects in the accompanying
 * migration (refresh_listing_pair_affinity()).
 */
export async function refreshPairAffinityTable(): Promise<void> {
  const { error } = await supabase.rpc("refresh_listing_pair_affinity", {
    min_shared_bookers: config.pairAffinity.minSharedBookers,
    top_k: config.pairAffinity.topKPartners,
  });
  if (error) throw error;
}
