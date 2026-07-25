import cron from "node-cron";
import { config } from "../config";
import { refreshPairAffinityTable } from "../data/pairAffinity";

/**
 * Registers the nightly listing_pair_affinity rebuild. Runs in-process
 * (node-cron), not as a Postgres-managed cron job, so the whole service —
 * API and background jobs together — stays one portable unit. See design
 * doc Section 7.
 */
export function scheduleJobs(logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }) {
  cron.schedule(config.pairAffinity.refreshCron, async () => {
    logger.info("Starting nightly listing_pair_affinity refresh...");
    try {
      await refreshPairAffinityTable();
      logger.info("listing_pair_affinity refresh complete.");
    } catch (err) {
      logger.error("listing_pair_affinity refresh failed", err);
    }
  });
}
