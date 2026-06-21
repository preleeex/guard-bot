import { PrismaClient } from "@prisma/client";

// Cap the connection pool so parallel webhook processing cannot exhaust the
// managed database's connection limit (which would hang queries under load).
function urlWithPoolLimit(url: string): string {
  if (!url || url.includes("connection_limit")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=5&pool_timeout=20`;
}

// Single shared Prisma client for the process.
export const prisma = new PrismaClient({
  datasources: { db: { url: urlWithPoolLimit(process.env.DATABASE_URL ?? "") } },
});

// BigInt values are not JSON-serializable by default. Patch the prototype once
// so Express `res.json(...)` can return rows that contain Telegram ids.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};
