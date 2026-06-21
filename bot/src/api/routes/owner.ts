import { Router } from "express";
import { logger } from "../../logger";
import { requireInitData } from "../auth";
import { getChat, TelegramApiError } from "../../telegram/api";
import {
  connectGroup,
  listGroups,
  assertOwnerOf,
  setGuardEnabled,
  updateSettings,
  GroupError,
} from "../../services/groups";
import { getScenario, saveScenario } from "../../services/scenarios";
import { listJournal } from "../../services/journal";
import { getQuota } from "../../services/quota";

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
  const [quota, groups] = await Promise.all([getQuota(userId), listGroups(userId)]);
  res.json({
    isOperator: req.isOwnerOperator === true,
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
    res.json({ group, scenario });
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
    const group = await updateSettings(chatId, req.tgUser!.id, {
      resultPolicy: body.resultPolicy,
      timeoutSeconds: body.timeoutSeconds,
      timeoutAction: body.timeoutAction,
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
