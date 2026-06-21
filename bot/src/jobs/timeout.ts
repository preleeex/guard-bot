import { logger } from "../logger";
import { expireDueSessions } from "../services/screening";

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
