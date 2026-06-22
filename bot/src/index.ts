import { config } from "./config";
import { logger } from "./logger";
import { prisma } from "./db";
import { bot } from "./telegram/bot";
import { buildApp } from "./api/server";
import { startTimeoutJob, startCleanupJob } from "./jobs/timeout";
import { getMe } from "./telegram/api";

async function main() {
  // Initialize bot info (needed for my_chat_member self-detection in webhook mode).
  await bot.init();

  const me = await getMe();
  if (!me.supports_join_request_queries) {
    logger.warn(
      "bot does not report supports_join_request_queries; running in legacy fallback mode"
    );
  }

  const app = buildApp();
  const server = app.listen(config.port, () => {
    logger.info("backend listening", { port: config.port, bot: me.username });
  });

  startTimeoutJob();
  startCleanupJob();

  const shutdown = async (signal: string) => {
    logger.info("shutting down", { signal });
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("fatal startup error", { err: String(err) });
  process.exit(1);
});
