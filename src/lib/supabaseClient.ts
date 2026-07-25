import { createClient } from "@supabase/supabase-js";
import { config } from "../config";

// Service-role key: this bypasses RLS. This service is trusted backend code,
// same pattern already used elsewhere on the platform (e.g. LeaseAI).
// Because RLS is bypassed, the auth middleware (see middleware/auth.ts) is
// the ONLY thing standing between a request and another user's data —
// every query in data/ must be scoped by the userId it's given, never trust
// a userId passed loosely from elsewhere.
export const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
