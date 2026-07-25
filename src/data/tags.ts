import { supabase } from "../lib/supabaseClient";
import { config } from "../config";

function decayWeight(updatedAt: string): number {
  const ageDays = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const halfLife = config.scoring.interactionHalfLifeDays;
  return Math.pow(0.5, ageDays / halfLife);
}

/**
 * Builds a weighted tag-name -> weight map for a user, based on the tags
 * attached to listings they've positively interacted with. Weight combines
 * two things: interaction score (a "saved" listing's tags count more than a
 * merely "viewed" one) and recency decay (older interactions count less,
 * halving in influence every `interactionHalfLifeDays`).
 */
export async function getUserTagAffinity(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("interactions")
    .select("listing_id, score, updated_at, listings ( tag_listings ( tags ( name ) ) )")
    .eq("user_id", userId)
    .gt("score", 0);

  if (error) throw error;

  const affinity = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const weight = row.score * decayWeight(row.updated_at);
    const tagNames: string[] = (row.listings?.tag_listings ?? []).map((t: any) => t.tags?.name).filter(Boolean);
    for (const name of tagNames) {
      affinity.set(name, (affinity.get(name) ?? 0) + weight);
    }
  }
  return affinity;
}

export async function getUserCategoryAffinity(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("interactions")
    .select("listing_id, score, updated_at, listings ( category_listings ( categories ( name ) ) )")
    .eq("user_id", userId)
    .gt("score", 0);

  if (error) throw error;

  const affinity = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const weight = row.score * decayWeight(row.updated_at);
    const categoryNames: string[] = (row.listings?.category_listings ?? [])
      .map((c: any) => c.categories?.name)
      .filter(Boolean);
    for (const name of categoryNames) {
      affinity.set(name, (affinity.get(name) ?? 0) + weight);
    }
  }
  return affinity;
}

/** The single most recent positively-scored listing a user interacted with. */
export async function getMostRecentPositiveListingId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("interactions")
    .select("listing_id, updated_at")
    .eq("user_id", userId)
    .gt("score", 0)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.listing_id ?? null;
}
