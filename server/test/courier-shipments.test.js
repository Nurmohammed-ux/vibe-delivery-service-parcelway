import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.js";

function createTestDatabase(initialShipments) {
  const shipments = structuredClone(initialShipments);
  const collection = {
    async createIndex() {},
    async findOne(query, options = {}) {
      const shipment = shipments.find((item) => matches(item, query));
      return shipment ? project(shipment, options.projection) : null;
    },
    find(query, options = {}) {
      return {
        sort() {
          return {
            async toArray() {
              return shipments
                .filter((item) => matches(item, query))
                .map((item) => project(item, options.projection));
            },
          };
        },
      };
    },
    async updateOne(query, updates) {
      const shipment = shipments.find((item) => matches(item, query));
      if (!shipment) return { matchedCount: 0 };
      Object.assign(shipment, structuredClone(updates.$set));
      shipment.events.push(structuredClone(updates.$push.events));
      shipment.courierActionKeys ||= [];
      const record = updates.$addToSet.courierActionKeys;
      if (!shipment.courierActionKeys.some((item) => item.key === record.key)) {
        shipment.courierActionKeys.push(structuredClone(record));
      }
      return { matchedCount: 1 };
    },
  };
  return { database: { collection: () => collection }, shipments };
}

function project(document, projection = {}) {
  const result = structuredClone(document);
  for (const [key, excluded] of Object.entries(projection)) {
    if (excluded === 0) delete result[key];
  }
  return result;
}

function matches(document, query) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === "object" && "$not" in expected) {
      const condition = expected.$not.$elemMatch;
      return !Array.isArray(actual) || !actual.some((item) => matches(item, condition));
    }
    if (expected && typeof expected === "object" && "$ne" in expected) {
      return actual !== expected.$ne;
    }
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      return matches(actual || {}, expected);
    }
    return actual === expected;
  });
}

function createShipment(overrides = {}) {
  return {
    reference: "PW-COURIER-001",
    courierId: "courier-1",
    customerId: "customer-1",
    status: "booked",
    createdAt: new Date("2026-11-10T09:00:00.000Z"),
    pickup: {
      name: "Sender",
      phone: "+880170000001",
      line1: "1 Pickup Road",
      city: "Dhaka",
      postalCode: "1000",
    },
    recipient: {
      name: "Recipient",
      phone: "+880170000002",
      line1: "2 Delivery Lane",
      city: "Dhaka",
      postalCode: "1200",
    },
    pickupWindow: { id: "morning", label: "Morning" },
    deliveryWindow: { id: "afternoon", label: "Afternoon" },
    events: [{ status: "booked", timestamp: new Date("2026-11-10T09:00:00.000Z") }],
    ...overrides,
  };
}

async function withCourierServer(run, seed = [createShipment()]) {
  const { database, shipments } = createTestDatabase(seed);
  const authProvider = {
    async getSession(request) {
      const authorization = request.get("authorization");
      if (authorization === "Bearer customer") {
        return { id: "customer-1", role: "customer" };
      }
      return {
        id: authorization === "Bearer courier-2" ? "courier-2" : "courier-1",
        role: "courier",
      };
    },
  };
  const app = createApp(
    { devAuthMock: false },
    "connected",
    authProvider,
    database,
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/courier`;
  try {
    await run(baseUrl, shipments);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function actionRequest(action, key, authorization = "Bearer courier-1") {
  return {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(action),
  };
}

test("courier lists only assigned shipments and only the stop details needed to deliver", async () => {
  await withCourierServer(async (baseUrl) => {
    const { shipments } = await (await fetch(baseUrl + "/shipments", {
      headers: { authorization: "Bearer courier-1" },
    })).json();

    assert.equal(shipments.length, 1);
    assert.equal(shipments[0].reference, "PW-COURIER-001");
    assert.equal(shipments[0].recipient.phone, "+880170000002");
    assert.equal("customerId" in shipments[0], false);
    assert.equal("courierId" in shipments[0], false);
    assert.equal("price" in shipments[0], false);
    assert.equal("operationalExceptions" in shipments[0], false);
    assert.equal("dispatchHistory" in shipments[0], false);
  }, [
    createShipment({
      operationalExceptions: [{ notes: "dispatcher-only context" }],
      dispatchHistory: [{ actorId: "dispatcher-secret" }],
    }),
    createShipment({ reference: "PW-OTHER-001", courierId: "courier-2" }),
  ]);
});

test("courier cannot read or act on a shipment assigned to another courier", async () => {
  await withCourierServer(async (baseUrl, shipments) => {
    const list = await fetch(`${baseUrl}/shipments`, {
      headers: { authorization: "Bearer courier-2" },
    });
    const action = await fetch(
      `${baseUrl}/shipments/${shipments[0].reference}/actions`,
      actionRequest({ action: "picked_up" }, "foreign-act-001", "Bearer courier-2"),
    );

    assert.deepEqual((await list.json()).shipments, []);
    assert.equal(action.status, 404);
    assert.equal((await action.json()).code, "SHIPMENT_NOT_FOUND");
    assert.equal(shipments[0].status, "booked");
  });
});

test("explicit development mock identity takes precedence over configured Firebase auth", async () => {
  let firebaseSessionCalled = false;
  const app = createApp(
    { devAuthMock: true, devAuthRole: "courier" },
    "not_configured",
    {
      async getSession() {
        firebaseSessionCalled = true;
        throw new Error("Development mock should take precedence.");
      },
    },
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/courier/shipments`,
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "SHIPMENT_STORE_UNAVAILABLE");
    assert.equal(firebaseSessionCalled, false);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("valid pickup and delivery actions record auditable events and require proof", async () => {
  await withCourierServer(async (baseUrl, shipments) => {
    const url = `${baseUrl}/shipments/${shipments[0].reference}/actions`;
    const arrival = await fetch(url, actionRequest({ action: "arrived" }, "action-arrive-01"));
    assert.equal(arrival.status, 200);
    assert.equal(shipments[0].status, "booked");
    assert.equal(shipments[0].events.at(-1).status, "arrived_for_pickup");

    const pickup = await fetch(url, actionRequest({ action: "picked_up" }, "action-pickup-01"));
    assert.equal(pickup.status, 200);
    assert.equal(shipments[0].status, "picked_up");

    const earlyDelivery = await fetch(url, actionRequest({
      action: "delivered",
      recipientName: "Taylor Recipient",
      confirmed: true,
    }, "action-too-early-01"));
    assert.equal(earlyDelivery.status, 409);

    const transit = await fetch(url, actionRequest({ action: "in_transit" }, "action-transit-001"));
    assert.equal(transit.status, 200);
    assert.equal(shipments[0].status, "in_transit");

    const noProof = await fetch(url, actionRequest({ action: "delivered" }, "action-noproof-01"));
    assert.equal(noProof.status, 400);
    assert.equal((await noProof.json()).code, "PROOF_OF_DELIVERY_REQUIRED");
    assert.equal(shipments[0].status, "in_transit");

    const delivered = await fetch(url, actionRequest({
      action: "delivered",
      recipientName: "Taylor Recipient",
      confirmed: true,
    }, "action-delivery-01"));
    const result = await delivered.json();
    assert.equal(delivered.status, 200);
    assert.equal(result.shipment.status, "delivered");
    assert.equal(result.shipment.events.at(-1).details.confirmation, "recipient_handoff");
    assert.equal(result.shipment.events.at(-1).source, "manual");
    assert.equal("courierActionKeys" in result.shipment, false);
    assert.equal("customerId" in result.shipment, false);
    assert.equal("price" in result.shipment, false);
    assert.equal("payment" in result.shipment, false);
    assert.equal("actorId" in result.shipment.events.at(-1), false);
  });
});

test("invalid transitions do not modify shipment status", async () => {
  await withCourierServer(async (baseUrl, shipments) => {
    const response = await fetch(
      `${baseUrl}/shipments/${shipments[0].reference}/actions`,
      actionRequest({ action: "delivered", recipientName: "Recipient", confirmed: true }, "invalid-transition-01"),
    );

    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "INVALID_SHIPMENT_TRANSITION");
    assert.equal(shipments[0].status, "booked");
    assert.equal(shipments[0].events.length, 1);
  });
});

test("failed delivery requires a reason and next action, then records an exception", async () => {
  await withCourierServer(async (baseUrl, shipments) => {
    shipments[0].status = "in_transit";
    const url = `${baseUrl}/shipments/${shipments[0].reference}/actions`;
    const missingReason = await fetch(url, actionRequest({
      action: "delivery_attempted",
      nextAction: "dispatcher_follow_up",
    }, "exception-missing-01"));
    assert.equal(missingReason.status, 400);
    assert.equal((await missingReason.json()).code, "DELIVERY_REASON_REQUIRED");

    const failed = await fetch(url, actionRequest({
      action: "delivery_attempted",
      reason: "recipient_unavailable",
      notes: "No one answered.",
      nextAction: "contact_recipient",
    }, "exception-valid-001"));
    const result = await failed.json();
    assert.equal(failed.status, 200);
    assert.equal(result.shipment.status, "exception");
    assert.deepEqual(result.shipment.events.at(-1).details, {
      reason: "recipient_unavailable",
      nextAction: "contact_recipient",
      notes: "No one answered.",
    });
  });
});

test("retries with the same idempotency key do not duplicate events or mark a new action successful", async () => {
  await withCourierServer(async (baseUrl, shipments) => {
    const url = `${baseUrl}/shipments/${shipments[0].reference}/actions`;
    const request = actionRequest({ action: "picked_up" }, "retry-action-001");
    const first = await fetch(url, request);
    const duplicate = await fetch(url, request);
    const reused = await fetch(url, actionRequest({ action: "arrived" }, "retry-action-001"));

    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).duplicate, true);
    assert.equal(reused.status, 409);
    assert.equal((await reused.json()).code, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(shipments[0].status, "picked_up");
    assert.equal(shipments[0].events.length, 2);
  });
});
