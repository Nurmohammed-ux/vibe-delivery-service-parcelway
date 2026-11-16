import assert from "node:assert/strict";
import test from "node:test";
import { createStatusNotificationBoundary } from "../src/notifications.js";

const notification = {
  shipmentReference: "PW-ABCDEF123456",
  status: "booked",
  timestamp: "2026-11-10T10:00:00.000Z",
  idempotencyKey: "PW-ABCDEF123456:booked:2026-11-10T10:00:00.000Z",
};

test("development notification preview is explicit and never reports a send", async () => {
  const boundary = createStatusNotificationBoundary({ environment: "development" });

  assert.deepEqual(
    await boundary.sendStatusNotification({ ...notification, channel: "sms" }),
    {
      status: "preview",
      sent: false,
      channel: "sms",
      message: "Development preview only; no notification was sent.",
    },
  );
});

test("notification boundary delegates only through a configured provider and deduplicates concurrent retries", async () => {
  const providerCalls = [];
  const processedKeys = new Set();
  const deliveredEffects = [];
  const boundary = createStatusNotificationBoundary({
    provider: {
      channels: ["email"],
      async sendStatusNotification(payload, { idempotencyKey }) {
        providerCalls.push({ payload, idempotencyKey });
        if (!processedKeys.has(idempotencyKey)) {
          processedKeys.add(idempotencyKey);
          deliveredEffects.push(payload);
        }
        return { status: "sent" };
      },
    },
  });

  const input = { ...notification, channel: "email" };
  const [first, retry] = await Promise.all([
    boundary.sendStatusNotification(input),
    boundary.sendStatusNotification(input),
  ]);
  const repeatedRetry = await boundary.sendStatusNotification(input);

  assert.deepEqual(first, { status: "sent", sent: true, channel: "email" });
  assert.deepEqual(retry, first);
  assert.deepEqual(repeatedRetry, first);
  assert.equal(providerCalls.length, 2);
  assert.equal(deliveredEffects.length, 1);
  assert.equal(providerCalls[0].idempotencyKey, `email:${notification.idempotencyKey}`);
  assert.deepEqual(providerCalls[0].payload, {
    shipmentReference: notification.shipmentReference,
    status: notification.status,
    timestamp: notification.timestamp,
    channel: "email",
  });
});

test("queued messages are not reported as sent and invalid channels are rejected", async () => {
  const boundary = createStatusNotificationBoundary({
    provider: {
      channels: ["push"],
      async sendStatusNotification() {
        return { status: "queued" };
      },
    },
  });

  assert.deepEqual(
    await boundary.sendStatusNotification({ ...notification, channel: "push" }),
    { status: "queued", sent: false, channel: "push" },
  );
  await assert.rejects(
    boundary.sendStatusNotification({ ...notification, channel: "fax" }),
    /valid status event, channel, and idempotency key/,
  );
});

test("production notification preview reports that no provider is configured", async () => {
  const boundary = createStatusNotificationBoundary({ environment: "production" });

  assert.deepEqual(
    await boundary.sendStatusNotification({ ...notification, channel: "push" }),
    {
      status: "not_configured",
      sent: false,
      channel: "push",
      message: "No notification provider is configured.",
    },
  );
});

test("notification boundary does not use a channel that the provider has not configured", async () => {
  let providerCalled = false;
  const boundary = createStatusNotificationBoundary({
    provider: {
      channels: ["sms"],
      async sendStatusNotification() {
        providerCalled = true;
        return { status: "sent" };
      },
    },
  });

  assert.deepEqual(
    await boundary.sendStatusNotification({ ...notification, channel: "email" }),
    {
      status: "not_configured",
      sent: false,
      channel: "email",
      message: "The email notification channel is not configured.",
    },
  );
  assert.equal(providerCalled, false);
});
