import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.js";

const rules = {
  currency: "BDT",
  termsVersion: "demo-terms-1",
  termsText: "Demo terms.",
  supportedPostalCodes: ["1000", "1200"],
  services: [{
    id: "standard",
    name: "Standard",
    description: "Configured test service",
    basePrice: 100,
    pricePerKg: 25,
    maxWeightKg: 10,
    maxDimensionsCm: { length: 60, width: 50, height: 40 },
    pickupWindows: [{ id: "morning", label: "Morning" }],
    deliveryWindows: [{ id: "afternoon", label: "Afternoon" }],
  }],
};

function createTestDatabase() {
  const shipments = [];
  const collection = {
    async createIndex() {},
    async findOne(query) {
      const shipment = shipments.find((item) =>
        Object.entries(query).every(([key, value]) => item[key] === value),
      );
      return shipment ? publicShipment(shipment) : null;
    },
    find(query) {
      return {
        sort() {
          return {
            async toArray() {
              return shipments
                .filter((item) =>
                  Object.entries(query).every(([key, value]) => item[key] === value),
                )
                .map(publicShipment);
            },
          };
        },
      };
    },
    async insertOne(shipment) {
      if (shipments.some((item) =>
        item.customerId === shipment.customerId &&
        item.idempotencyKey === shipment.idempotencyKey,
      )) {
        throw Object.assign(new Error("duplicate key"), { code: 11000 });
      }
      shipments.push(structuredClone(shipment));
    },
  };
  return {
    database: { collection: () => collection },
    shipments,
  };
}

function publicShipment(shipment) {
  const result = structuredClone(shipment);
  delete result.idempotencyKey;
  return result;
}

function createBooking(rulesVersion, overrides = {}) {
  return {
    pickup: {
      name: "Casey Sender",
      phone: "+880 1700-000001",
      line1: "1 Pickup Road",
      city: "Dhaka",
      postalCode: "1000",
    },
    recipient: {
      name: "Taylor Recipient",
      phone: "+880 1700-000002",
      line1: "2 Delivery Lane",
      city: "Dhaka",
      postalCode: "1200",
    },
    parcel: {
      weightKg: 2,
      dimensionsCm: { length: 20, width: 15, height: 10 },
    },
    contentsDescription: "Books",
    serviceId: "standard",
    pickupWindowId: "morning",
    deliveryWindowId: "afternoon",
    rulesVersion,
    termsVersion: "demo-terms-1",
    acceptedTerms: true,
    ...overrides,
  };
}

async function withServer(run, overrides = {}) {
  const { database, shipments } = createTestDatabase();
  const authProvider = {
    async getSession(request) {
      return {
        id: request.get("authorization") === "Bearer other-customer"
          ? "customer-2"
          : "customer-1",
        role: "customer",
      };
    },
  };
  const app = createApp(
    { devAuthMock: false, shipmentRules: rules, ...overrides },
    "connected",
    authProvider,
    database,
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const optionsResponse = await fetch(`${baseUrl}/api/customer/booking-options`, {
      headers: { authorization: "Bearer customer-1" },
    });
    const { rulesVersion } = await optionsResponse.json();
    await run(baseUrl, shipments, rulesVersion);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function requestOptions(body, key = "booking-key-001", authorization = "Bearer customer-1") {
  return {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  };
}

test("customer booking returns a stable reference, configured quote, and demo-only payment", async () => {
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const response = await fetch(
      `${baseUrl}/api/customer/shipments`,
      requestOptions(createBooking(rulesVersion)),
    );

    assert.equal(response.status, 201);
    const { shipment } = await response.json();
    assert.match(shipment.reference, /^PW-[A-F0-9]{24}$/);
    assert.deepEqual(shipment.price, {
      currency: "BDT",
      base: 100,
      weight: 50,
      total: 150,
    });
    assert.deepEqual(shipment.payment, {
      status: "demo_not_charged",
      provider: null,
    });
    assert.deepEqual(shipments[0].parcel.dimensionsCm, {
      length: 20,
      width: 15,
      height: 10,
    });
    assert.equal(shipment.status, "booked");
    assert.equal(shipments.length, 1);
  });
});

test("booking stores only the supported parcel dimensions", async () => {
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const booking = createBooking(rulesVersion);
    booking.parcel.dimensionsCm.internalNote = "must not be persisted";

    const response = await fetch(
      `${baseUrl}/api/customer/shipments`,
      requestOptions(booking),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(shipments[0].parcel.dimensionsCm, {
      length: 20,
      width: 15,
      height: 10,
    });
  });
});

test("invalid parcel and out-of-area address are rejected before creating a shipment", async () => {
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const booking = createBooking(rulesVersion);
    booking.parcel.weightKg = 11;
    booking.pickup.postalCode = "9999";

    const response = await fetch(
      `${baseUrl}/api/customer/shipments`,
      requestOptions(booking),
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, "INVALID_BOOKING");
    assert.match(payload.fields.weightKg, /up to 10 kg/);
    assert.match(payload.fields.pickupPostalCode, /outside the configured service area/);
    assert.equal(shipments.length, 0);
  });
});

test("booking rejects postal codes outside the selected service coverage", async () => {
  const restrictedRules = {
    ...rules,
    services: [{
      ...rules.services[0],
      supportedPostalCodes: ["1200"],
    }],
  };
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const response = await fetch(
      `${baseUrl}/api/customer/shipments`,
      requestOptions(createBooking(rulesVersion)),
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, "INVALID_BOOKING");
    assert.match(payload.fields.pickupPostalCode, /outside the configured service area/);
    assert.equal(shipments.length, 0);
  }, { shipmentRules: restrictedRules });
});

test("services without specific coverage use the configured nationwide postal codes", async () => {
  const nationwideRules = {
    ...rules,
    supportedPostalCodes: [...rules.supportedPostalCodes, "2000"],
    services: [{
      ...rules.services[0],
      id: "nationwide",
      name: "Nationwide",
    }],
  };
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const booking = createBooking(rulesVersion, {
      pickup: { ...createBooking(rulesVersion).pickup, postalCode: "2000" },
      recipient: { ...createBooking(rulesVersion).recipient, postalCode: "2000" },
      serviceId: "nationwide",
    });
    const response = await fetch(
      `${baseUrl}/api/customer/shipments`,
      requestOptions(booking),
    );

    assert.equal(response.status, 201);
    assert.equal(shipments.length, 1);
  }, { shipmentRules: nationwideRules });
});

test("booking rejects stale rules and missing terms acceptance", async () => {
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const url = `${baseUrl}/api/customer/shipments`;
    const stale = await fetch(url, requestOptions(createBooking("stale-rules")));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, "BOOKING_RULES_CHANGED");

    const booking = createBooking(rulesVersion);
    booking.acceptedTerms = false;
    const unaccepted = await fetch(
      url,
      requestOptions(booking, "booking-key-002"),
    );
    const payload = await unaccepted.json();
    assert.equal(unaccepted.status, 400);
    assert.equal(payload.code, "INVALID_BOOKING");
    assert.match(payload.fields.acceptedTerms, /Accept the current booking terms/);
    assert.equal(shipments.length, 0);
  });
});

test("repeating an idempotency key returns the original shipment without duplicating it", async () => {
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const url = `${baseUrl}/api/customer/shipments`;
    const first = await fetch(url, requestOptions(createBooking(rulesVersion)));
    const firstShipment = (await first.json()).shipment;
    const retry = await fetch(url, requestOptions(createBooking(rulesVersion)));
    const retryBody = await retry.json();

    assert.equal(retry.status, 200);
    assert.equal(retryBody.duplicate, true);
    assert.equal(retryBody.shipment.reference, firstShipment.reference);
    assert.equal(retryBody.shipment.events.length, 1);
    assert.equal(shipments.length, 1);
  });
});

test("customer shipment responses omit internal operational history and event details", async () => {
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const url = `${baseUrl}/api/customer/shipments`;
    const bookingResponse = await fetch(
      url,
      requestOptions(createBooking(rulesVersion)),
    );
    const { shipment } = await bookingResponse.json();
    shipments[0].courierId = "courier-internal";
    shipments[0].operationalExceptions = [{ notes: "dispatcher-only note" }];
    shipments[0].dispatchHistory = [{ actorId: "staff-internal" }];
    shipments[0].events.push({
      status: "exception",
      timestamp: new Date("2026-10-02T12:00:00.000Z"),
      actorId: "staff-internal",
      details: { notes: "private operational note" },
      proof: { recipientName: "Not for customer responses" },
    });

    const listResponse = await fetch(url, {
      headers: { authorization: "Bearer customer-1" },
    });
    const detailResponse = await fetch(`${url}/${shipment.reference}`, {
      headers: { authorization: "Bearer customer-1" },
    });
    const retryResponse = await fetch(url, requestOptions(createBooking(rulesVersion)));
    const payloads = [
      (await listResponse.json()).shipments[0],
      (await detailResponse.json()).shipment,
      (await retryResponse.json()).shipment,
    ];

    for (const payload of payloads) {
      assert.equal("customerId" in payload, false);
      assert.equal("courierId" in payload, false);
      assert.equal("operationalExceptions" in payload, false);
      assert.equal("dispatchHistory" in payload, false);
      assert.deepEqual(payload.events.at(-1), {
        status: "exception",
        timestamp: "2026-10-02T12:00:00.000Z",
      });
      assert.doesNotMatch(JSON.stringify(payload), /dispatcher-only note|staff-internal|private operational note|Not for customer responses/);
    }
  });
});

test("public tracking sorts and deduplicates events without exposing shipment details", async () => {
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const bookingResponse = await fetch(
      `${baseUrl}/api/customer/shipments`,
      requestOptions(createBooking(rulesVersion)),
    );
    const { shipment } = await bookingResponse.json();
    shipments[0].status = "in_transit";
    shipments[0].events = [
      { status: "in_transit", timestamp: "2026-10-02T12:00:00.000Z" },
      { status: "booked", timestamp: "2026-10-01T09:00:00.000Z" },
      { status: "in_transit", timestamp: "2026-10-02T12:00:00.000Z" },
    ];

    const response = await fetch(`${baseUrl}/api/public/tracking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingCode: shipment.reference.toLowerCase() }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.events, [
      { status: "booked", timestamp: "2026-10-01T09:00:00.000Z" },
      { status: "in_transit", timestamp: "2026-10-02T12:00:00.000Z" },
    ]);
    assert.equal(payload.status, "in_transit");
    assert.equal(payload.lastUpdatedAt, "2026-10-02T12:00:00.000Z");
    assert.equal(payload.estimatedDelivery, null);
    assert.equal(payload.updateState, "recorded");
    assert.deepEqual(Object.keys(payload).sort(), [
      "estimatedDelivery",
      "events",
      "lastUpdatedAt",
      "reference",
      "status",
      "updateState",
    ]);
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /Casey Sender|Taylor Recipient|\+880|Delivery Lane|Pickup Road/);
  });
});

test("public tracking returns not found for a well-formed unknown reference", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/public/tracking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingCode: "PW-AAAAAAAAAAAA" }),
    });

    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "SHIPMENT_NOT_FOUND");
  });
});

test("shipment references are scoped to the authenticated customer", async () => {
  await withServer(async (baseUrl, shipments, rulesVersion) => {
    const response = await fetch(
      `${baseUrl}/api/customer/shipments`,
      requestOptions(createBooking(rulesVersion)),
    );
    const { shipment } = await response.json();
    const foreign = await fetch(
      `${baseUrl}/api/customer/shipments/${shipment.reference}`,
      { headers: { authorization: "Bearer other-customer" } },
    );
    const ownList = await fetch(`${baseUrl}/api/customer/shipments`, {
      headers: { authorization: "Bearer other-customer" },
    });

    assert.equal(foreign.status, 404);
    assert.equal((await foreign.json()).code, "SHIPMENT_NOT_FOUND");
    assert.deepEqual((await ownList.json()).shipments, []);
    assert.equal(shipments.length, 1);
  });
});

test("booking is explicitly unavailable until service and terms rules are configured", async () => {
  const { database } = createTestDatabase();
  const app = createApp(
    { devAuthMock: false },
    "connected",
    { async getSession() { return { id: "customer-1", role: "customer" }; } },
    database,
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/customer/booking-options`, {
      headers: { authorization: "Bearer customer-1" },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "BOOKING_NOT_CONFIGURED");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("development customer mock takes precedence over configured Firebase auth", async () => {
  const { database, shipments } = createTestDatabase();
  let firebaseSessionCalled = false;
  const app = createApp(
    { devAuthMock: true, devAuthRole: "customer", shipmentRules: rules },
    "connected",
    {
      async getSession() {
        firebaseSessionCalled = true;
        throw new Error("Development mock should take precedence.");
      },
    },
    database,
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const optionsResponse = await fetch(`${baseUrl}/api/customer/booking-options`);
    const { rulesVersion } = await optionsResponse.json();
    const response = await fetch(`${baseUrl}/api/customer/shipments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "development-booking-001",
      },
      body: JSON.stringify(createBooking(rulesVersion)),
    });

    assert.equal(response.status, 201);
    assert.equal(firebaseSessionCalled, false);
    assert.equal(shipments[0].customerId, "development-customer");
  } finally {
    server.close();
    await once(server, "close");
  }
});
