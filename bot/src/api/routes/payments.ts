import { Router } from "express";
import { logger } from "../../logger";
import { requireInitData } from "../auth";
import {
  createBundleInvoice,
  verifyWebhookSignature,
  handlePaidInvoice,
} from "../../services/payments";

// Authenticated routes: create an invoice for the current user.
export const paymentsRouter = Router();
paymentsRouter.use(requireInitData);

paymentsRouter.post("/invoice", async (req, res) => {
  try {
    const result = await createBundleInvoice(req.tgUser!.id);
    res.json(result);
  } catch (err) {
    logger.error("create invoice failed", { err: String(err) });
    res.status(500).json({ error: "payment_unavailable" });
  }
});

// Public webhook from Crypto Pay (no initData). Signature-verified.
// Mounted separately so it can read the raw body.
export const cryptoWebhookRouter = Router();

cryptoWebhookRouter.post("/", async (req, res) => {
  const signature = req.header("crypto-pay-api-signature");
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: "bad_signature" });
    return;
  }
  const update = req.body as { update_type?: string; payload?: { invoice_id: number; status: string; asset?: string; amount: string } };
  try {
    if (update.update_type === "invoice_paid" && update.payload) {
      await handlePaidInvoice(update.payload);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error("crypto webhook handling failed", { err: String(err) });
    res.status(500).json({ error: "internal" });
  }
});
