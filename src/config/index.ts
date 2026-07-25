import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  server: {
    port: Number(process.env.PORT ?? 4000),
    nodeEnv: process.env.NODE_ENV ?? "development",
  },

  supabase: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    jwtSecret: required("SUPABASE_JWT_SECRET"),
  },

  // --- tunable numbers (see design doc, Section 8.2) ---
  pairAffinity: {
    minSharedBookers: 3, // prune pairs with fewer shared bookers than this
    topKPartners: 20, // cap on stored partners per listing
    refreshCron: "0 3 * * *", // 3am daily
  },

  coldStart: {
    // below this many interactions+bookings, a "logged in" user still
    // gets the cold-start / popularity path rather than personalized scoring
    minInteractionsForPersonalization: 5,
  },

  cache: {
    feedTtlMs: 5 * 60 * 1000, // 5 minutes
    exploreTtlMs: 5 * 60 * 1000,
    mixesTtlMs: 15 * 60 * 1000,
    similarTtlMs: 60 * 60 * 1000, // pair affinity only refreshes nightly, so cache longer
    maxEntries: 5000,
  },

  scoring: {
    // relative weight given to each signal when ranking the feed
    weights: {
      tagOverlap: 0.35,
      categoryOverlap: 0.2,
      locationProximity: 0.2,
      recencyDecayedInteraction: 0.25,
    },
    // recency decay half-life, in days, for weighting past interactions
    interactionHalfLifeDays: 21,
    // explore page: how strongly to penalize similarity to what the user
    // already engages with (MMR-style diversity re-ranking), 0-1
    exploreDiversityLambda: 0.55,
  },

  listingRequirements: {
    minTags: 8,
    minCategories: 3,
  },

  pagination: {
    defaultPageSize: 20,
    maxPageSize: 50,
  },
};
