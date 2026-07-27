import { supabase } from "../lib/supabaseClient";

/** Registers/refreshes a device's Expo push token for a user (see migrations/002_push_tokens.sql). */
export async function upsertPushToken(userId: string, expoPushToken: string): Promise<void> {
  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      { user_id: userId, expo_push_token: expoPushToken, updated_at: new Date().toISOString() },
      { onConflict: "user_id,expo_push_token" }
    );

  if (error) throw error;
}

/** All registered device tokens for a set of users, keyed by user id. Used by the notification job. */
export async function getTokensForUsers(userIds: string[]): Promise<Map<string, string[]>> {
  const byUser = new Map<string, string[]>();
  if (userIds.length === 0) return byUser;

  const { data, error } = await supabase
    .from("push_tokens")
    .select("user_id, expo_push_token")
    .in("user_id", userIds);

  if (error) throw error;

  for (const row of data ?? []) {
    const existing = byUser.get(row.user_id) ?? [];
    existing.push(row.expo_push_token);
    byUser.set(row.user_id, existing);
  }
  return byUser;
}
