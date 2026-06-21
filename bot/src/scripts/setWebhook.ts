import { config } from "../config";
import { setWebhook } from "../telegram/api";

// One-off: register the Telegram webhook for this backend.
// Usage: npm run set-webhook
async function main() {
  const url = `${config.publicBaseUrl}/telegram/webhook`;
  await setWebhook(url, config.webhookSecretToken);
  // eslint-disable-next-line no-console
  console.log(`Webhook set to ${url}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
