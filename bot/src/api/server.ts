import express, { type Request, type Response, type NextFunction } from "express";
import { webhookCallback } from "grammy";
import { config } from "../config";
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

  // Telegram webhook. grammY verifies the secret token header.
  app.use(
    "/telegram/webhook",
    webhookCallback(bot, "express", { secretToken: config.webhookSecretToken })
  );

  // Mini App API.
  app.use("/api/owner", ownerRouter);
  app.use("/api/screening", screeningRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/payments", paymentsRouter);

  // Crypto Pay webhook.
  app.use("/crypto/webhook", cryptoWebhookRouter);

  return app;
}
