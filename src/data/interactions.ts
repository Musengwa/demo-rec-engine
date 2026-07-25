import { supabase } from "../lib/supabaseClient";
import { InteractionPayload } from "../types";

// default score assigned per action type when the caller doesn't specify one
const DEFAULT_SCORE_BY_ACTION: Record<InteractionPayload["action"], -1 | 0 | 1 | 3 | 5 | 7> = {
  view: 1,
  like: 5,
  save: 7,
  unlike: -1,
  unsave: -1,
};

export interface InteractionRow {
  id: string;
  user_id: string;
  listing_id: string;
  last_action: string;
  score: number;
  created_at: string;
  updated_at: string;
}

/**
 * Get a user's interaction history, most recent first. Used by the feed and
 * explore scorers to build a tag/category affinity profile.
 */
export async function getUserInteractions(userId: string, limit = 200): Promise<InteractionRow[]> {
  const { data, error } = await supabase
    .from("interactions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function countUserInteractions(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Upsert an interaction: if the user already has a row for this listing,
 * update it (bump score, refresh updated_at) rather than creating a duplicate.
 */
export async function recordInteraction(
  userId: string,
  payload: InteractionPayload
): Promise<InteractionRow> {
  const score = payload.score ?? DEFAULT_SCORE_BY_ACTION[payload.action];

  const { data: existing } = await supabase
    .from("interactions")
    .select("id, score")
    .eq("user_id", userId)
    .eq("listing_id", payload.listingId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("interactions")
      .update({
        last_action: payload.action,
        score,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("interactions")
    .insert({
      user_id: userId,
      listing_id: payload.listingId,
      last_action: payload.action,
      score,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
