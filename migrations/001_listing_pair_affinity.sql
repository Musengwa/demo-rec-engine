-- Run this once against the Supabase Postgres instance before starting the service.

CREATE TABLE IF NOT EXISTS public.listing_pair_affinity (
  listing_id_a uuid NOT NULL,
  listing_id_b uuid NOT NULL,
  co_bookings integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT listing_pair_affinity_pkey PRIMARY KEY (listing_id_a, listing_id_b),
  CONSTRAINT lpa_listing_a_fkey FOREIGN KEY (listing_id_a) REFERENCES public.listings(id),
  CONSTRAINT lpa_listing_b_fkey FOREIGN KEY (listing_id_b) REFERENCES public.listings(id)
);

CREATE INDEX IF NOT EXISTS idx_lpa_listing_a ON public.listing_pair_affinity(listing_id_a);

-- Called nightly by src/jobs/refreshPairAffinity.ts via supabase.rpc(...).
-- Rebuilds the whole table from confirmed/completed bookings, applying the
-- two prune rules from the design doc (min shared bookers, top-K partners).
CREATE OR REPLACE FUNCTION refresh_listing_pair_affinity(
  min_shared_bookers integer DEFAULT 3,
  top_k integer DEFAULT 20
)
RETURNS void AS $$
BEGIN
  TRUNCATE public.listing_pair_affinity;

  INSERT INTO public.listing_pair_affinity (listing_id_a, listing_id_b, co_bookings, score)
  WITH user_listings AS (
    SELECT DISTINCT user_id, listing_id
    FROM public.bookings
    WHERE status IN ('confirmed', 'completed')
  ),
  pairs AS (
    SELECT
      a.listing_id AS listing_id_a,
      b.listing_id AS listing_id_b,
      COUNT(DISTINCT a.user_id) AS co_bookings
    FROM user_listings a
    JOIN user_listings b
      ON a.user_id = b.user_id
      AND a.listing_id <> b.listing_id
    GROUP BY a.listing_id, b.listing_id
    HAVING COUNT(DISTINCT a.user_id) >= min_shared_bookers
  ),
  listing_totals AS (
    SELECT listing_id, COUNT(DISTINCT user_id) AS total_bookers
    FROM user_listings
    GROUP BY listing_id
  ),
  scored AS (
    SELECT
      p.listing_id_a,
      p.listing_id_b,
      p.co_bookings,
      p.co_bookings::numeric / GREATEST(lt.total_bookers, 1) AS score,
      ROW_NUMBER() OVER (
        PARTITION BY p.listing_id_a
        ORDER BY p.co_bookings::numeric / GREATEST(lt.total_bookers, 1) DESC
      ) AS rnk
    FROM pairs p
    JOIN listing_totals lt ON lt.listing_id = p.listing_id_b
  )
  SELECT listing_id_a, listing_id_b, co_bookings, score
  FROM scored
  WHERE rnk <= top_k;
END;
$$ LANGUAGE plpgsql;
