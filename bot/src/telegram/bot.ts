import { Bot, InlineKeyboard } from "grammy";
import { config, isBotOwner } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import { sendSystemLog } from "./systemLog";
import { tryCallApi } from "./api";
import { createScreeningSession, screeningUrl, applyJoinDecision } from "../services/screening";
import { markGroupRemoved, connectGroup, nudgeGuardIfNeeded } from "../services/groups";
import { addJournalEntry } from "../services/journal";
import {
  isBanned,
  isGroupBanned,
  banUserEverywhere,
  unbanUser,
  checkSubscription,
  isOnCooldown,
  hasRequiredEmojiStatus,
  recordJoin,
} from "../services/moderation";
import { t, normalizeLang } from "../i18n";
import { registerAdminCommands } from "./adminCommands";

// Build a Mini App URL that shows a static reason screen (no session needed),
// used in query mode so applicants who never started the bot still see why they
// were not let in.
function infoUrl(reason: string): string {
  return `${config.miniAppUrl}/?mode=info&reason=${encodeURIComponent(reason)}`;
}

export const bot = new Bot(config.botToken);

// Operator data tools: /dc (broadcast), /dg (export), /imp (import).
registerAdminCommands(bot);

// Onboarding: minimal text, a single web_app button into the owner panel.
bot.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const userId = BigInt(from.id);

  // Banned users are ignored entirely.
  if (await isBanned(userId)) return;

  const lang = normalizeLang(from.language_code);

  // Maintenance: everyone except the operator gets a notice.
  if (config.maintenance && !isBotOwner(from.id)) {
    await ctx.reply(t(lang, "maintenance"));
    return;
  }

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
      const kb = new InlineKeyboard().webApp(t(lang, "pass_verification"), screeningUrl(sessionId));
      await ctx.reply(t(lang, "verify_to_join"), { reply_markup: kb });
      return;
    }
    await ctx.reply(t(lang, "check_not_found"));
    return;
  }

  // Deep link: /start voice_<sessionId> opens the bot DM so the applicant can
  // record a voice message even if they never started the bot before.
  if (payload.startsWith("voice_")) {
    const sessionId = payload.slice("voice_".length);
    const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } });
    if (
      session &&
      session.applicantUserId === userId &&
      session.mode === "voice" &&
      session.status === "pending" &&
      session.expiresAt.getTime() > Date.now()
    ) {
      const group = await prisma.group.findUnique({ where: { chatId: session.chatId } });
      const prompt = group?.voicePrompt?.trim() || t(lang, "voice_default_prompt");
      await ctx.reply(`${prompt}\n\n${t(lang, "voice_send_here")}`);
      return;
    }
    await ctx.reply(t(lang, "check_not_found"));
    return;
  }

  // Panel entry requires a subscription to the operator's channel.
  const sub = await checkSubscription(userId);
  if (sub.required && !sub.subscribed) {
    const kb = new InlineKeyboard()
      .url(`Подписаться${sub.username ? " @" + sub.username : ""}`, sub.url ?? "https://t.me")
      .row()
      .text("Проверить", "checksub");
    await ctx.reply("Подпишись на канал, затем нажми Проверить.", { reply_markup: kb });
    return;
  }

  const keyboard = new InlineKeyboard().webApp(
    "Открыть панель",
    `${config.miniAppUrl}/?mode=owner`
  );
  await ctx.reply("Панель управления группами.", { reply_markup: keyboard });
});

// Re-check subscription from the "Проверить" button.
bot.callbackQuery("checksub", async (ctx) => {
  if (!ctx.from) return;
  const sub = await checkSubscription(BigInt(ctx.from.id));
  if (sub.required && !sub.subscribed) {
    await ctx.answerCallbackQuery({ text: "Ещё не подписан" });
    return;
  }
  await ctx.answerCallbackQuery({ text: "Готово" });
  const keyboard = new InlineKeyboard().webApp("Открыть панель", `${config.miniAppUrl}/?mode=owner`);
  await ctx.editMessageText("Панель управления группами.", { reply_markup: keyboard });
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
  const { groupsLeft } = await banUserEverywhere(
    BigInt(target),
    BigInt(ctx.from.id),
    parts.slice(1).join(" ") || undefined
  );
  await ctx.reply(
    groupsLeft > 0 ? `Забанен ${target}. Бот вышел из групп: ${groupsLeft}.` : `Забанен ${target}.`
  );
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

  // Not configured, guard disabled, or the group owner is globally banned: hand
  // the request back to humans and never screen.
  if (!group || group.removedAt || !group.guardEnabled || (await isBanned(group.ownerUserId))) {
    if (queryId) {
      await tryCallApi("answerChatJoinRequestQuery", {
        chat_join_request_query_id: queryId,
        result: "queue",
      });
    }
    return;
  }

  // Per-group ban (set by the owner): auto-decline without opening the Mini App.
  if (await isGroupBanned(chatId, BigInt(applicant.id))) {
    if (queryId) {
      await tryCallApi("answerChatJoinRequestQuery", {
        chat_join_request_query_id: queryId,
        result: "decline",
      });
    } else {
      await tryCallApi("declineChatJoinRequest", { chat_id: Number(chatId), user_id: applicant.id });
    }
    await addJournalEntry({
      chatId,
      applicantUserId: BigInt(applicant.id),
      applicantUsername: applicant.username ?? null,
      applicantName: applicant.first_name ?? null,
      decision: "decline",
      reason: "Бан в группе.",
      answers: [],
      startedAt: new Date(),
    });
    return;
  }

  // Legacy join request (no query id) while guard is on: the guard bot may have
  // been unassigned. Nudge the owner once (deduped) so they can re-assign it.
  if (!queryId) {
    void nudgeGuardIfNeeded(chatId);
  }

  // Anti-raid: during a surge of join requests, queue everything for manual
  // review instead of opening a screening session per applicant.
  const raid = recordJoin(chatId);
  if (raid.raid) {
    if (queryId) {
      await tryCallApi("answerChatJoinRequestQuery", {
        chat_join_request_query_id: queryId,
        result: "queue",
      });
    }
    if (raid.justStarted) {
      await tryCallApi("sendMessage", {
        chat_id: Number(group.ownerUserId),
        text: "Замечен наплыв заявок. Включён режим карантина: заявки уходят в очередь на ручную проверку. Это временно.",
      });
    }
    return;
  }

  // Anti-spam cooldown: a recently declined applicant is auto-declined.
  if (await isOnCooldown(chatId, BigInt(applicant.id), group.cooldownSeconds)) {
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

  // Emoji-status gate (paid feature): the applicant must carry a specific
  // Telegram emoji status. In query mode we show a reason screen in the Mini App
  // (works even if the applicant never started the bot); in legacy mode we DM.
  if (group.emojiGate && group.emojiStatusId) {
    const lang = normalizeLang(applicant.language_code);
    const ok = await hasRequiredEmojiStatus(BigInt(applicant.id), group.emojiStatusId);
    if (!ok) {
      if (queryId) {
        await tryCallApi("sendChatJoinRequestWebApp", {
          chat_join_request_query_id: queryId,
          web_app_url: infoUrl("emoji"),
        });
        return;
      }
      await tryCallApi("declineChatJoinRequest", { chat_id: Number(chatId), user_id: applicant.id });
      await tryCallApi("sendMessage", {
        chat_id: applicant.id,
        text: t(lang, "emoji_required"),
      });
      await addJournalEntry({
        chatId,
        applicantUserId: BigInt(applicant.id),
        applicantUsername: applicant.username ?? null,
        applicantName: applicant.first_name ?? null,
        decision: "decline",
        reason: "Нет нужного эмодзи-статуса.",
        answers: [],
        startedAt: new Date(),
      });
      return;
    }
  }

  // Voice screening: manual review. The join request stays pending while the
  // applicant records a voice message; the owner decides later. In query mode
  // we show a Mini App with an "open bot" button (works even without a prior
  // DM); in legacy mode we DM the prompt directly.
  if (group.voiceScreening) {
    const lang = normalizeLang(applicant.language_code);
    const voiceSession = await createScreeningSession({
      chatId,
      applicantUserId: BigInt(applicant.id),
      applicantUsername: applicant.username ?? null,
      applicantName: applicant.first_name ?? null,
      queryId: queryId ?? null,
      mode: "voice",
      timeoutSeconds: group.timeoutSeconds,
    });
    const prompt = group.voicePrompt?.trim() || t(lang, "voice_default_prompt");
    if (queryId) {
      const ok = await tryCallApi("sendChatJoinRequestWebApp", {
        chat_join_request_query_id: queryId,
        web_app_url: screeningUrl(voiceSession.id),
      });
      if (ok === null) {
        await tryCallApi("sendMessage", {
          chat_id: applicant.id,
          text: `${prompt}\n\n${t(lang, "voice_send_here")}`,
        });
      }
    } else {
      const dm = await tryCallApi("sendMessage", {
        chat_id: applicant.id,
        text: `${prompt}\n\n${t(lang, "voice_send_here")}`,
      });
      if (dm === null) {
        logger.warn("voice screening: could not DM applicant", {
          sessionId: voiceSession.id,
          applicant: applicant.id,
        });
      }
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

  const lang = normalizeLang(applicant.language_code);
  const keyboard = new InlineKeyboard().webApp(t(lang, "pass_verification"), url);

  if (queryId) {
    // Preferred path: show the Mini App in the join request context.
    const ok = await tryCallApi("sendChatJoinRequestWebApp", {
      chat_join_request_query_id: queryId,
      web_app_url: url,
    });
    if (ok === null) {
      // Telegram sometimes rejects the inline webapp (guard unassigned, domain
      // mismatch, expired query_id). Fall back to DM so the session does not
      // silently time out with the user seeing nothing.
      logger.error("sendChatJoinRequestWebApp failed; falling back to DM", {
        sessionId: session.id,
        applicant: applicant.id,
      });
      const dm = await tryCallApi("sendMessage", {
        chat_id: applicant.id,
        text: t(lang, "verify_to_join"),
        reply_markup: keyboard,
      });
      if (dm === null) {
        logger.warn("could not DM applicant after webapp failed", {
          sessionId: session.id,
          applicant: applicant.id,
        });
      }
    } else {
      logger.info("shown Mini App via query mode", { sessionId: session.id });
    }
    return;
  }

  // Legacy path: DM the applicant a button to open the Mini App. Requires an
  // open DM with the bot; otherwise the session times out to the group action.
  const dm = await tryCallApi("sendMessage", {
    chat_id: applicant.id,
    text: t(lang, "verify_to_join"),
    reply_markup: keyboard,
  });
  if (dm === null) {
    logger.warn("could not DM applicant for legacy screening", {
      sessionId: session.id,
      applicant: applicant.id,
    });
  }
});

// Voice screening: the applicant sends a voice message to the bot DM. Attach it
// to their pending voice session and forward it to the owner for a decision.
bot.on("message:voice", async (ctx) => {
  if (ctx.chat?.type !== "private" || !ctx.from) return;
  const userId = BigInt(ctx.from.id);
  if (await isBanned(userId)) return;

  const session = await prisma.screeningSession.findFirst({
    where: { applicantUserId: userId, mode: "voice", status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (!session) return; // nothing awaiting a voice from this user
  const lang = normalizeLang(ctx.from.language_code);
  if (session.expiresAt.getTime() < Date.now()) {
    await ctx.reply(t(lang, "voice_time_up"));
    return;
  }

  const group = await prisma.group.findUnique({ where: { chatId: session.chatId } });
  if (!group) return;

  const fileId = ctx.msg.voice.file_id;
  await prisma.screeningSession.update({
    where: { id: session.id },
    data: { voiceFileId: fileId, status: "awaiting_review" },
  });

  const who = session.applicantUsername
    ? `@${session.applicantUsername}`
    : session.applicantName ?? String(userId);
  const caption = [`Голосовое на проверку`, `${who} (id: ${userId})`, group.title ? `Группа: ${group.title}` : ""]
    .filter(Boolean)
    .join("\n");
  const reply_markup = {
    inline_keyboard: [
      [
        { text: "Принять", callback_data: `voice:approve:${session.id}` },
        { text: "Отклонить", callback_data: `voice:decline:${session.id}` },
      ],
    ],
  };

  const sent = await tryCallApi("sendVoice", {
    chat_id: Number(group.ownerUserId),
    voice: fileId,
    caption,
    reply_markup,
  });
  if (sent === null) {
    logger.error("voice screening: could not deliver to owner", { sessionId: session.id });
    await ctx.reply(t(lang, "voice_deliver_failed"));
    return;
  }
  await ctx.reply(t(lang, "voice_sent_wait"));
});

// Owner decides on a voice-screening applicant from the inline buttons.
bot.callbackQuery(/^voice:(approve|decline):(.+)$/, async (ctx) => {
  if (!ctx.from) return;
  const action = ctx.match[1];
  const sessionId = ctx.match[2];

  const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    await ctx.answerCallbackQuery({ text: "Сессия не найдена" });
    return;
  }
  const group = await prisma.group.findUnique({ where: { chatId: session.chatId } });
  if (!group || (group.ownerUserId !== BigInt(ctx.from.id) && !isBotOwner(ctx.from.id))) {
    await ctx.answerCallbackQuery({ text: "Нет доступа" });
    return;
  }
  if (session.status === "completed") {
    await ctx.answerCallbackQuery({ text: "Уже обработано" });
    return;
  }

  const decision = action === "approve" ? "approve" : "decline";
  await prisma.screeningSession.update({ where: { id: sessionId }, data: { status: "completed" } });
  try {
    await applyJoinDecision(session, decision);
  } catch (err) {
    logger.error("voice decision apply failed", { sessionId, err: String(err) });
  }
  await addJournalEntry({
    chatId: session.chatId,
    applicantUserId: session.applicantUserId,
    applicantUsername: session.applicantUsername,
    applicantName: session.applicantName,
    decision,
    reason: "Голосовая проверка.",
    answers: [],
    startedAt: session.createdAt,
  });

  const mark = decision === "approve" ? "Принято" : "Отклонено";
  await ctx.answerCallbackQuery({ text: mark });
  const orig = (ctx.callbackQuery.message as { caption?: string } | undefined)?.caption ?? "";
  await ctx.editMessageCaption({ caption: `${orig}\n\nРешение: ${mark}`.trim() }).catch(() => undefined);
  await tryCallApi("sendMessage", {
    chat_id: Number(session.applicantUserId),
    text: decision === "approve" ? "Заявка одобрена." : "Заявка отклонена.",
  });
});

// Operator decides on a ban appeal from the inline buttons in DM.
bot.callbackQuery(/^appeal:(approve|reject):(.+)$/, async (ctx) => {
  if (!ctx.from || !isBotOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Нет доступа" });
    return;
  }
  const action = ctx.match[1];
  const appealId = ctx.match[2];

  const { resolveAppeal } = await import("../services/appeals");
  try {
    const result = await resolveAppeal(appealId, action === "approve" ? "approve" : "reject", BigInt(ctx.from.id));
    const mark = action === "approve" ? "Одобрено" : "Отклонено";
    await ctx.answerCallbackQuery({ text: result.already ? "Уже обработано" : mark });
    const msg = ctx.callbackQuery.message as { text?: string; caption?: string } | undefined;
    const orig = msg?.caption ?? msg?.text ?? "";
    const suffix = `\n\nРешение: ${mark}`;
    if (msg?.caption != null) {
      await ctx.editMessageCaption({ caption: `${orig}${suffix}`.trim() }).catch(() => undefined);
    } else if (msg?.text != null) {
      await tryCallApi("editMessageText", {
        chat_id: ctx.chat?.id,
        message_id: msg && "message_id" in msg ? (msg as { message_id: number }).message_id : undefined,
        text: `${orig}${suffix}`.trim(),
      });
    }
  } catch (err) {
    logger.error("appeal callback failed", { appealId, err: String(err) });
    await ctx.answerCallbackQuery({ text: "Ошибка" });
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
    // Unbypassable ban: if the person who added the bot, or the group's bound
    // owner, is globally banned, leave immediately and never connect/screen.
    const existing = await prisma.group.findUnique({ where: { chatId } });
    const adderBanned = await isBanned(BigInt(upd.from.id));
    const ownerBanned = existing ? await isBanned(existing.ownerUserId) : false;
    if (adderBanned || ownerBanned) {
      await tryCallApi("leaveChat", { chat_id: Number(chatId) });
      await markGroupRemoved(chatId);
      logger.info("left chat: banned adder/owner", {
        chatId: chatId.toString(),
        by: upd.from.id,
        adderBanned,
        ownerBanned,
      });
      return;
    }

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
