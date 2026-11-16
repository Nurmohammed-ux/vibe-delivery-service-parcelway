import assert from "node:assert/strict";
import test from "node:test";
import { canAccessShipment, canAssignCourier } from "../src/authorization.js";

const shipment = {
  customerId: "customer-1",
  recipientId: "recipient-1",
  courierId: "courier-1",
};

test("customers and recipients can access only their own shipment", () => {
  assert.equal(
    canAccessShipment({ id: "customer-1", role: "customer" }, shipment),
    true,
  );
  assert.equal(
    canAccessShipment({ id: "customer-2", role: "customer" }, shipment),
    false,
  );
  assert.equal(
    canAccessShipment({ id: "recipient-1", role: "recipient" }, shipment),
    true,
  );
  assert.equal(
    canAccessShipment({ id: "recipient-2", role: "recipient" }, shipment),
    false,
  );
});

test("couriers can access assigned shipments only", () => {
  assert.equal(
    canAccessShipment({ id: "courier-1", role: "courier" }, shipment),
    true,
  );
  assert.equal(
    canAccessShipment({ id: "courier-2", role: "courier" }, shipment),
    false,
  );
});

test("operations access is explicit and admin is not a shipment bypass", () => {
  assert.equal(
    canAccessShipment({ id: "dispatcher-1", role: "dispatcher" }, shipment),
    true,
  );
  assert.equal(
    canAccessShipment({ id: "admin-1", role: "admin" }, shipment),
    false,
  );
  assert.equal(canAssignCourier({ role: "dispatcher" }), true);
  assert.equal(canAssignCourier({ role: "admin" }), false);
  assert.equal(canAccessShipment(null, shipment), false);
});
