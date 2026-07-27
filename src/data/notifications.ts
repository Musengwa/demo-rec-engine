import { supabase } from "../lib/supabaseClient";
import { config } from "../config";
import { getListingsByIds } from "./listings";
import { ListingCard } from "../types";

export interface NewListingCandidate {
  card: ListingCard;
  hostId: string;
}

export interface NotificationInsert {
  user_id: string;
  type: "listing_match";
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * Watermark for "new since" — the most recent listing_match notification
 * this job has ever sent. Falls back to a rolling window on the very first
 * run, so we don't sweep in the platform's entire listing history.
 */
export async function getLastNotificationRunAt(): Promise<string> {
  const { data, error } = await supabase
    .from("notifications")
    .select("created_at")
    .eq("type", "listing_match")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data?.created_at) return data.created_at;

  const fallback = new Date(Date.now() - config.notifications.newListingFallbackWindowHours * 60 * 60 * 1000);
  return fallback.toISOString();
}

/** Active listings created after `sinceIso`, newest first, alongside their host id. */
export async function getNewListingsSince(sinceIso: string): Promise<NewListingCandidate[]> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, host_id, created_at")
    .eq("is_active", true)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const hostByListingId = new Map(data.map((row) => [row.id, row.host_id as string]));
  const ids = data.map((row) => row.id);
  const cards = await getListingsByIds(ids); // preserves the newest-first order passed in

  return cards.map((card) => ({ card, hostId: hostByListingId.get(card.id) as string }));
}

export async function insertNotifications(rows: NotificationInsert[]): Promise<{ id: string; user_id: string }[]> {
  if (rows.length === 0) return [];

  const { data, error } = await supabase.from("notifications").insert(rows).select("id, user_id");
  if (error) throw error;
  return data ?? [];
}

export async function markPushSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase.from("notifications").update({ push_sent: true }).in("id", ids);
  if (error) throw error;
}
