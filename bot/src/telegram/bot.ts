import { Bot, InlineKeyboard } from "grammy";
import { config } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import { sendSystemLog } from "./systemLog";
import { tryCallApi } from "./api";
import { createScreeningSession, screeningUrl } from "../services/screening";
import { markGroupRemoved } from "../services/groups";

export const bot = new Bot(config.botToken);

// Onboarding: minimal text, a single web_app button into the owner panel.
bot.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const userId = BigInt(from.id);

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    await prisma.user.create({
      data: { id: userId, username: from.username ?? null, firstName: from.first_name ?? null },
    });
    await sendSystemLog({ kind: "user_started", userId, username: from.username ?? null });
  }

  const keyboard = new InlineKeyboard().webApp(
    "Открыть панель",
    `${config.miniAppUrl}/?mode=owner`
  );
  await ctx.reply("Панель управления группами.", { reply_markup: keyboard });
});

// Core: a user requested to join a guarded group.
bot.on("chat_join_request", async (ctx) => {
  // `query_id` is a Bot API 10.1 field that the SDK may not type yet.
  const update = ctx.update.chat_join_request as typeof ctx.update.chat_join_request & {
    query_id?: string;
  };
  const chatId = BigInt(update.chat.id);
  const applicant = update.from;
  const queryId = update.query_id;

  const group = await prisma.group.findUnique({ where: { chatId } });

  // Not configured or guard disabled: hand the request back to humans.
  if (!group || group.removedAt || !group.guardEnabled) {
    if (queryId) {
      await tryCallApi("answerChatJoinRequestQuery", {
        chat_join_request_query_id: queryId,
        result: "queue",
      });
    }
    return;
  }

  const session = await createScreeningSession({
    chatId,
    applicantUserId: BigInt(applicant.id),
    applicantUsername: applicant.username ?? null,
    applicantName: applicant.first_name ?? null,
    queryId: queryId ?? null,
    mode: queryId ? "query" : "legacy",
    timeoutSeconds: group.timeoutSeconds,
  });

  const url = screeningUrl(session.id);

  if (queryId) {
    // Preferred path: show the Mini App in the join request context.
    const ok = await tryCallApi("sendChatJoinRequestWebApp", {
      chat_join_request_query_id: queryId,
      web_app_url: url,
    });
    if (ok === null) {
      logger.error("sendChatJoinRequestWebApp failed; session will time out", {
        sessionId: session.id,
      });
    }
    return;
  }

  // Legacy path: DM the applicant a button to open the Mini App. Requires an
  // open DM with the bot; otherwise the session times out to the group action.
  const keyboard = new InlineKeyboard().webApp("Пройти проверку", url);
  const dm = await tryCallApi("sendMessage", {
    chat_id: applicant.id,
    text: "Проверка для вступления в группу.",
    reply_markup: keyboard,
  });
  if (dm === null) {
    logger.warn("could not DM applicant for legacy screening", {
      sessionId: session.id,
      applicant: applicant.id,
    });
  }
});

// Detect the bot being removed from a group.
bot.on("my_chat_member", async (ctx) => {
  const upd = ctx.myChatMember;
  if (upd.new_chat_member.user.id !== ctx.me.id) return;
  const status = upd.new_chat_member.status;
  if (status === "left" || status === "kicked") {
    await markGroupRemoved(BigInt(upd.chat.id));
  }
});

bot.catch((err) => {
  logger.error("bot error", { err: String(err.error) });
  void sendSystemLog({ kind: "critical_error", context: "bot", detail: String(err.error) });
});
