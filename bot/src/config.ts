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
  // Mandatory channel subscription gate, e.g. "@zamerz_typing". Empty disables.
  requiredChannel: optional("REQUIRED_CHANNEL"),
  // Maintenance mode: when "1"/"true", the Mini App and bot show a notice.
  maintenance: ["1", "true", "yes"].includes(optional("MAINTENANCE_MODE").toLowerCase()),
  port: parseInt(optional("PORT", "8080"), 10),
};

export function requiredChannelUrl(): string | undefined {
  if (!config.requiredChannel) return undefined;
  return `https://t.me/${config.requiredChannel.replace(/^@/, "")}`;
}

// Quota and pricing.
export const FREE_GROUP_SLOTS = 3;

// Paid plans (one-time). "unlimited" grants a very large slot count.
export const PLANS = {
  small: { slots: 5, price: "2.99", title: "+5 групп" },
  big: { slots: 15, price: "6.99", title: "+15 групп" },
  unlimited: { slots: 9999, price: "14.99", title: "Безлимит" },
} as const;

export type PlanKey = keyof typeof PLANS;

export function isBotOwner(userId: bigint | number): boolean {
  return BigInt(userId) === config.ownerUserId;
}
