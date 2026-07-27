-- Run this once against the Supabase Postgres instance before enabling the
-- new-listing notification job (src/jobs/notifyNewListings.ts).

-- Composite PK (user_id, expo_push_token) supports multiple registered
-- devices per user; clients upsert their own token via POST /api/push-tokens.
CREATE TABLE IF NOT EXISTS public.push_tokens (
  user_id uuid NOT NULL,
  expo_push_token text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_tokens_pkey PRIMARY KEY (user_id, expo_push_token),
  CONSTRAINT push_tokens_user_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);
