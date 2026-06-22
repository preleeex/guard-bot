import { Router } from "express";
import { logger } from "../../logger";
import { requireInitData, requireOperator } from "../auth";
import { getGlobalStats } from "../../services/stats";
import { grantManualSlots } from "../../services/payments";
import { banUserEverywhere, unbanUser, listBanned } from "../../services/moderation";
import {
  listPendingAppeals,
  getAppealById,
  resolveAppeal,
  AppealError,
} from "../../services/appeals";

export const adminRouter = Router();
adminRouter.use(requireInitData, requireOperator);

// Global statistics for the operator.
adminRouter.get("/stats", async (_req, res) => {
  const stats = await getGlobalStats();
  res.json(stats);
});

// List banned users.
adminRouter.get("/banned", async (_req, res) => {
  const banned = await listBanned();
  res.json({
    banned: banned.map((b) => ({
      userId: b.userId.toString(),
      reason: b.reason,
      createdAt: b.createdAt,
    })),
  });
});

// Ban a user everywhere: record the ban and pull the bot out of every group
// they own.
adminRouter.post("/ban", async (req, res) => {
  const targetUserId = req.body?.userId;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() || undefined : undefined;
  if (!targetUserId || !/^\d+$/.test(String(targetUserId))) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  try {
    const { groupsLeft } = await banUserEverywhere(BigInt(targetUserId), req.tgUser!.id, reason);
    res.json({ ok: true, groupsLeft });
  } catch (err) {
    logger.error("admin ban failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});

// Unban a user.
adminRouter.post("/unban", async (req, res) => {
  const targetUserId = req.body?.userId;
  if (!targetUserId || !/^\d+$/.test(String(targetUserId))) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  try {
    await unbanUser(BigInt(targetUserId));
    res.json({ ok: true });
  } catch (err) {
    logger.error("admin unban failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});

// Manually grant extra group slots to any user, no payment.
adminRouter.post("/grant-slots", async (req, res) => {
  const targetUserId = req.body?.userId;
  const slots = Number(req.body?.slots);
  if (!targetUserId || !Number.isInteger(slots) || slots <= 0) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  try {
    await grantManualSlots(BigInt(targetUserId), slots, req.tgUser!.id);
    res.json({ ok: true });
  } catch (err) {
    logger.error("grant slots failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});

// Pending ban appeals for the operator panel.
adminRouter.get("/appeals", async (_req, res) => {
  const appeals = await listPendingAppeals();
  res.json({
    appeals: appeals.map((a) => ({
      id: a.id,
      userId: a.userId.toString(),
      username: a.username,
      name: a.name,
      text: a.text,
      hasPhoto: Boolean(a.photoData),
      createdAt: a.createdAt,
    })),
  });
});

// Appeal photo (JPEG) for the admin panel preview.
adminRouter.get("/appeals/:id/photo", async (req, res) => {
  const appeal = await getAppealById(req.params.id);
  if (!appeal?.photoData) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const m = /^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i.exec(appeal.photoData);
  if (!m) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const buf = Buffer.from(m[1], "base64");
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buf);
});

adminRouter.post("/appeals/:id/approve", async (req, res) => {
  try {
    const result = await resolveAppeal(req.params.id, "approve", req.tgUser!.id);
    res.json(result);
  } catch (err) {
    if (err instanceof AppealError) {
      res.status(404).json({ error: err.code, message: err.message });
      return;
    }
    logger.error("appeal approve failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});

adminRouter.post("/appeals/:id/reject", async (req, res) => {
  try {
    const result = await resolveAppeal(req.params.id, "reject", req.tgUser!.id);
    res.json(result);
  } catch (err) {
    if (err instanceof AppealError) {
      res.status(404).json({ error: err.code, message: err.message });
      return;
    }
    logger.error("appeal reject failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});
