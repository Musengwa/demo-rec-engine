import { supabase } from "../lib/supabaseClient";
import { VenueSummary } from "../types";

interface VenueRow {
  id: string;
  name: string;
  description: string | null;
  locations: { city: string | null; country: string | null; lat: number | null; lng: number | null } | null;
}

function mapVenueRow(row: VenueRow): VenueSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    location: row.locations
      ? { city: row.locations.city, country: row.locations.country, lat: row.locations.lat, lng: row.locations.lng }
      : null,
  };
}

export async function getVenueById(id: string): Promise<VenueSummary | null> {
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, description, locations ( city, country, lat, lng )")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapVenueRow(data as unknown as VenueRow);
}

export async function getVenuesByIds(ids: string[]): Promise<VenueSummary[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, description, locations ( city, country, lat, lng )")
    .in("id", ids);

  if (error) throw error;
  if (!data) return [];

  const byId = new Map((data as unknown as VenueRow[]).map((row) => [row.id, mapVenueRow(row)]));
  return ids.map((id) => byId.get(id)).filter((v): v is VenueSummary => Boolean(v));
}
