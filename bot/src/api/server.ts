import express, { type Request, type Response, type NextFunction } from "express";
import type { Update } from "grammy/types";
import { config } from "../config";
import { logger } from "../logger";
import { bot } from "../telegram/bot";
import { ownerRouter } from "./routes/owner";
import { screeningRouter } from "./routes/screening";
import { adminRouter } from "./routes/admin";
import { paymentsRouter, cryptoWebhookRouter } from "./routes/payments";

// Allow the Mini App origin to call the API and send the initData header.
function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header("Origin");
  if (origin && origin === config.miniAppUrl) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Init-Data");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

export function buildApp() {
  const app = express();

  // Capture the raw body for webhook signature verification.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })
  );
  app.use(cors);

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // Telegram webhook. Verify the secret token, acknowledge immediately, then
  // process the update in the background. Acknowledging fast prevents gateway
  // timeouts and Telegram retry storms (which were exhausting the DB pool).
  app.post("/telegram/webhook", (req: Request, res: Response) => {
    if (req.header("X-Telegram-Bot-Api-Secret-Token") !== config.webhookSecretToken) {
      res.sendStatus(401);
      return;
    }
    res.sendStatus(200);
    void bot
      .handleUpdate(req.body as Update)
      .catch((err) => logger.error("handleUpdate failed", { err: String(err) }));
  });

  // Mini App API.
  app.use("/api/owner", ownerRouter);
  app.use("/api/screening", screeningRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/payments", paymentsRouter);

  // Crypto Pay webhook.
  app.use("/crypto/webhook", cryptoWebhookRouter);

  return app;
}
