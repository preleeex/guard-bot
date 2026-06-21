import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  botUsername: optional("BOT_USERNAME"),
  ownerUserId: BigInt(required("OWNER_USER_ID")),
  systemLogChatId: required("SYSTEM_LOG_CHAT_ID"),
  webhookSecretToken: required("WEBHOOK_SECRET_TOKEN"),
  publicBaseUrl: required("PUBLIC_BASE_URL").replace(/\/$/, ""),
  miniAppUrl: required("MINI_APP_URL").replace(/\/$/, ""),
  databaseUrl: required("DATABASE_URL"),
  cryptoPay: {
    token: optional("CRYPTO_PAY_API_TOKEN"),
    base: optional("CRYPTO_PAY_API_BASE", "https://pay.crypt.bot/api").replace(/\/$/, ""),
  },
  port: parseInt(optional("PORT", "8080"), 10),
};

// Quota and pricing, fixed by the spec.
export const FREE_GROUP_SLOTS = 3;
export const BUNDLE_SLOTS = 3;
export const BUNDLE_PRICE_USD = "3.99";

export function isBotOwner(userId: bigint | number): boolean {
  return BigInt(userId) === config.ownerUserId;
}
