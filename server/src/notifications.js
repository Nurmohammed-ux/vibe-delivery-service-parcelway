const supportedChannels = new Set(["email", "sms", "push"]);

export function createStatusNotificationBoundary({
  provider = null,
  environment = "development",
} = {}) {
  const inFlight = new Map();

  async function sendStatusNotification({
    shipmentReference,
    status,
    timestamp,
    channel,
    idempotencyKey,
  }) {
    if (
      typeof shipmentReference !== "string" ||
      typeof status !== "string" ||
      !Number.isFinite(Date.parse(timestamp)) ||
      !supportedChannels.has(channel) ||
      typeof idempotencyKey !== "string" ||
      !idempotencyKey.trim()
    ) {
      throw new TypeError("A valid status event, channel, and idempotency key are required.");
    }

    if (!provider) {
      return {
        status: environment === "development" ? "preview" : "not_configured",
        sent: false,
        channel,
        message:
          environment === "development"
            ? "Development preview only; no notification was sent."
            : "No notification provider is configured.",
      };
    }

    if (!Array.isArray(provider.channels) || !provider.channels.includes(channel)) {
      return {
        status: "not_configured",
        sent: false,
        channel,
        message: `The ${channel} notification channel is not configured.`,
      };
    }

    const key = `${channel}:${idempotencyKey}`;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const delivery = Promise.resolve()
      .then(() =>
        // Providers must honor this key across retries and process restarts.
        provider.sendStatusNotification(
          { shipmentReference, status, timestamp, channel },
          { idempotencyKey: key },
        ),
      )
      .then((result) => {
        if (result?.status === "sent") {
          return { status: "sent", sent: true, channel };
        }
        return {
          status: result?.status === "queued" ? "queued" : "failed",
          sent: false,
          channel,
        };
      })
      .finally(() => inFlight.delete(key));

    inFlight.set(key, delivery);
    return delivery;
  }

  return { sendStatusNotification };
}
