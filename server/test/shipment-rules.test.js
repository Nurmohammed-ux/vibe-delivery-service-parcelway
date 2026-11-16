import assert from "node:assert/strict";
import test from "node:test";
import { loadShipmentRules } from "../src/shipment-rules.js";

const service = {
  id: "standard",
  name: "Standard",
  description: "Test service",
  basePrice: 100,
  pricePerKg: 25,
  maxWeightKg: 10,
  maxDimensionsCm: { length: 60, width: 50, height: 40 },
  pickupWindows: [{ id: "morning", label: "Morning" }],
  deliveryWindows: [{ id: "afternoon", label: "Afternoon" }],
};

test("shipment rules require complete settings and return only public service fields", () => {
  const parsed = loadShipmentRules(JSON.stringify({
    currency: "BDT",
    termsVersion: "terms-1",
    termsText: "Terms for testing.",
    supportedPostalCodes: [" 1000 "],
    services: [{ ...service, internalNotes: "must not be exposed" }],
  }));

  assert.equal(parsed.currency, "BDT");
  assert.deepEqual(parsed.supportedPostalCodes, ["1000"]);
  assert.equal(parsed.services[0].internalNotes, undefined);
  assert.equal(parsed.services[0].basePrice, 100);
  assert.equal(parsed.services[0].supportedPostalCodes, undefined);
  assert.equal(loadShipmentRules(""), null);
});

test("shipment rules reject malformed JSON, missing setup, and duplicate identifiers", () => {
  assert.throws(() => loadShipmentRules("{"), /must contain valid JSON/);
  assert.throws(() => loadShipmentRules(JSON.stringify({ currency: "BDT" })), /must define/);
  assert.throws(() => loadShipmentRules(JSON.stringify({
    currency: "BDT",
    termsVersion: "terms-1",
    termsText: "Terms.",
    supportedPostalCodes: ["1000"],
    services: [service, { ...service }],
  })), /duplicate or invalid service rule/);
});

test("shipment rules preserve service coverage and require it to be within global coverage", () => {
  const parsed = loadShipmentRules(JSON.stringify({
    currency: "BDT",
    termsVersion: "terms-1",
    termsText: "Terms.",
    supportedPostalCodes: ["1000", "1200"],
    services: [{
      ...service,
      supportedPostalCodes: [" 1000 "],
    }],
  }));

  assert.deepEqual(parsed.services[0].supportedPostalCodes, ["1000"]);
  assert.throws(() => loadShipmentRules(JSON.stringify({
    currency: "BDT",
    termsVersion: "terms-1",
    termsText: "Terms.",
    supportedPostalCodes: ["1000", "1200"],
    services: [{
      ...service,
      supportedPostalCodes: ["9999"],
    }],
  })), /duplicate or invalid service rule/);
});
