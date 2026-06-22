import { Router } from "express";
import { logger } from "../../logger";
import { requireInitData } from "../auth";
import { AppealError, getAppealState, submitAppeal } from "../../services/appeals";

export const appealsRouter = Router();
appealsRouter.use(requireInitData);

// Ban + appeal status for the blocked-user screen (works while banned).
appealsRouter.get("/status", async (req, res) => {
  try {
    const state = await getAppealState(req.tgUser!.id);
    res.json({
      banned: state.banned,
      reason: state.reason,
      appealStatus: state.appealStatus,
      canAppeal: state.canAppeal,
    });
  } catch (err) {
    logger.error("appeal status failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});

// Submit a ban appeal (photo + text). Only for globally banned users.
appealsRouter.post("/submit", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  const photoData = typeof req.body?.photo === "string" ? req.body.photo : null;
  try {
    const result = await submitAppeal({
      userId: req.tgUser!.id,
      username: req.tgUser!.username,
      name: req.tgUser!.firstName,
      text,
      photoData,
    });
    res.json({ ok: true, id: result.id });
  } catch (err) {
    if (err instanceof AppealError) {
      const status =
        err.code === "not_banned" || err.code === "closed" || err.code === "pending" ? 403 : 400;
      res.status(status).json({ error: err.code, message: err.message });
      return;
    }
    logger.error("appeal submit failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});
