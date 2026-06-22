import { Router } from "express";
import { config, FREE_GROUP_SLOTS } from "../../config";
import { logger } from "../../logger";
import { prisma } from "../../db";
import { requireInitData, requireNotBanned, validateInitData } from "../auth";
import {
  getChat,
  getEmojiStatus,
  getUserProfilePhotoFileId,
  getFilePath,
  FILE_ROOT,
  TelegramApiError,
} from "../../telegram/api";
import {
  connectGroup,
  listGroups,
  assertOwnerOf,
  setGuardEnabled,
  updateSettings,
  setEmojiStatus,
  checkGroupSetup,
  GroupError,
} from "../../services/groups";
import { getScenario, saveScenario } from "../../services/scenarios";
import {
  getGroupStats,
  listManualQueue,
  applyQueueDecision,
  type StatsPeriod,
} from "../../services/screening";
import { listJournal } from "../../services/journal";
import { getQuota } from "../../services/quota";
import {
  checkSubscription,
  banInGroup,
  unbanFromGroup,
  listGroupBans,
} from "../../services/moderation";
import { normalizeLang } from "../../i18n";

// "Premium" owners (bought slots or unlimited, i.e. able to run >3 groups) get
// access to the emoji-status gate.
async function isPremiumOwner(userId: bigint): Promise<boolean> {
  const quota = await getQuota(userId);
  return quota.unlimited || quota.totalSlots > FREE_GROUP_SLOTS;
}

export const ownerRouter = Router();

// Avatar proxy. Public because an <img> tag cannot send the initData header, so
// the caller passes validated initData as a query param. Streams the user's own
// Telegram profile photo (never exposes the bot token in the file URL).
ownerRouter.get("/avatar", async (req, res) => {
  try {
    const v = validateInitData(String(req.query.i ?? ""));
    if (!v.ok || !v.user) {
      res.sendStatus(401);
      return;
    }
    const fileId = await getUserProfilePhotoFileId(Number(v.user.id));
    const filePath = fileId ? await getFilePath(fileId) : null;
    if (!filePath) {
      res.sendStatus(404);
      return;
    }
    const tgRes = await fetch(`${FILE_ROOT}/${filePath}`);
    if (!tgRes.ok) {
      res.sendStatus(404);
      return;
    }
    res.setHeader("Content-Type", tgRes.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(Buffer.from(await tgRes.arrayBuffer()));
  } catch (err) {
    logger.warn("avatar proxy failed", { err: String(err) });
    res.sendStatus(404);
  }
});

// Voice recording proxy for the manual queue. Public like the avatar proxy
// (an <audio> tag cannot send headers): validated initData is passed as `i`, and
// ownership of the group is enforced before streaming.
ownerRouter.get("/groups/:chatId/queue/voice/:sessionId", async (req, res) => {
  try {
    const v = validateInitData(String(req.query.i ?? ""));
    if (!v.ok || !v.user) {
      res.sendStatus(401);
      return;
    }
    const chatId = parseChatId(req.params.chatId);
    await assertOwnerOf(chatId, v.user.id);
    const session = await prisma.screeningSession.findUnique({ where: { id: req.params.sessionId } });
    if (!session || session.chatId !== chatId || !session.voiceFileId) {
      res.sendStatus(404);
      return;
    }
    const filePath = await getFilePath(session.voiceFileId);
    if (!filePath) {
      res.sendStatus(404);
      return;
    }
    const tgRes = await fetch(`${FILE_ROOT}/${filePath}`);
    if (!tgRes.ok) {
      res.sendStatus(404);
      return;
    }
    res.setHeader("Content-Type", tgRes.headers.get("content-type") ?? "audio/ogg");
    res.setHeader("Cache-Control", "private, max-age=600");
    res.send(Buffer.from(await tgRes.arrayBuffer()));
  } catch (err) {
    logger.warn("voice proxy failed", { err: String(err) });
    res.sendStatus(404);
  }
});

ownerRouter.use(requireInitData, requireNotBanned);

function parseChatId(raw: string): bigint {
  return BigInt(raw);
}

// Resolve the effective UI language for the user: stored preference first, then
// the Telegram client language passed by the Mini App, then Russian.
async function resolveLanguage(userId: bigint, clientLang?: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
  return normalizeLang(user?.language ?? clientLang);
}

// Identify the current user and whether they are the bot operator.
ownerRouter.get("/me", async (req, res) => {
  res.json({
    userId: req.tgUser!.id.toString(),
    isOperator: req.isOwnerOperator === true,
    language: await resolveLanguage(req.tgUser!.id, String(req.query.lang ?? "")),
  });
});

// Save the user's manual UI language choice ("ru" | "en").
ownerRouter.post("/language", async (req, res) => {
  const language = normalizeLang(String(req.body?.language ?? ""));
  await prisma.user.upsert({
    where: { id: req.tgUser!.id },
    update: { language },
    create: { id: req.tgUser!.id, language },
  });
  res.json({ language });
});

// Single call that powers the owner home screen: operator flag, quota, groups.
// Combining these into one request keeps the initial load fast.
ownerRouter.get("/home", async (req, res) => {
  const userId = req.tgUser!.id;
  const [quota, groups, subscription, language] = await Promise.all([
    getQuota(userId),
    listGroups(userId),
    checkSubscription(userId),
    resolveLanguage(userId, String(req.query.lang ?? "")),
  ]);
  res.json({
    isOperator: req.isOwnerOperator === true,
    maintenance: config.maintenance,
    subscription,
    language,
    quota: {
      ...quota,
      totalSlots: quota.unlimited ? null : quota.totalSlots,
      remaining: quota.unlimited ? null : quota.remaining,
    },
    groups,
  });
});

// Quota status for the current user.
ownerRouter.get("/quota", async (req, res) => {
  const quota = await getQuota(req.tgUser!.id);
  res.json({
    ...quota,
    totalSlots: quota.unlimited ? null : quota.totalSlots,
    remaining: quota.unlimited ? null : quota.remaining,
  });
});

// List the caller's groups.
ownerRouter.get("/groups", async (req, res) => {
  const groups = await listGroups(req.tgUser!.id);
  res.json({ groups });
});

// Connect a new group. `chat` is a numeric id or @username; the bot must
// already be a member and the caller must be the group creator.
ownerRouter.post("/groups", async (req, res) => {
  const chat = String(req.body?.chat ?? "").trim();
  if (!chat) {
    res.status(400).json({ error: "chat_required" });
    return;
  }
  try {
    const info = await getChat(chat);
    const result = await connectGroup({
      chatId: BigInt(info.id),
      requesterUserId: req.tgUser!.id,
      title: info.title,
    });
    res.json({ ok: true, chatId: info.id, title: info.title, ...result });
  } catch (err) {
    if (err instanceof GroupError) {
      res.status(400).json({ error: err.code, message: err.message });
      return;
    }
    if (err instanceof TelegramApiError) {
      res.status(400).json({ error: "telegram_error", message: err.description });
      return;
    }
    logger.error("connect group failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});

// Group detail: settings + scenario.
ownerRouter.get("/groups/:chatId", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const group = await assertOwnerOf(chatId, req.tgUser!.id);
    const scenario = await getScenario(chatId);
    const [info, premium] = await Promise.all([
      getChat(Number(chatId)).catch(() => null),
      isPremiumOwner(req.tgUser!.id),
    ]);
    res.json({ group, scenario, chatUsername: info?.username ?? null, premium });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Update guard toggle and result/timeout settings.
ownerRouter.patch("/groups/:chatId", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const body = req.body ?? {};
    if (typeof body.guardEnabled === "boolean") {
      await setGuardEnabled(chatId, req.tgUser!.id, body.guardEnabled);
    }
    // The emoji gate is a paid feature: only premium owners may enable it.
    if (body.emojiGate === true && !(await isPremiumOwner(req.tgUser!.id))) {
      res.status(403).json({ error: "premium_required", message: "Доступно на платном тарифе." });
      return;
    }
    const group = await updateSettings(chatId, req.tgUser!.id, {
      resultPolicy: body.resultPolicy,
      timeoutSeconds: body.timeoutSeconds,
      timeoutAction: body.timeoutAction,
      cooldownSeconds: body.cooldownSeconds,
      voiceScreening: typeof body.voiceScreening === "boolean" ? body.voiceScreening : undefined,
      voicePrompt: typeof body.voicePrompt === "string" ? body.voicePrompt : undefined,
      emojiGate: typeof body.emojiGate === "boolean" ? body.emojiGate : undefined,
      welcomeEnabled: typeof body.welcomeEnabled === "boolean" ? body.welcomeEnabled : undefined,
      welcomeText: typeof body.welcomeText === "string" ? body.welcomeText : undefined,
      welcomeDeleteSeconds:
        body.welcomeDeleteSeconds === null
          ? null
          : typeof body.welcomeDeleteSeconds === "number"
          ? body.welcomeDeleteSeconds
          : undefined,
    });
    res.json({ group });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Replace the scenario.
ownerRouter.put("/groups/:chatId/scenario", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const scenario = await saveScenario(chatId, req.tgUser!.id, blocks);
    res.json({ scenario });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Set (or clear) the required emoji status for the gate. We read the owner's
// own current emoji status and store it as the requirement, so the owner just
// sets the desired status on their account and taps the button.
ownerRouter.post("/groups/:chatId/emoji-status", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const userId = req.tgUser!.id;
    if (!(await isPremiumOwner(userId))) {
      res.status(403).json({ error: "premium_required", message: "Доступно на платном тарифе." });
      return;
    }
    if (req.body?.clear === true) {
      const group = await setEmojiStatus(chatId, userId, null);
      res.json({ group });
      return;
    }
    const emojiId = await getEmojiStatus(Number(userId));
    if (!emojiId) {
      res.status(400).json({
        error: "no_emoji_status",
        message: "У вас не установлен эмодзи-статус. Поставьте его и повторите.",
      });
      return;
    }
    const group = await setEmojiStatus(chatId, userId, emojiId);
    res.json({ group });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Setup self-check: is the bot an admin able to approve, and does the group
// require join approval? Helps owners diagnose "guard does nothing".
ownerRouter.get("/groups/:chatId/check", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const report = await checkGroupSetup(chatId, req.tgUser!.id);
    res.json(report);
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Per-group statistics for the owner. ?period=today|7d|all (default all).
ownerRouter.get("/groups/:chatId/stats", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    await assertOwnerOf(chatId, req.tgUser!.id);
    const raw = String(req.query.period ?? "all");
    const period: StatsPeriod = raw === "today" || raw === "7d" ? raw : "all";
    const stats = await getGroupStats(chatId, period);
    res.json(stats);
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Manual review queue: items awaiting a decision.
ownerRouter.get("/groups/:chatId/queue", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const items = await listManualQueue(chatId, req.tgUser!.id);
    res.json({ items });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Apply a manual decision from the queue.
ownerRouter.post("/groups/:chatId/queue/decision", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const kind = req.body?.kind === "voice" ? "voice" : "pending";
    const id = String(req.body?.id ?? "");
    const decision = req.body?.decision === "approve" ? "approve" : "decline";
    if (!id) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }
    const result = await applyQueueDecision(chatId, req.tgUser!.id, kind, id, decision);
    res.json(result);
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Per-group bans set by the owner.
ownerRouter.get("/groups/:chatId/bans", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const bans = await listGroupBans(chatId, req.tgUser!.id);
    res.json({
      bans: bans.map((b) => ({
        userId: b.userId.toString(),
        username: b.username,
        name: b.name,
        reason: b.reason,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    handleGroupError(err, res);
  }
});

ownerRouter.post("/groups/:chatId/bans", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const userIdRaw = String(req.body?.userId ?? "");
    if (!/^\d+$/.test(userIdRaw)) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }
    await banInGroup(chatId, req.tgUser!.id, {
      userId: BigInt(userIdRaw),
      username: typeof req.body?.username === "string" ? req.body.username : null,
      name: typeof req.body?.name === "string" ? req.body.name : null,
      reason: typeof req.body?.reason === "string" ? req.body.reason.trim() || null : null,
    });
    res.json({ ok: true });
  } catch (err) {
    handleGroupError(err, res);
  }
});

ownerRouter.delete("/groups/:chatId/bans/:userId", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    if (!/^\d+$/.test(req.params.userId)) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }
    await unbanFromGroup(chatId, req.tgUser!.id, BigInt(req.params.userId));
    res.json({ ok: true });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// Journal for a group.
ownerRouter.get("/groups/:chatId/journal", async (req, res) => {
  try {
    const chatId = parseChatId(req.params.chatId);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const entries = await listJournal(chatId, req.tgUser!.id, { cursor });
    res.json({ entries });
  } catch (err) {
    handleGroupError(err, res);
  }
});

function handleGroupError(err: unknown, res: import("express").Response) {
  if (err instanceof GroupError) {
    const status = err.code === "forbidden" ? 403 : err.code === "not_found" ? 404 : 400;
    res.status(status).json({ error: err.code, message: err.message });
    return;
  }
  logger.error("owner route error", { err: String(err) });
  res.status(500).json({ error: "internal" });
}
