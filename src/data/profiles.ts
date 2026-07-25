import { supabase } from "../lib/supabaseClient";

/**
 * Returns the user's free-text location string (profiles.location).
 * Used for a simple city-level match against listing locations.city.
 * This is intentionally basic (string equality, not geo-distance) — swap
 * in a real distance calculation later if profiles gain lat/lng.
 */
export async function getUserLocation(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("location").eq("id", userId).maybeSingle();

  if (error) throw error;
  return data?.location ?? null;
}
