import { logger } from "../logger";
import { expireDueSessions, purgeOldData } from "../services/screening";

// Periodically expire screening sessions that ran out of time and apply the
// group's configured timeout action (queue or decline).
export function startTimeoutJob(intervalMs = 30_000): NodeJS.Timeout {
  const tick = async () => {
    try {
      const handled = await expireDueSessions();
      if (handled > 0) logger.info("expired screening sessions", { handled });
    } catch (err) {
      logger.error("timeout job failed", { err: String(err) });
    }
  };
  // Stagger the first run slightly so it does not race startup.
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return timer;
}

// Periodically delete old finished sessions and journal entries so the database
// does not grow without bound.
export function startCleanupJob(intervalMs = 6 * 60 * 60 * 1000): NodeJS.Timeout {
  const tick = async () => {
    try {
      const { sessions, journal } = await purgeOldData();
      if (sessions > 0 || journal > 0) {
        logger.info("purged old data", { sessions, journal });
      }
    } catch (err) {
      logger.error("cleanup job failed", { err: String(err) });
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return timer;
}
