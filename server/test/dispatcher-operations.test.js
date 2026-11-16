import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.js";

function createTestDatabase(initialShipments) {
  const shipments = structuredClone(initialShipments);
  const profiles = [
    { firebaseUid: "courier-1", role: "courier", displayName: "Courier One" },
    { firebaseUid: "courier-2", role: "courier", displayName: "Courier Two" },
    { firebaseUid: "dispatcher-1", role: "dispatcher", displayName: "Dispatcher One" },
    { firebaseUid: "dispatcher-2", role: "dispatcher", displayName: "Dispatcher Two" },
  ];
  const shipmentCollection = {
    async createIndex() {},
    async findOne(query, options = {}) {
      const shipment = shipments.find((item) => matches(item, query));
      return shipment ? project(shipment, options.projection) : null;
    },
    find(query, options = {}) {
      return {
        sort(sortOptions) {
          return {
            async toArray() {
              const results = shipments
                .filter((item) => matches(item, query))
                .map((item) => project(item, options.projection));
              const [field, direction] = Object.entries(sortOptions)[0] || [];
              if (field) {
                results.sort((left, right) =>
                  direction * compareValues(getPath(left, field), getPath(right, field)),
                );
              }
              return results;
            },
          };
        },
      };
    },
    async updateOne(query, updates) {
      const shipment = shipments.find((item) => matches(item, query));
      if (!shipment) return { matchedCount: 0 };
      for (const [path, value] of Object.entries(updates.$set || {})) {
        setPath(shipment, path, value, query);
      }
      for (const [path, value] of Object.entries(updates.$push || {})) {
        pushPath(shipment, path, value, query);
      }
      return { matchedCount: 1 };
    },
  };
  const profileCollection = {
    async findOne(query, options = {}) {
      const profile = profiles.find((item) => matches(item, query));
      return profile ? project(profile, options.projection) : null;
    },
    find(query, options = {}) {
      return {
        sort(sortOptions) {
          return {
            async toArray() {
              const results = profiles
                .filter((item) => matches(item, query))
                .map((item) => project(item, options.projection));
              const [field, direction] = Object.entries(sortOptions)[0] || [];
              if (field) results.sort((left, right) =>
                direction * compareValues(left[field], right[field]),
              );
              return results;
            },
          };
        },
      };
    },
  };
  return {
    database: {
      collection(name) {
        return name === "users" ? profileCollection : shipmentCollection;
      },
    },
    shipments,
  };
}

function project(document, projection = {}) {
  const included = Object.entries(projection)
    .filter(([key, value]) => key !== "_id" && value === 1)
    .map(([key]) => key);
  if (included.length) {
    const result = {};
    for (const path of included) setSimplePath(result, path, getPath(document, path));
    return result;
  }

  const result = structuredClone(document);
  for (const [path, value] of Object.entries(projection)) {
    if (value === 0) deletePath(result, path);
  }
  return result;
}

function matches(document, query) {
  return Object.entries(query).every(([path, expected]) => {
    if (path === "$and") return expected.every((condition) => matches(document, condition));
    if (path === "$or") return expected.some((condition) => matches(document, condition));
    const actual = getPath(document, path);
    if (expected instanceof RegExp) {
      return Array.isArray(actual)
        ? actual.some((value) => expected.test(value))
        : expected.test(actual ?? "");
    }
    if (expected && typeof expected === "object") {
      if ("$ne" in expected) {
        return Array.isArray(actual)
          ? actual.every((value) => value !== expected.$ne)
          : actual !== expected.$ne;
      }
      if ("$exists" in expected) return Boolean(actual !== undefined) === expected.$exists;
      if ("$elemMatch" in expected) {
        return Array.isArray(actual) && actual.some((item) => matches(item, expected.$elemMatch));
      }
      if ("$not" in expected) {
        return !matches(document, { [path]: expected.$not });
      }
      return matches(actual || {}, expected);
    }
    if (expected === null && actual === undefined) return true;
    return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  });
}

function getPath(object, path) {
  return path.split(".").reduce((value, part) => {
    if (Array.isArray(value)) return value.flatMap((item) => getPath(item, part));
    return value?.[part];
  }, object);
}

function setSimplePath(object, path, value) {
  const parts = path.split(".");
  const key = parts.pop();
  const parent = parts.reduce((current, part) => (current[part] ||= {}), object);
  parent[key] = structuredClone(value);
}

function deletePath(object, path) {
  const parts = path.split(".");
  const key = parts.pop();
  const parent = parts.reduce((current, part) => current?.[part], object);
  if (Array.isArray(parent)) {
    for (const item of parent) delete item[key];
  } else if (parent) {
    delete parent[key];
  }
}

function setPath(object, path, value, query) {
  if (path.includes(".$.")) {
    const [arrayName, field] = path.split(".$.");
    const item = findArrayItem(object, arrayName, query);
    if (item) setSimplePath(item, field, value);
    return;
  }
  setSimplePath(object, path, value);
}

function pushPath(object, path, value, query) {
  if (path.includes(".$.")) {
    const [arrayName, field] = path.split(".$.");
    const item = findArrayItem(object, arrayName, query);
    if (!item) return;
    const target = field.split(".").reduce((current, part, index, parts) => {
      if (index === parts.length - 1) return current[part] ||= [];
      return current[part] ||= {};
    }, item);
    target.push(structuredClone(value));
    return;
  }
  const target = path.split(".").reduce((current, part, index, parts) => {
    if (index === parts.length - 1) return current[part] ||= [];
    return current[part] ||= {};
  }, object);
  target.push(structuredClone(value));
}

function findArrayItem(shipment, arrayName, query) {
  const id = query[`${arrayName}.id`];
  return shipment[arrayName]?.find((item) => item.id === id);
}

function compareValues(left, right) {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function createShipment(overrides = {}) {
  return {
    reference: "PW-DISPATCH-001",
    customerId: "customer-1",
    status: "booked",
    service: { id: "standard", name: "Standard" },
    pickup: {
      name: "Casey Sender",
      city: "Dhaka",
      postalCode: "1000",
      line1: "1 Pickup Road",
    },
    recipient: {
      name: "Taylor Recipient",
      city: "Dhaka",
      postalCode: "1200",
      line1: "2 Delivery Lane",
    },
    pickupWindow: { id: "morning", label: "Morning" },
    deliveryWindow: { id: "afternoon", label: "Afternoon" },
    createdAt: new Date("2026-11-10T09:00:00.000Z"),
    updatedAt: new Date("2026-11-10T09:00:00.000Z"),
    price: { currency: "BDT", total: 999 },
    payment: { status: "demo_not_charged" },
    events: [{ status: "booked", timestamp: new Date("2026-11-10T09:00:00.000Z") }],
    ...overrides,
  };
}

async function withDispatcherServer(run, seed = [createShipment()]) {
  const { database, shipments } = createTestDatabase(seed);
  const authProvider = {
    async getSession(request) {
      const authorization = request.get("authorization");
      if (!authorization) {
        throw Object.assign(new Error("Sign in to continue."), {
          status: 401,
          code: "AUTH_REQUIRED",
          isPublicAuthError: true,
        });
      }
      if (authorization === "Bearer courier") {
        return { id: "courier-1", role: "courier", displayName: "Courier One" };
      }
      if (authorization === "Bearer dispatcher-2") {
        return { id: "dispatcher-2", role: "dispatcher", displayName: "Dispatcher Two" };
      }
      if (authorization === "Bearer admin") {
        return { id: "admin-1", role: "admin", displayName: "Admin One" };
      }
      return { id: "dispatcher-1", role: "dispatcher", displayName: "Dispatcher One" };
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
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/dispatcher`;
  try {
    await run(baseUrl, shipments);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function dispatcherRequest(body, key, authorization = "Bearer dispatcher-1") {
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

test("operations endpoints reject non-operations roles and unauthenticated requests", async () => {
  await withDispatcherServer(async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}/overview`, {
      headers: { authorization: "Bearer courier" },
    });
    const unauthorized = await fetch(`${baseUrl}/overview`);

    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).code, "OPERATIONS_ACCESS_REQUIRED");
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).code, "AUTH_REQUIRED");
  });
});

test("admins can use operations APIs and their actions are audited", async () => {
  await withDispatcherServer(async (baseUrl) => {
    const overview = await fetch(`${baseUrl}/overview`, {
      headers: { authorization: "Bearer admin" },
    });
    const assignment = await fetch(
      `${baseUrl}/shipments/PW-DISPATCH-001/assignment`,
      dispatcherRequest({
        courierId: "courier-1",
        expectedCourierId: null,
      }, "admin-assignment-001", "Bearer admin"),
    );
    const payload = await assignment.json();

    assert.equal(overview.status, 200);
    assert.equal(assignment.status, 200);
    assert.equal(payload.shipment.dispatchHistory.at(-1).actorId, "admin-1");
  });
});

test("shipment board supports safe status, service, area, and text filters without exposing payment data", async () => {
  await withDispatcherServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/shipments?status=booked&serviceId=standard&area=Dhaka&q=PW-DISPATCH`,
      { headers: { authorization: "Bearer dispatcher-1" } },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.shipments.length, 1);
    assert.equal(payload.shipments[0].reference, "PW-DISPATCH-001");
    assert.equal("price" in payload.shipments[0], false);
    assert.equal("payment" in payload.shipments[0], false);
  });
});

test("courier assignment validates the account, expected current assignment, and idempotent retry", async () => {
  await withDispatcherServer(async (baseUrl, shipments) => {
    const url = `${baseUrl}/shipments/${shipments[0].reference}/assignment`;
    const request = dispatcherRequest({
      courierId: "courier-1",
      expectedCourierId: null,
    }, "assign-courier-001");
    const assigned = await fetch(url, request);
    const retry = await fetch(url, request);

    assert.equal(assigned.status, 200);
    assert.equal((await assigned.json()).shipment.courierId, "courier-1");
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).duplicate, true);
    assert.equal(shipments[0].dispatchHistory.length, 1);

    const stale = await fetch(url, dispatcherRequest({
      courierId: "courier-2",
      expectedCourierId: null,
    }, "assign-courier-002"));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, "ASSIGNMENT_CHANGED");
    assert.equal(shipments[0].courierId, "courier-1");
    assert.equal(shipments[0].dispatchHistory.length, 1);
  });
});

test("assignment rejects unknown couriers and delivered shipments", async () => {
  await withDispatcherServer(async (baseUrl, shipments) => {
    const url = `${baseUrl}/shipments/${shipments[0].reference}/assignment`;
    const unknownCourier = await fetch(url, dispatcherRequest({
      courierId: "not-a-courier",
      expectedCourierId: null,
    }, "assign-invalid-001"));
    assert.equal(unknownCourier.status, 400);
    assert.equal((await unknownCourier.json()).code, "COURIER_NOT_FOUND");

    shipments[0].status = "delivered";
    const delivered = await fetch(url, dispatcherRequest({
      courierId: "courier-1",
      expectedCourierId: null,
    }, "assign-delivered-01"));
    assert.equal(delivered.status, 409);
    assert.equal((await delivered.json()).code, "DELIVERED_SHIPMENT_ASSIGNMENT");
    assert.equal(shipments[0].courierId, undefined);
  });
});

test("dispatcher exception workflow audits creation, ownership, next action, and resolution", async () => {
  await withDispatcherServer(async (baseUrl, shipments) => {
    const root = `${baseUrl}/shipments/${shipments[0].reference}`;
    const created = await fetch(`${root}/exceptions`, dispatcherRequest({
      category: "address_issue",
      notes: "Unit number needs confirmation.",
      nextAction: "verify_address",
    }, "exception-create-001"));
    const createdBody = await created.json();
    const exception = createdBody.shipment.operationalExceptions[0];

    assert.equal(created.status, 201);
    assert.equal(createdBody.shipment.status, "exception");
    assert.equal(exception.ownerId, "dispatcher-1");
    assert.equal(exception.status, "open");
    assert.equal(shipments[0].dispatchHistory[0].action, "exception_created");

    const missingResolution = await fetch(
      `${root}/exceptions/${exception.id}/actions`,
      dispatcherRequest({ status: "resolved" }, "exception-resolve-00"),
    );
    assert.equal(missingResolution.status, 400);
    assert.equal((await missingResolution.json()).code, "RESOLUTION_NOTES_REQUIRED");

    const updated = await fetch(
      `${root}/exceptions/${exception.id}/actions`,
      dispatcherRequest({
        ownerId: "dispatcher-2",
        nextAction: "contact_sender",
        status: "in_progress",
      }, "exception-update-001"),
    );
    assert.equal(updated.status, 200);
    assert.equal(shipments[0].operationalExceptions[0].ownerId, "dispatcher-2");
    assert.equal(shipments[0].operationalExceptions[0].status, "in_progress");

    const resolved = await fetch(
      `${root}/exceptions/${exception.id}/actions`,
      dispatcherRequest({
        status: "resolved",
        resolutionNotes: "Sender confirmed the complete address.",
      }, "exception-resolve-01"),
    );
    assert.equal(resolved.status, 200);
    assert.equal(shipments[0].operationalExceptions[0].status, "resolved");
    assert.equal(shipments[0].status, "booked");
    assert.equal(shipments[0].dispatchHistory.length, 3);
    assert.equal(shipments[0].operationalExceptions[0].history.length, 3);
  });
});

test("overview prioritizes exception queue and reports no configured courier capacity policy", async () => {
  await withDispatcherServer(async (baseUrl) => {
    const overview = await (await fetch(`${baseUrl}/overview`, {
      headers: { authorization: "Bearer dispatcher-1" },
    })).json();
    const couriers = await (await fetch(`${baseUrl}/couriers`, {
      headers: { authorization: "Bearer dispatcher-1" },
    })).json();

    assert.equal(overview.counts.booked, 1);
    assert.equal(overview.counts.unassigned, 1);
    assert.equal(overview.exceptions.length, 1);
    assert.equal(overview.exceptions[0].reference, "PW-DISPATCH-EXCEPTION");
    assert.equal(couriers.capacityRulesConfigured, false);
    assert.equal(couriers.couriers.length, 2);
  }, [
    createShipment(),
    createShipment({
      reference: "PW-DISPATCH-EXCEPTION",
      status: "exception",
      events: [{
        status: "exception",
        timestamp: new Date("2026-11-10T10:00:00.000Z"),
        details: { reason: "damage" },
      }],
    }),
  ]);
});
