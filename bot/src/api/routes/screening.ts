import { Router } from "express";
import { logger } from "../../logger";
import { requireInitData, requireNotBanned } from "../auth";
import { getPublicScenario, submitScreening, ScreeningError } from "../../services/screening";
import type { BlockAnswer } from "../../types/scenario";

export const screeningRouter = Router();
screeningRouter.use(requireInitData, requireNotBanned);

// Applicant fetches the scenario for their pending session (secrets stripped).
screeningRouter.get("/:sessionId", async (req, res) => {
  try {
    const data = await getPublicScenario(req.params.sessionId, req.tgUser!.id);
    res.json(data);
  } catch (err) {
    handleScreeningError(err, res);
  }
});

// Applicant submits answers; backend evaluates, decides, and answers Telegram.
screeningRouter.post("/:sessionId/submit", async (req, res) => {
  try {
    const answers = Array.isArray(req.body?.answers) ? (req.body.answers as BlockAnswer[]) : [];
    const result = await submitScreening(req.params.sessionId, req.tgUser!.id, answers);
    res.json(result);
  } catch (err) {
    handleScreeningError(err, res);
  }
});

function handleScreeningError(err: unknown, res: import("express").Response) {
  if (err instanceof ScreeningError) {
    const status =
      err.code === "forbidden" ? 403 : err.code === "not_found" ? 404 : err.code === "expired" || err.code === "closed" ? 410 : 400;
    res.status(status).json({ error: err.code, message: err.message });
    return;
  }
  logger.error("screening route error", { err: String(err) });
  res.status(500).json({ error: "internal" });
}
