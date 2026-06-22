import { Router } from "express";
import { config, FREE_GROUP_SLOTS } from "../../config";
import { logger } from "../../logger";
import { requireInitData } from "../auth";
import { getChat, getEmojiStatus, TelegramApiError } from "../../telegram/api";
import {
  connectGroup,
  listGroups,
  assertOwnerOf,
  setGuardEnabled,
  updateSettings,
  setEmojiStatus,
  GroupError,
} from "../../services/groups";
import { getScenario, saveScenario } from "../../services/scenarios";
import { listJournal } from "../../services/journal";
import { getQuota } from "../../services/quota";
import { checkSubscription } from "../../services/moderation";

// "Premium" owners (bought slots or unlimited, i.e. able to run >3 groups) get
// access to the emoji-status gate.
async function isPremiumOwner(userId: bigint): Promise<boolean> {
  const quota = await getQuota(userId);
  return quota.unlimited || quota.totalSlots > FREE_GROUP_SLOTS;
}

export const ownerRouter = Router();
ownerRouter.use(requireInitData);

function parseChatId(raw: string): bigint {
  return BigInt(raw);
}

// Identify the current user and whether they are the bot operator.
ownerRouter.get("/me", (req, res) => {
  res.json({
    userId: req.tgUser!.id.toString(),
    isOperator: req.isOwnerOperator === true,
  });
});

// Single call that powers the owner home screen: operator flag, quota, groups.
// Combining these into one request keeps the initial load fast.
ownerRouter.get("/home", async (req, res) => {
  const userId = req.tgUser!.id;
  const [quota, groups, subscription] = await Promise.all([
    getQuota(userId),
    listGroups(userId),
    checkSubscription(userId),
  ]);
  res.json({
    isOperator: req.isOwnerOperator === true,
    maintenance: config.maintenance,
    subscription,
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
