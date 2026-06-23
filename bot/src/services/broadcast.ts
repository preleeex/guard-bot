import { prisma } from "../db";
import { callApi, tryCallApi, TelegramApiError } from "../telegram/api";
import { logger } from "../logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Send a message to every user. Long-running: callers run it in the background.
// Handles flood limits (one retry) and removes users who blocked the bot.
export async function broadcastToAll(text: string): Promise<{ sent: number; removed: number }> {
  const users = await prisma.user.findMany({ select: { id: true } });
  let sent = 0;
  let removed = 0;
  for (const u of users) {
    try {
      await callApi("sendMessage", { chat_id: Number(u.id), text });
      sent += 1;
    } catch (err) {
      const code = err instanceof TelegramApiError ? err.errorCode : undefined;
      if (code === 429) {
        await sleep(2000);
        const ok = await tryCallApi("sendMessage", { chat_id: Number(u.id), text });
        if (ok !== null) sent += 1;
      } else if (code === 403) {
        const done = await prisma.user.delete({ where: { id: u.id } }).then(() => true).catch(() => false);
        if (done) removed += 1;
      }
    }
    await sleep(40);
  }
  logger.info("broadcast complete", { sent, removed });
  return { sent, removed };
}
