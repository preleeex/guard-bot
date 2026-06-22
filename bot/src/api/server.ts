import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

  // Behind the DigitalOcean proxy: trust it so rate limiting sees real client IPs.
  app.set("trust proxy", 1);

  // Security headers. CSP/CORP are disabled because this is a JSON API + webhook
  // backend (no HTML), and cross-origin access is governed by our own CORS.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  // Cap request body size to blunt large-payload abuse.
  app.use(
    express.json({
      limit: "256kb",
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })
  );
  app.use(cors);

  // Rate limiting. Generous for the Mini App API; the Telegram webhook is not
  // limited (it is authenticated by the secret token and acked instantly).
  const apiLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
  app.use("/api", apiLimiter);
  app.use("/crypto/webhook", rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

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
