import { config } from "../config";
import { getAllProfileIds } from "../data/profiles";
import { countUserInteractions, getUserInteractions } from "../data/interactions";
import { getUserTagAffinity, getUserCategoryAffinity } from "../data/tags";
import {
  getLastNotificationRunAt,
  getNewListingsSince,
  insertNotifications,
  markPushSent,
  NotificationInsert,
} from "../data/notifications";
import { getTokensForUsers } from "../data/pushTokens";
import { sendPushNotifications } from "../lib/expoPush";
import { ListingCard } from "../types";

function normalize(map: Map<string, number>): Map<string, number> {
  const max = Math.max(1, ...map.values());
  const out = new Map<string, number>();
  for (const [k, v] of map) out.set(k, v / max);
  return out;
}

function overlapScore(itemTags: string[], affinity: Map<string, number>): number {
  if (itemTags.length === 0) return 0;
  const total = itemTags.reduce((sum, tag) => sum + (affinity.get(tag) ?? 0), 0);
  return total / itemTags.length;
}

function notificationCopyFor(listing: ListingCard): { title: string; body: string } {
  return {
    title: "New listing you might like",
    body: listing.location?.city ? `${listing.title} — ${listing.location.city}` : listing.title,
  };
}

export interface NotificationRunResult {
  newListingsFound: number;
  usersNotified: number;
  notificationsSent: number;
  pushesSent: number;
}

/**
 * Daily pass: finds listings created since the last run, ranks them per user
 * (personalized tag/category overlap for established users, newest-first for
 * cold-start users), writes listing_match notification rows, and pushes via
 * Expo to whichever of those users have a registered device token.
 * Best-effort by design — a day with no qualifying new listings, or a user
 * with no positive overlap, simply gets nothing. Hosts are never notified
 * about their own new listings.
 */
export async function runNewListingNotificationPass(
  logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void } = console
): Promise<NotificationRunResult> {
  const since = await getLastNotificationRunAt();
  const candidates = await getNewListingsSince(since);

  if (candidates.length === 0) {
    logger.info(`No new listings since ${since}; skipping notification pass.`);
    return { newListingsFound: 0, usersNotified: 0, notificationsSent: 0, pushesSent: 0 };
  }

  const userIds = await getAllProfileIds();
  const cap = config.notifications.maxNewListingNotificationsPerUser;

  const rows: NotificationInsert[] = [];

  for (const userId of userIds) {
    const eligible = candidates.filter((c) => c.hostId !== userId);
    if (eligible.length === 0) continue;

    const interactionCount = await countUserInteractions(userId);
    let picks: ListingCard[];

    if (interactionCount < config.coldStart.minInteractionsForPersonalization) {
      // no meaningful scoring basis for same-day listings — just the newest
      picks = eligible.slice(0, cap).map((c) => c.card);
    } else {
      const [interactions, tagAffinityRaw, categoryAffinityRaw] = await Promise.all([
        getUserInteractions(userId, 200),
        getUserTagAffinity(userId),
        getUserCategoryAffinity(userId),
      ]);
      const alreadySeenIds = new Set(interactions.map((i) => i.listing_id));
      const tagAffinity = normalize(tagAffinityRaw);
      const categoryAffinity = normalize(categoryAffinityRaw);

      const scored = eligible
        .filter((c) => !alreadySeenIds.has(c.card.id))
        .map((c) => {
          const tagScore = overlapScore(c.card.tags, tagAffinity);
          const categoryScore = overlapScore(c.card.categories, categoryAffinity);
          return { card: c.card, score: tagScore * 0.6 + categoryScore * 0.4 };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);

      picks = scored.slice(0, cap).map((s) => s.card);
    }

    for (const listing of picks) {
      const { title, body } = notificationCopyFor(listing);
      rows.push({
        user_id: userId,
        type: "listing_match",
        title,
        body,
        data: { listingId: listing.id, venueId: listing.venueId, listingType: listing.listingType },
      });
    }
  }

  const inserted = await insertNotifications(rows);
  // insert().select() preserves the order of the values list we sent, so this zips 1:1
  const insertedWithCopy = inserted.map((row, i) => ({ ...row, title: rows[i].title, body: rows[i].body }));

  const byUser = new Map<string, { id: string; title: string; body: string }[]>();
  for (const row of insertedWithCopy) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({ id: row.id, title: row.title, body: row.body });
    byUser.set(row.user_id, list);
  }

  logger.info(`Inserted ${inserted.length} listing_match notifications for ${byUser.size} users.`);

  const tokensByUser = await getTokensForUsers([...byUser.keys()]);

  const messages: { to: string; title: string; body: string; data?: Record<string, unknown> }[] = [];
  const messageNotificationIds: string[][] = [];
  for (const [userId, userNotifications] of byUser) {
    const tokens = tokensByUser.get(userId) ?? [];
    if (tokens.length === 0) continue;

    const notificationIds = userNotifications.map((n) => n.id);
    const summary =
      userNotifications.length === 1
        ? userNotifications[0]
        : { title: `${userNotifications.length} new listings you might like`, body: userNotifications.map((n) => n.title).slice(0, 3).join(", ") };

    for (const token of tokens) {
      messages.push({ to: token, title: summary.title, body: summary.body, data: { notificationIds } });
      messageNotificationIds.push(notificationIds);
    }
  }

  let pushesSent = 0;
  const sentNotificationIds = new Set<string>();
  if (messages.length > 0) {
    const results = await sendPushNotifications(messages);
    results.forEach((ok, i) => {
      if (ok) {
        pushesSent++;
        for (const id of messageNotificationIds[i]) sentNotificationIds.add(id);
      }
    });
  }

  await markPushSent([...sentNotificationIds]);

  return {
    newListingsFound: candidates.length,
    usersNotified: byUser.size,
    notificationsSent: inserted.length,
    pushesSent,
  };
}
