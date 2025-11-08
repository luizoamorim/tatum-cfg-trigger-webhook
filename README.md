# Tatum – Configure & Trigger a Webhook (Fastify + TypeScript)

This project demonstrates how to **subscribe to Bitcoin address events in Tatum** and **receive real‑time webhooks** in a local Fastify server exposed via **ngrok**. It also shows how to **enable HMAC** on your API key and verify signatures from Tatum.

> Stack: **TypeScript**, **Fastify**, **pnpm**, **ngrok**, **Tatum REST API**

---

## 1) Prerequisites

- Node.js 18+ (recommended: 20/22)
- pnpm `>=8` (or npm/yarn)
- A Tatum account & API key (free tier is fine to start)
- An externally reachable URL (e.g., **ngrok**) for your webhook

---

## 2) Install & Configure

```bash
pnpm install
cp .env.sample .env
```

Edit your `.env` with:

```dotenv
# Tatum
TATUM_API_KEY=your_api_key_here

# Where Tatum should POST notifications
WEBHOOK_URL=https://<your-ngrok-subdomain>.ngrok-free.dev/webhook

# HMAC secret used by Tatum to sign webhook payloads (see section 3)
TATUM_HMAC_SECRET=AxQ...   # base64 or strong random

# Optional: base URL for Bitcoin APIs (defaults to v3 mainnet endpoints)
TATUM_API_URL_BTC=https://api.tatum.io/v3/bitcoin
```

> Tip: For test runs on **Bitcoin testnet**, either switch to the corresponding endpoints or stick to mainnet if your address lives there. This repo’s webhook subscription uses the `ADDRESS_EVENT` type with `chain: "bitcoin-mainnet"` in examples.

---

## 3) Enable HMAC on your API key (one‑time)

You must **enable HMAC** at the API key level. Tatum then signs all webhooks with an `x-payload-hash` header (HMAC‑SHA512, Base64).

### 3.1 Generate a strong secret (OpenSSL options)

- **URL‑safe base64 (recommended):**

```bash
openssl rand -base64 32
# Example (DON'T USE THIS IN PROD):
# AxQYbP6CmkFv2pRaEy2eRX2eT9WoAKreSSrKj0+f3uQ=
```

- **Hex string:**

```bash
openssl rand -hex 32
# Example: 7c2f3d7ad9c3a2e9c3e8...
```

> Pick one format and keep it **secret**. Put it into `TATUM_HMAC_SECRET` in your `.env`.

### 3.2 Register the secret with Tatum

```bash
curl --location --request PUT 'https://api.tatum.io/v4/subscription' \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: YOUR_TATUM_API_KEY' \
  --data '{
    "hmacSecret": "AxQ..."
  }'
# Response: 204 No Content on success
```

This binds the HMAC secret to your API key. Future webhooks will include `x-payload-hash`.

---

## 4) Run the local webhook server

```bash
pnpm tsx webhookServer.ts
# or
pnpm ts-node webhookServer.ts
```

You should see:

```
🚀 Webhook server running at http://localhost:8787/webhook
```

Expose it to the internet (in another terminal):

```bash
ngrok http 8787
# Copy the https://<subdomain>.ngrok-free.dev URL
```

Update your `.env` → `WEBHOOK_URL=https://<subdomain>.ngrok-free.dev/webhook`.

---

## 5) Create the subscription (ADDRESS_EVENT)

Use **curl** (recommended for reproducibility). Replace the address with the BTC address you want to monitor.

```bash
curl --location 'https://api.tatum.io/v3/subscription' \
  --header 'x-api-key: YOUR_TATUM_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "ADDRESS_EVENT",
    "attr": {
      "address": "1MFZWyKgeUj9vcYNmdeH52WUPue1S9j6rq",
      "chain": "bitcoin-mainnet",
      "url": "https://<your-ngrok>.ngrok-free.dev/webhook"
    }
  }'
# Response:
# { "id": "690e1cd199cab3604e959e64" }
```

> ✅ You can also create this subscription in **Tatum Dashboard → Subscriptions**.

---

## 6) Trigger an event

Send a small on‑chain transaction **to or from** the monitored address. After the transaction hits the mempool/chain, Tatum will POST a JSON payload to your webhook. Example of a **real** (truncated) payload logged by this server:

```json
{
  "address": "1MFZWyKgeUj9vcYNmdeH52WUPue1S9j6rq",
  "amount": "-0.00051",
  "asset": "BTC",
  "blockNumber": 922663,
  "txId": "5679cda9ab959d325a9abc58c85b75c8ae10827b9271737178e2a55334cc977f",
  "timestamp": 1762556031171,
  "subscriptionId": "690e1cd199cab3604e959e64",
  "subscriptionType": "ADDRESS_EVENT",
  "chain": "bitcoin-mainnet"
}
```

---

## 7) Signature verification (Fastify server)

The server parses the **raw body** and verifies the HMAC using `TATUM_HMAC_SECRET`:

```ts
// webhookServer.ts (excerpt)
fastify.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    try {
      done(null, body);
    } catch (err) {
      done(err as any, undefined);
    }
  }
);

fastify.post("/webhook", async (req, reply) => {
  const rawBody = req.body as string;
  const signature = req.headers["x-payload-hash"] as string | undefined;
  const secret = process.env.TATUM_HMAC_SECRET!;

  if (!signature) return reply.code(401).send({ error: "Missing signature" });

  const computed = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("base64");

  if (computed !== signature) {
    return reply.code(401).send({ error: "Invalid signature" });
  }

  const parsed = JSON.parse(rawBody);
  fastify.log.info("✅ Verified webhook received!");
  console.log("📦 Full payload:", JSON.stringify(parsed, null, 2));
  return reply.code(200).send({ success: true });
});
```

> If you **haven’t enabled HMAC yet**, Tatum may not send `x-payload-hash`. Enable it first (section 3).

---

## 8) Useful cURL snippets

### 8.1 (One‑time) Enable HMAC on your API key

```bash
curl --location --request PUT 'https://api.tatum.io/v4/subscription' \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: YOUR_TATUM_API_KEY' \
  --data '{
    "hmacSecret": "AxQ..."
  }'
```

### 8.2 Create subscription

```bash
curl --location 'https://api.tatum.io/v3/subscription' \
  --header 'x-api-key: YOUR_TATUM_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "ADDRESS_EVENT",
    "attr": {
      "address": "1MFZWyKgeUj9vcYNmdeH52WUPue1S9j6rq",
      "chain": "bitcoin-mainnet",
      "url": "https://<your-ngrok>.ngrok-free.dev/webhook"
    }
  }'
```

### 8.3 List subscriptions

```bash
curl --location 'https://api.tatum.io/v4/subscriptions?pageSize=10' \
  --header 'x-api-key: YOUR_TATUM_API_KEY'
```

### 8.4 Delete a subscription

```bash
curl --location --request DELETE 'https://api.tatum.io/v4/subscriptions/<SUBSCRIPTION_ID>' \
  --header 'x-api-key: YOUR_TATUM_API_KEY'
```

---

## 9) Troubleshooting

- **403 / subscription exists**: You already have a newer subscription for the same address+currency. List and delete duplicates (see 8.3/8.4).
- **No webhook received**:
  - Ensure ngrok tunnel is **running** and URL matches `WEBHOOK_URL`.
  - Confirm your **Fastify** server shows `incoming request` logs.
  - The transaction might still be in mempool; wait until Tatum detects it.
- **401 Invalid signature**:
  - HMAC secret on your server **must** match the one you set in 3.2.
  - Verify you are hashing the **raw JSON string** (not the parsed object).
- **429 RPS limit**:
  - You hit the free‑tier rate limit. Consider upgrading your Tatum plan.

---

## 10) Security Notes

- Keep `TATUM_HMAC_SECRET` **out of logs** and version control.
- Rotate your HMAC secret periodically.
- Validate the `chain` / `subscriptionId` / `address` in the payload to ensure it matches your expected context.

---

## 11) Optional files / What can be removed?

You mentioned a script like `subscribeWebhook.ts` that programmatically creates a subscription via REST. Since you’re already using **curl** or the **Dashboard**, this file is **optional**. You can safely **delete it** if you prefer managing subscriptions outside the codebase.

> If you keep it, make sure it targets the **v3** subscription endpoint and **does not** attempt to set `hmacSecret` on the subscription payload (HMAC is configured at the API‑key level via `PUT /v4/subscription`).

---

## 12) Deliverables (for your report)

- **Request body** used to create the subscription (see 8.2).
- **Screenshot or log** of the received webhook (copy from your Fastify logs showing `✅ Verified webhook received!` and payload).
- **Short explanation** (≤ 300 words) on backend integration, e.g.:  
  _“A backend exposes a `/webhook` endpoint, verifies `x‑payload‑hash` with HMAC‑SHA512 using a secret registered at `PUT /v4/subscription`, then pushes the parsed event into an internal queue (Kafka/SQS) for post‑processing (crediting user balances, updating ledgers, alerting, etc.). Failed validations return 401; all events are idempotently persisted with the txId as a unique key.”_

---

## Scripts

Add these helpful scripts to your `package.json` if you want:

```json
{
  "scripts": {
    "dev:webhook": "tsx webhookServer.ts",
    "subscribe:curl": "echo 'Use the curl in README section 8.2'",
    "ngrok": "ngrok http 8787"
  }
}
```

---

**Happy building!** 🚀
