// Shared response contracts.
// These are intentionally the source of truth for what every endpoint returns.
// Match these shapes to whatever the frontend's dummy data currently looks like
// before wiring up each screen — adjust field names here, not per-route.

export type ListingType = "stay" | "event" | "offering";

export interface ListingCard {
  id: string;
  title: string;
  listingType: ListingType;
  price: number | null;
  coverImageUrl: string | null;
  location: {
    city: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  venueId: string | null;
  venueName: string | null;
  tags: string[];
  categories: string[];
  score?: number; // present on scored results (feed/explore/similar), omitted for plain lists
}

export interface VenueSummary {
  id: string;
  name: string;
  description: string | null;
  location: {
    city: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
}

export interface VenueListingsResponse {
  venue: VenueSummary;
  source: "personalized" | "cold_start";
  items: ListingCard[];
  nextCursor: string | null;
}

export interface SimilarVenuesResponse {
  venues: VenueSummary[];
}

export interface FeedResponse {
  source: "personalized" | "cold_start";
  items: ListingCard[];
  nextCursor: string | null;
}

export interface ExploreResponse {
  source: "personalized" | "cold_start";
  items: ListingCard[];
  nextCursor: string | null;
}

export interface Mix {
  id: string; // stable slug, e.g. "weekend-getaways"
  title: string; // e.g. "Weekend Getaways For You"
  reason: string; // short human-readable explanation, e.g. "Based on your interest in Weekend"
  items: ListingCard[];
}

export interface MixesResponse {
  source: "personalized" | "cold_start";
  mixes: Mix[];
}

export interface SimilarListingsResponse {
  source: "pair_affinity" | "content_fallback";
  items: ListingCard[];
}

export interface InteractionPayload {
  listingId: string;
  action: "view" | "like" | "save" | "unlike" | "unsave";
  // maps to interactions.score in the DB; caller may omit and let the
  // server assign a default score per action type
  score?: -1 | 0 | 1 | 3 | 5 | 7;
}

export interface InteractionResponse {
  ok: true;
  interactionId: string;
}

// internal — not returned directly, but shared between data layer and services
export interface AuthContext {
  isGuest: boolean;
  userId: string | null;
}
