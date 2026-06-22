import { Bot, InlineKeyboard } from "grammy";
import { config, isBotOwner } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import { sendSystemLog } from "./systemLog";
import { tryCallApi } from "./api";
import { createScreeningSession, screeningUrl } from "../services/screening";
import { markGroupRemoved, connectGroup } from "../services/groups";
import { isBanned, banUser, unbanUser } from "../services/moderation";

export const bot = new Bot(config.botToken);

// Onboarding: minimal text, a single web_app button into the owner panel.
bot.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const userId = BigInt(from.id);

  // Banned users are ignored entirely.
  if (await isBanned(userId)) return;

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    await prisma.user.create({
      data: { id: userId, username: from.username ?? null, firstName: from.first_name ?? null },
    });
    await sendSystemLog({
      kind: "user_started",
      userId,
      username: from.username ?? null,
      firstName: from.first_name ?? null,
    });
  }

  // Deep link: /start verify_<sessionId> resumes a pending screening so the
  // applicant can reach the Mini App even without an open DM beforehand.
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (payload.startsWith("verify_")) {
    const sessionId = payload.slice("verify_".length);
    const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } });
    if (
      session &&
      session.applicantUserId === userId &&
      session.status === "pending" &&
      session.expiresAt.getTime() > Date.now()
    ) {
      const kb = new InlineKeyboard().webApp("Пройти проверку", screeningUrl(sessionId));
      await ctx.reply("Проверка для вступления в группу.", { reply_markup: kb });
      return;
    }
    await ctx.reply("Проверка не найдена или уже завершена.");
    return;
  }

  const keyboard = new InlineKeyboard().webApp(
    "Открыть панель",
    `${config.miniAppUrl}/?mode=owner`
  );
  await ctx.reply("Панель управления группами.", { reply_markup: keyboard });
});

// Utility: reply with the current chat id. Use it in the log group to learn the
// correct SYSTEM_LOG_CHAT_ID, or in any chat to get its id.
bot.command("chatid", async (ctx) => {
  await ctx.reply(`chat_id: ${ctx.chat.id}\ntype: ${ctx.chat.type}`);
});

// Operator moderation: /ban <user_id> [reason], /unban <user_id>.
bot.command("ban", async (ctx) => {
  if (!ctx.from || !isBotOwner(ctx.from.id)) return;
  const parts = (ctx.match ?? "").trim().split(/\s+/).filter(Boolean);
  const target = parts[0];
  if (!target || !/^\d+$/.test(target)) {
    await ctx.reply("Использование: /ban <user_id> [причина]");
    return;
  }
  await banUser(BigInt(target), BigInt(ctx.from.id), parts.slice(1).join(" ") || undefined);
  await ctx.reply(`Забанен ${target}.`);
});

bot.command("unban", async (ctx) => {
  if (!ctx.from || !isBotOwner(ctx.from.id)) return;
  const target = (ctx.match ?? "").trim();
  if (!/^\d+$/.test(target)) {
    await ctx.reply("Использование: /unban <user_id>");
    return;
  }
  await unbanUser(BigInt(target));
  await ctx.reply(`Разбанен ${target}.`);
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

  // Banned users: decline immediately, never open the Mini App.
  if (await isBanned(BigInt(applicant.id))) {
    if (queryId) {
      await tryCallApi("answerChatJoinRequestQuery", {
        chat_join_request_query_id: queryId,
        result: "decline",
      });
    } else {
      await tryCallApi("declineChatJoinRequest", { chat_id: Number(chatId), user_id: applicant.id });
    }
    return;
  }

  const group = await prisma.group.findUnique({ where: { chatId } });

  logger.info("chat_join_request received", {
    chatId: chatId.toString(),
    hasQueryId: Boolean(queryId),
    groupFound: Boolean(group),
    guardEnabled: group?.guardEnabled ?? false,
    removed: Boolean(group?.removedAt),
  });

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
    } else {
      logger.info("shown Mini App via query mode", { sessionId: session.id });
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

// Track the bot's own membership: removal, and auto-connect on add.
bot.on("my_chat_member", async (ctx) => {
  const upd = ctx.myChatMember;
  if (upd.new_chat_member.user.id !== ctx.me.id) return;
  const chatId = BigInt(upd.chat.id);
  const status = upd.new_chat_member.status;

  if (status === "left" || status === "kicked") {
    await markGroupRemoved(chatId);
    return;
  }

  // Bot was added or promoted. Auto-connect the group to whoever did it, but
  // only if they are the real group creator (connectGroup enforces the creator
  // check and the quota). This makes the group appear in the owner panel
  // automatically, without manually entering its id.
  if (
    (status === "administrator" || status === "member") &&
    (upd.chat.type === "group" || upd.chat.type === "supergroup")
  ) {
    try {
      await connectGroup({
        chatId,
        requesterUserId: BigInt(upd.from.id),
        title: upd.chat.title,
      });
      logger.info("auto-connected group", { chatId: chatId.toString(), by: upd.from.id });
    } catch (err) {
      logger.info("auto-connect skipped", { chatId: chatId.toString(), err: String(err) });
    }
  }
});

bot.catch((err) => {
  logger.error("bot error", { err: String(err.error) });
  void sendSystemLog({ kind: "critical_error", context: "bot", detail: String(err.error) });
});
