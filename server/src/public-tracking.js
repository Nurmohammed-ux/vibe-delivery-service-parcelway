export function createPublicTrackingResult(shipment, trackingCode) {
  if (
    !shipment ||
    typeof shipment.status !== "string" ||
    !/^[a-z][a-z0-9_]{0,29}$/.test(shipment.status)
  ) {
    throw new Error("Stored shipment has an invalid public tracking status.");
  }

  const seenEvents = new Set();
  const events = (Array.isArray(shipment.events) ? shipment.events : [])
    .map((event) => {
      if (
        typeof event?.status !== "string" ||
        !/^[a-z][a-z0-9_]{0,29}$/.test(event.status)
      ) {
        return null;
      }

      const timestamp = Date.parse(event.timestamp);
      if (!Number.isFinite(timestamp)) return null;

      const normalizedTimestamp = new Date(timestamp).toISOString();
      const key = `${event.status}\u0000${normalizedTimestamp}`;
      if (seenEvents.has(key)) return null;
      seenEvents.add(key);

      return { status: event.status, timestamp: normalizedTimestamp, order: timestamp };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order)
    .map(({ status, timestamp }) => ({ status, timestamp }));

  const lastUpdatedAt = events.length
    ? events[events.length - 1].timestamp
    : null;

  return {
    reference: trackingCode,
    status: shipment.status,
    events,
    lastUpdatedAt,
    estimatedDelivery: null,
    updateState: events.length ? "recorded" : "unavailable",
  };
}
