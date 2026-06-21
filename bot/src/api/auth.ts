import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { config, isBotOwner } from "../config";

export interface TgUser {
  id: bigint;
  username?: string;
  firstName?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tgUser?: TgUser;
      tgStartParam?: string;
      isOwnerOperator?: boolean;
    }
  }
}

// Validate Telegram WebApp initData per the documented algorithm:
// secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
// expected   = HMAC_SHA256(key=secret_key, msg=data_check_string)
export function validateInitData(initData: string): {
  ok: boolean;
  user?: TgUser;
  startParam?: string;
} {
  if (!initData) return { ok: false };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false };

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const expected = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false };

  // Optional freshness check (24h) to limit replay.
  const authDate = Number(params.get("auth_date") ?? 0);
  if (authDate && Date.now() / 1000 - authDate > 24 * 60 * 60) {
    return { ok: false };
  }

  let user: TgUser | undefined;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      const parsed = JSON.parse(userRaw) as { id: number; username?: string; first_name?: string };
      user = { id: BigInt(parsed.id), username: parsed.username, firstName: parsed.first_name };
    } catch {
      return { ok: false };
    }
  }

  return { ok: true, user, startParam: params.get("start_param") ?? undefined };
}

// Express middleware. Reads initData from the X-Telegram-Init-Data header.
export function requireInitData(req: Request, res: Response, next: NextFunction): void {
  const initData = (req.header("X-Telegram-Init-Data") ?? "").toString();
  const result = validateInitData(initData);
  if (!result.ok || !result.user) {
    res.status(401).json({ error: "invalid_init_data" });
    return;
  }
  req.tgUser = result.user;
  req.tgStartParam = result.startParam;
  req.isOwnerOperator = isBotOwner(result.user.id);
  next();
}

// Gate for operator-only (admin view) routes.
export function requireOperator(req: Request, res: Response, next: NextFunction): void {
  if (!req.isOwnerOperator) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}
