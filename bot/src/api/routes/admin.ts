import { Router } from "express";
import { logger } from "../../logger";
import { requireInitData, requireOperator } from "../auth";
import { getGlobalStats } from "../../services/stats";
import { grantManualSlots } from "../../services/payments";

export const adminRouter = Router();
adminRouter.use(requireInitData, requireOperator);

// Global statistics for the operator.
adminRouter.get("/stats", async (_req, res) => {
  const stats = await getGlobalStats();
  res.json(stats);
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
