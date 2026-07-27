import cron from "node-cron";
import { config } from "../config";
import { runNewListingNotificationPass } from "../services/notifier";

/**
 * Registers the daily new-listing notification pass. See notifier.ts for
 * the ranking/eligibility rules; this file just wires it into node-cron,
 * matching the shape of jobs/refreshPairAffinity.ts.
 */
export function scheduleNotificationJob(logger: {
  info: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}) {
  cron.schedule(config.notifications.cron, async () => {
    logger.info("Starting daily new-listing notification pass...");
    try {
      const result = await runNewListingNotificationPass(logger);
      logger.info(`Notification pass complete: ${JSON.stringify(result)}`);
    } catch (err) {
      logger.error("New-listing notification pass failed", err);
    }
  });
}
