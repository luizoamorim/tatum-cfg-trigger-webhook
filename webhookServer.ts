import { config } from "dotenv";
config();

import Fastify from "fastify";
import crypto from "crypto";

const fastify = Fastify({ logger: true });

// Capture the raw JSON body for HMAC validation
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

  if (!signature) {
    fastify.log.warn("⚠️ Missing x-payload-hash header.");
    return reply.code(401).send({ error: "Missing signature" });
  }

  // Compute Base64 HMAC-SHA512
  const computed = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("base64");

  if (computed !== signature) {
    fastify.log.warn("⚠️ Invalid signature. Ignoring request.");
    return reply.code(401).send({ error: "Invalid signature" });
  }

  const parsed = JSON.parse(rawBody);

  console.log("✅ Verified webhook received!");
  console.log("📦 Full payload:");
  console.log(JSON.stringify(parsed, null, 2));

  // Optional: Extract useful transaction info
  if (parsed.event?.body) {
    const body = parsed.event.body;
    console.log("🔗 TX Hash:", body.txId);
    console.log("📬 Address:", body.address);
    console.log("💰 Amount:", body.amount);
    console.log("⛓️ Chain:", body.chain);
  }

  return reply.code(200).send({ success: true });
});

fastify.listen({ port: 8787, host: "0.0.0.0" });
