import crypto from "crypto";
import { prisma } from "../db";
import { config, PLANS, type PlanKey } from "../config";
import { logger } from "../logger";
import { sendSystemLog } from "../telegram/systemLog";

// NOTE: Crypto Pay API details (endpoints, field names, signature scheme) must
// be verified against the current @CryptoBot documentation before going live.
// This implementation follows the documented createInvoice + webhook flow.

interface CryptoPayInvoice {
  invoice_id: number;
  status: string; // "active" | "paid" | "expired"
  amount: string;
  asset?: string;
  fiat?: string;
  bot_invoice_url?: string;
  mini_app_invoice_url?: string;
  web_app_invoice_url?: string;
  payload?: string;
}

async function cryptoPayCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  if (!config.cryptoPay.token) {
    throw new Error("CRYPTO_PAY_API_TOKEN is not configured");
  }
  const res = await fetch(`${config.cryptoPay.base}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Crypto-Pay-API-Token": config.cryptoPay.token,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; error?: unknown };
  if (!data.ok) {
    throw new Error(`Crypto Pay ${method} failed: ${JSON.stringify(data.error)}`);
  }
  return data.result as T;
}

// Create an invoice for a paid plan and persist a pending payment row.
export async function createInvoiceForPlan(
  userId: bigint,
  planKey: PlanKey
): Promise<{ payUrl: string; invoiceId: string }> {
  const plan = PLANS[planKey];
  const payload = JSON.stringify({ userId: userId.toString(), plan: planKey });

  const invoice = await cryptoPayCall<CryptoPayInvoice>("createInvoice", {
    currency_type: "fiat",
    fiat: "USD",
    amount: plan.price,
    description: `Guard Bot: ${plan.title}`,
    payload,
    paid_btn_name: "callback",
    paid_btn_url: config.miniAppUrl,
    expires_in: 3600,
  });

  await prisma.payment.create({
    data: {
      userId,
      invoiceId: String(invoice.invoice_id),
      status: "active",
      amount: plan.price,
      currency: "USD",
      slotsAdded: plan.slots,
    },
  });

  const payUrl =
    invoice.mini_app_invoice_url ?? invoice.bot_invoice_url ?? invoice.web_app_invoice_url ?? "";
  return { payUrl, invoiceId: String(invoice.invoice_id) };
}

// Verify the webhook signature: HMAC-SHA256(body, key=SHA256(token)).
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !config.cryptoPay.token) return false;
  const secret = crypto.createHash("sha256").update(config.cryptoPay.token).digest();
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Handle a verified webhook update. Idempotent on invoice_id.
export async function handlePaidInvoice(invoice: CryptoPayInvoice): Promise<void> {
  const invoiceId = String(invoice.invoice_id);
  const payment = await prisma.payment.findUnique({ where: { invoiceId } });
  if (!payment) {
    logger.warn("paid invoice without a known payment row", { invoiceId });
    return;
  }
  if (payment.status === "paid") return; // already processed

  await prisma.payment.update({
    where: { invoiceId },
    data: { status: "paid", paidAt: new Date(), asset: invoice.asset ?? null },
  });

  await sendSystemLog({
    kind: "payment",
    userId: payment.userId,
    amount: payment.amount,
    currency: payment.currency,
    slots: payment.slotsAdded,
  });
}

// Poll Crypto Pay for the user's active invoices and credit any that are now
// paid. This lets the purchase flow work even without a configured dashboard
// webhook: the Mini App calls this after returning from the payment.
export async function verifyUserInvoices(userId: bigint): Promise<number> {
  const pending = await prisma.payment.findMany({
    where: { userId, status: "active" },
    select: { invoiceId: true },
  });
  const ids = pending.map((p) => p.invoiceId).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return 0;

  const res = await cryptoPayCall<{ items: CryptoPayInvoice[] }>("getInvoices", {
    invoice_ids: ids.join(","),
  });
  let credited = 0;
  for (const inv of res.items ?? []) {
    if (inv.status === "paid") {
      await handlePaidInvoice(inv);
      credited += 1;
    }
  }
  return credited;
}

// Operator action: grant extra group slots to a user without payment.
export async function grantManualSlots(
  targetUserId: bigint,
  slots: number,
  byUserId: bigint
): Promise<void> {
  await prisma.user.upsert({
    where: { id: targetUserId },
    update: { manualExtraSlots: { increment: slots } },
    create: { id: targetUserId, manualExtraSlots: slots },
  });
  await sendSystemLog({ kind: "manual_slots", targetUserId, slots, byUserId });
}
