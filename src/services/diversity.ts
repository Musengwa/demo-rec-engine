/**
 * Greedily selects up to `limit` items from an already relevance-ordered
 * list, allowing at most `maxPerVenue` items per venue so results don't
 * cluster on a single venue (e.g. one hotel's ten rooms filling the feed).
 * Items without a venue are never capped against each other. If the cap
 * leaves us short of `limit`, backfill from the skipped remainder (still in
 * relevance order) so we never return fewer than we could.
 */
export function capPerVenue<T extends { venueId: string | null }>(
  items: T[],
  limit: number,
  maxPerVenue: number
): T[] {
  const counts = new Map<string, number>();
  const selected: T[] = [];
  const skipped: T[] = [];

  for (const item of items) {
    if (selected.length >= limit) break;

    if (item.venueId) {
      const count = counts.get(item.venueId) ?? 0;
      if (count >= maxPerVenue) {
        skipped.push(item);
        continue;
      }
      counts.set(item.venueId, count + 1);
    }

    selected.push(item);
  }

  for (const item of skipped) {
    if (selected.length >= limit) break;
    selected.push(item);
  }

  return selected;
}
