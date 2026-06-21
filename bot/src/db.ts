import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the process.
export const prisma = new PrismaClient();

// BigInt values are not JSON-serializable by default. Patch the prototype once
// so Express `res.json(...)` can return rows that contain Telegram ids.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};
