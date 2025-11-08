import fetch from "node-fetch";
import { config } from "dotenv";
config();

/**
 * Registers a webhook subscription with Tatum to monitor
 * all transactions for a given Bitcoin address.
 *
 * Once the subscription is active, Tatum will POST
 * a JSON payload to your webhook URL whenever
 * a transaction occurs involving the monitored address.
 */
async function subscribeWebhook() {
  const apiKey = process.env.TATUM_API_KEY!;
  const address = process.env.ADDRESS!;
  const webhookUrl = process.env.WEBHOOK_URL!;
  const baseUrl =
    process.env.TATUM_API_URL_BTC || "https://api.tatum.io/v3/bitcoin";

  if (!apiKey || !address || !webhookUrl) {
    throw new Error(
      "Missing required env vars: TATUM_API_KEY, ADDRESS, WEBHOOK_URL"
    );
  }

  console.log("🔔 Registering webhook subscription...");
  console.log("📬 Listening address:", address);
  console.log("🌐 Webhook URL:", webhookUrl);

  // Create subscription payload
  const payload = {
    type: "ADDRESS_TRANSACTION",
    attr: {
      chain: "BTC",
      address,
      url: webhookUrl,
    },
  };

  // Send subscription request
  const res = await fetch(`${baseUrl.replace("/bitcoin", "")}/subscription`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create subscription (${res.status}): ${text}`);
  }

  const data: any = await res.json();
  console.log("✅ Subscription created successfully!");
  console.log("🆔 Subscription ID:", data.id);

  console.log(
    "\nNext steps:\n" +
      "1️⃣ Add HMAC secret via PUT /v4/subscription/{id}.\n" +
      "2️⃣ Send a small transaction to the monitored address.\n" +
      "3️⃣ Observe your Fastify webhook endpoint for a POST payload.\n"
  );
}

subscribeWebhook().catch((err) => {
  console.error("❌ Error:", err.message);
});
