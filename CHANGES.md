# Recommendation Engine — Changes (2026-07-27)

Adapts the engine to the new `venues`/`locations` schema and adds a daily
new-listing notification pass with real Expo push delivery. This doc is
meant to be pasted to whoever owns the Expo app so they can wire it up.

## 1. Schema adaptation (transparent to clients)

`listings` no longer links to a location directly — it goes through
`listings.venue_id → venues.id → venues.location_id → locations.id`. All of
`/api/feed`, `/api/explore`, `/api/mixes`, `/api/listings/:id/similar` still
return the same `location: { city, country, lat, lng } | null` shape as
before, just sourced through the venue now. Nothing to change on the client
for this part.

**One additive change to watch for:** every `ListingCard` now also carries:

```ts
venueId: string | null;
venueName: string | null;
```

If the frontend has a `ListingCard` type/interface mirrored locally, add
these two fields so a display card can show/link to its venue.

## 2. New endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/venues/:id/listings` | optional | listings at one venue, ranked for the caller the same way Feed is (guest/cold-start → newest first) |
| GET | `/api/venues/:id/similar` | none | content-based "venues like this one" |
| POST | `/api/push-tokens` | **required** | registers an Expo push token for the logged-in user |

```ts
// GET /api/venues/:id/listings
interface VenueListingsResponse {
  venue: { id: string; name: string; description: string | null; location: {...} | null };
  source: "personalized" | "cold_start";
  items: ListingCard[];
  nextCursor: string | null;
}

// GET /api/venues/:id/similar
interface SimilarVenuesResponse {
  venues: { id: string; name: string; description: string | null; location: {...} | null }[];
}
```

A missing venue id returns `404 { ok: false, error: "Venue not found." }`.

## 3. Connecting Expo push notifications

The engine now runs a daily 8am job that scores newly-created listings
per user and writes rows into `public.notifications` (`type:
"listing_match"`), then sends the actual push via Expo's push service to
whichever of that user's devices are registered. Getting real pushes
flowing requires three things on the Expo side.

### 3.1 Run the new migration

```bash
migrations/002_push_tokens.sql
```

Creates `public.push_tokens (user_id, expo_push_token)` — composite PK, so
a user can have more than one registered device. The engine writes to this
table with the service-role key, so no RLS policy is required for the
engine itself to work; add a policy only if the app will ever read/delete
its own rows directly via a client-side Supabase call.

### 3.2 Register the device token after login

```ts
import * as Notifications from "expo-notifications";

async function registerForPush(apiBaseUrl: string, supabaseAccessToken: string) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
    projectId: "<your-eas-project-id>",
  });

  await fetch(`${apiBaseUrl}/api/push-tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAccessToken}`,
    },
    body: JSON.stringify({ token: expoPushToken }),
  });
}
```

Call this once after sign-in (and again if the token changes — Expo can
rotate it). `Authorization` must be the user's Supabase session JWT, same
header every other authenticated call to this API already uses; a missing
or invalid token gets a `401`, not silently treated as guest, since a
push-token registration with no user to attach it to is meaningless.

### 3.3 Handling a received notification

The push message itself carries a **title/body summary** (single listing's
title, or `"N new listings you might like"` if several matched that day)
and a `data` payload of:

```json
{ "notificationIds": ["<uuid>", "..."] }
```

This is intentionally just the notification row id(s), not the listing id
directly — when several new listings matched in one run they're bundled
into a single push. On tap, fetch the actual row(s) to deep-link:

```ts
const { data } = await supabase
  .from("notifications")
  .select("id, title, body, data")
  .in("id", response.notification.request.content.data.notificationIds);

// each row's own `data` column has { listingId, venueId, listingType } —
// use that to navigate to the listing (or the venue) directly if there's
// exactly one, otherwise open a notifications inbox screen.
```

### 3.4 Reading / marking-as-read (assumption to confirm)

This engine only **writes** notification rows and sends the push — it does
not expose a `GET /api/notifications` list endpoint. The assumption is that
an in-app notification inbox reads `public.notifications` directly via the
app's own Supabase client (`select * where user_id = auth.uid() order by
created_at desc`) and flips `is_read` with a direct `update`, the same way
it presumably already does for the existing `booking_status` notification
type. **Flag this back to me if that's not how the app is set up** — if you
want the engine to own a read/mark-read API instead, that's a small
addition on top of what's here.

## 4. New config knobs (`src/config/index.ts`)

```ts
notifications: {
  cron: "0 8 * * *",                    // daily run time
  maxNewListingNotificationsPerUser: 5,  // cap per user per run
  newListingFallbackWindowHours: 24,     // "new" window used only on the very first-ever run
}
```

## 5. Everything else from this change (for reference)

- `capPerVenue` anti-clustering: Feed caps 3 results/venue, Mixes cap 2/venue,
  Explore's diversity re-ranker treats same-venue as similarity too.
- Notification eligibility: every profile; personalized tag/category scoring
  above the usual interaction threshold, newest-first otherwise; hosts are
  never notified about their own new listings; best-effort (a quiet day can
  mean zero notifications — there's no forced minimum).
