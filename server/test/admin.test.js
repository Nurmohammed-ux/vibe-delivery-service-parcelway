import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.js";

const shipmentRules = {
  currency: "USD",
  termsVersion: "v1",
  termsText: "Delivery terms apply.",
  supportedPostalCodes: ["1000", "1200"],
  services: [{
    id: "standard",
    name: "Standard",
    description: "Standard delivery",
    basePrice: 100,
    pricePerKg: 5,
    maxWeightKg: 10,
    maxDimensionsCm: { length: 60, width: 40, height: 30 },
    pickupWindows: [{ id: "morning", label: "Morning" }],
    deliveryWindows: [{ id: "afternoon", label: "Afternoon" }],
  }],
};

function createDatabase(initialUsers = []) {
  const collections = new Map([
    ["users", initialUsers.map((user) => ({ ...user }))],
    ["adminSettings", []],
    ["adminAudit", []],
    ["adminControl", []],
    ["shipments", []],
  ]);
  const database = {
    collection(name) {
      const documents = collections.get(name);
      return {
        async createIndex() {},
        async findOne(query) {
          return documents.find((document) =>
            Object.entries(query).every(([key, value]) => document[key] === value),
          ) || null;
        },
        async findOneAndUpdate(query, update) {
          const now = query.$or[0].lockedUntil.$lte;
          const document = documents.find((item) =>
            item._id === query._id &&
            (!item.lockedUntil || item.lockedUntil <= now),
          );
          if (!document) return null;
          Object.assign(document, update.$set);
          return { ...document };
        },
        find(query = {}, options = {}) {
          const matches = documents.filter((document) =>
            Object.entries(query).every(([key, value]) => {
              if (key === "$or") {
                return value.some((condition) =>
                  Object.keys(condition).some((field) =>
                    field === "dispatchHistory.0"
                      ? Boolean(document.dispatchHistory?.length)
                      : Boolean(document.events?.some((event) => event.actorId)),
                  ),
                );
              }
              if (key === "dispatchHistory.0") return Boolean(document.dispatchHistory?.length);
              return document[key] === value;
            }),
          );
          let selected = matches.map((document) => {
            if (!options.projection) return { ...document };
            const included = Object.keys(options.projection).filter(
              (key) => options.projection[key] === 1,
            );
            if (included.length === 0) {
              const excluded = Object.keys(options.projection).filter(
                (key) => options.projection[key] === 0,
              );
              return Object.fromEntries(
                Object.entries(document).filter(([key]) => !excluded.includes(key)),
              );
            }
            return Object.fromEntries(included.filter((key) => document[key] !== undefined)
              .map((key) => [key, document[key]]));
          });
          const cursor = {
            sort() { return cursor; },
            limit(size) { selected = selected.slice(0, size); return cursor; },
            async toArray() { return selected; },
          };
          return cursor;
        },
        async countDocuments(query) {
          return documents.filter((document) =>
            Object.entries(query).every(([key, value]) => document[key] === value),
          ).length;
        },
        async updateOne(query, update, options = {}) {
          let document = documents.find((item) =>
            Object.entries(query).every(([key, value]) => item[key] === value),
          );
          if (!document && options.upsert) {
            document = { _id: query._id, ...(update.$setOnInsert || {}) };
            documents.push(document);
          }
          if (document) Object.assign(document, update.$set);
          if (document && update.$unset) {
            for (const key of Object.keys(update.$unset)) delete document[key];
          }
        },
        async insertOne(document) {
          documents.push({ ...document });
        },
      };
    },
  };
  return { database, collections };
}

async function withServer(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function createAdminApp({ role = "admin", id = "admin-1", users } = {}) {
  const { database } = createDatabase(users || [
    { firebaseUid: "admin-1", displayName: "Admin One", email: "one@example.test", role: "admin" },
    { firebaseUid: "admin-2", displayName: "Admin Two", email: "two@example.test", role: "admin" },
    { firebaseUid: "customer-1", displayName: "Customer", email: "customer@example.test", role: "customer" },
  ]);
  return createApp(
    { devAuthMock: false, shipmentRules },
    "connected",
    {
      async getSession() {
        return { id, displayName: "Admin User", role };
      },
    },
    database,
  );
}

test("admin endpoints deny non-admin accounts", async () => {
  const app = createAdminApp({ role: "customer", id: "customer-1" });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/settings`);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ADMIN_ACCESS_REQUIRED");
  });
});

test("admin settings reject invalid coverage, pricing, or operating hours without saving", async () => {
  const app = createAdminApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currency: "USD",
        serviceAreas: ["1000", "1000"],
        services: shipmentRules.services,
        operatingHours: { days: ["mon"], opensAt: "17:00", closesAt: "09:00" },
      }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_ADMIN_SETTINGS");
  });
});

test("role updates are auditable and the final administrator cannot be demoted", async () => {
  const users = [
    { firebaseUid: "admin-1", displayName: "Admin One", email: "one@example.test", role: "admin" },
    { firebaseUid: "customer-1", displayName: "Customer", email: "customer@example.test", role: "customer" },
  ];
  const app = createAdminApp({ users });
  await withServer(app, async (baseUrl) => {
    const deniedDemotion = await fetch(`${baseUrl}/api/admin/users/admin-1/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "customer" }),
    });
    assert.equal(deniedDemotion.status, 409);
    assert.equal((await deniedDemotion.json()).code, "FINAL_ADMIN_PROTECTED");

    const changed = await fetch(`${baseUrl}/api/admin/users/customer-1/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "courier" }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).user.role, "courier");

    const auditResponse = await fetch(`${baseUrl}/api/admin/audit`);
    const audit = await auditResponse.json();
    assert.equal(audit.events.length, 1);
    assert.equal(audit.events[0].type, "user_role_changed");
    assert.equal(audit.events[0].actorId, "admin-1");
  });
});

test("business settings validate and audit the saved booking configuration", async () => {
  const app = createAdminApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currency: "USD",
        serviceAreas: ["1000", "1300"],
        services: [{ ...shipmentRules.services[0], basePrice: 150 }],
        operatingHours: { days: ["mon", "tue"], opensAt: "09:00", closesAt: "17:00" },
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.settings.rules.supportedPostalCodes, ["1000", "1300"]);
    assert.equal(payload.settings.rules.services[0].basePrice, 150);
    assert.equal(payload.settings.operatingHours.closesAt, "17:00");

    const auditResponse = await fetch(`${baseUrl}/api/admin/audit`);
    const audit = await auditResponse.json();
    assert.equal(audit.events[0].type, "business_settings_updated");
  });
});

test("saved service coverage and pricing are used by subsequent bookings", async () => {
  const { database } = createDatabase();
  await database.collection("adminSettings").updateOne(
    { _id: "business" },
    {
      $set: {
        rules: {
          ...shipmentRules,
          supportedPostalCodes: ["2000"],
          services: [{ ...shipmentRules.services[0], basePrice: 175 }],
        },
      },
    },
    { upsert: true },
  );
  const app = createApp(
    { devAuthMock: false, shipmentRules },
    "connected",
    {
      async getSession(request) {
        return request.baseUrl === "/api/customer"
          ? { id: "customer-1", displayName: "Customer", role: "customer" }
          : { id: "admin-1", displayName: "Admin", role: "admin" };
      },
    },
    database,
  );
  await withServer(app, async (baseUrl) => {
    const optionsResponse = await fetch(`${baseUrl}/api/customer/booking-options`);
    const options = await optionsResponse.json();
    const bookingResponse = await fetch(`${baseUrl}/api/customer/shipments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "saved-rules-booking-1",
      },
      body: JSON.stringify({
        pickup: {
          name: "Sender Name",
          phone: "+8801700000001",
          line1: "1 Main Street",
          city: "Dhaka",
          postalCode: "2000",
        },
        recipient: {
          name: "Recipient Name",
          phone: "+8801700000002",
          line1: "2 Main Street",
          city: "Dhaka",
          postalCode: "2000",
        },
        parcel: {
          weightKg: 2,
          dimensionsCm: { length: 10, width: 10, height: 10 },
        },
        contentsDescription: "Books and stationery",
        serviceId: "standard",
        pickupWindowId: "morning",
        deliveryWindowId: "afternoon",
        termsVersion: "v1",
        acceptedTerms: true,
        rulesVersion: options.rulesVersion,
      }),
    });
    assert.equal(bookingResponse.status, 201);
    const payload = await bookingResponse.json();
    assert.equal(payload.shipment.price.base, 175);
    assert.equal(payload.shipment.price.total, 185);
  });
});
