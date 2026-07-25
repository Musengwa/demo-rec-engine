# Recommendation Engine

Standalone Node/TypeScript recommendation service for the listings platform.
Companion implementation to `Recommendation_Engine_Design_Spec.docx` — read
that first if anything here is unclear on *why*, this README is just *how*.

## Setup

```bash
npm install
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
```

`SUPABASE_JWT_SECRET` is in Supabase Dashboard → Project Settings → API →
JWT Settings. This is what verifies a logged-in user's token; without it
every request is treated as a guest (which is safe, just not personalized).

Run the migration once against your Supabase Postgres instance (SQL editor,
or `psql`):

```bash
migrations/001_listing_pair_affinity.sql
```

This creates `listing_pair_affinity` and the `refresh_listing_pair_affinity()`
function the nightly job calls.

## Run

```bash
npm run dev      # tsx watch, for local development
npm run build    # compiles to dist/
npm start        # runs the compiled build
```

Server listens on `PORT` (default 4000). `GET /health` should return
`{"ok":true}` once it's up.

## Project layout

```
src/
  config/        one file, every tunable number lives here
  types/         shared response contracts — match these to the frontend's
                 existing dummy-data shapes before wiring up each screen
  lib/           supabase client, TTL cache wrapper
  middleware/    auth.ts — guest-vs-JWT resolution, used by every route
  data/          all Supabase queries, one file per table/concern
  services/      the actual scoring logic (feed, explore, mixes, similar,
                 cold-start)
  routes/        thin HTTP handlers, one per endpoint
  jobs/          nightly listing_pair_affinity refresh (node-cron)
  server.ts      entrypoint — wires everything together
migrations/      raw SQL to run against Supabase directly
```

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/feed` | optional | guest → cold-start, logged in → personalized |
| GET | `/api/explore` | optional | same auth behavior, diversity re-ranked |
| GET | `/api/mixes` | optional | Dashboard mixes |
| GET | `/api/listings/:id/similar` | none | pair-affinity based, content fallback |
| POST | `/api/interactions` | **required** | records view/like/save; 401 if no valid JWT |

All GET endpoints work with or without a JWT — there is no login wall
anywhere except recording an interaction, which needs a user to attach to.

## Frontend integration

Each dummy-data call in the frontend should be swapped for a call to the
matching endpoint above. The response shapes in `src/types/index.ts` are
the contract — if they don't match what a screen currently renders, adjust
the type (and the mapping in `data/listings.ts`) rather than reshaping data
inside the frontend component.

## Known simplifications (intentional, called out in comments)

- Location matching in the feed scorer is a plain city-string match
  (`profiles.location === listings.locations.city`), not geo-distance.
  Easy to upgrade later if `profiles` gains lat/lng.
- The interactions → tag/category affinity queries fetch a fixed window
  (200 most recent) rather than paginating full history — fine at current
  scale, revisit if a user's interaction count gets large.
- Cache is in-process (cachetools-equivalent, `lru-cache`). Fine for a
  single instance; swap for Redis if this is ever run as multiple instances.
