import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { sendPublicAuthError } from "./public-auth-error.js";

const customerShipmentProjection = {
  _id: 0,
  customerId: 0,
  courierId: 0,
  idempotencyKey: 0,
  courierActionKeys: 0,
  dispatchActionKeys: 0,
  dispatchHistory: 0,
  operationalExceptions: 0,
  "events.actorId": 0,
  "events.details": 0,
  "events.idempotencyKey": 0,
  "events.proof": 0,
};

export function createCustomerShipmentRouter({
  config,
  database,
  databaseStatus,
  authProvider,
}) {
  const router = Router();
  const indexes = { current: null };

  router.get("/booking-options", async (request, response) => {
    const user = await getCustomer(request, response, config, authProvider);
    if (!user) return;
    if (!requireDatabase(response, database, databaseStatus)) return;
    const shipmentRules = await getEffectiveShipmentRules(database, config);
    if (!shipmentRules) {
      response.status(503).json({
        error: "Booking is unavailable until service rules, prices, coverage, and terms are configured.",
        code: "BOOKING_NOT_CONFIGURED",
      });
      return;
    }

    response.json({
      currency: shipmentRules.currency,
      termsVersion: shipmentRules.termsVersion,
      termsText: shipmentRules.termsText,
      rulesVersion: getRulesVersion(shipmentRules),
      supportedPostalCodes: shipmentRules.supportedPostalCodes,
      services: shipmentRules.services,
    });
  });

  router.get("/shipments", async (request, response) => {
    const user = await getCustomer(request, response, config, authProvider);
    if (!user) return;
    const collection = await getCollection(response, database, databaseStatus, indexes);
    if (!collection) return;

    const filter = { customerId: user.id };
    if (typeof request.query.status === "string" && request.query.status !== "all") {
      if (!/^[a-z_]{1,30}$/.test(request.query.status)) {
        response.status(400).json({
          error: "Choose a valid shipment status filter.",
          code: "INVALID_STATUS_FILTER",
        });
        return;
      }
      filter.status = request.query.status;
    }

    const shipments = await collection
      .find(filter, { projection: customerShipmentProjection })
      .sort({ createdAt: -1 })
      .toArray()
      .then((items) => items.map(toCustomerShipment));
    response.json({ shipments });
  });

  router.post("/shipments", async (request, response) => {
    const user = await getCustomer(request, response, config, authProvider);
    if (!user) return;
    const collection = await getCollection(response, database, databaseStatus, indexes);
    if (!collection) return;
    const shipmentRules = await getEffectiveShipmentRules(database, config);
    if (!shipmentRules) {
      response.status(503).json({
        error: "Booking is unavailable until service rules, prices, coverage, and terms are configured.",
        code: "BOOKING_NOT_CONFIGURED",
      });
      return;
    }
    const idempotencyKey = request.get("Idempotency-Key") || "";
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(idempotencyKey)) {
      response.status(400).json({
        error: "A valid booking request key is required. Please retry the booking.",
        code: "INVALID_IDEMPOTENCY_KEY",
      });
      return;
    }

    const existing = await collection.findOne(
      { customerId: user.id, idempotencyKey },
      { projection: customerShipmentProjection },
    );
    if (existing) {
      response.status(200).json({
        shipment: toCustomerShipment(existing),
        duplicate: true,
      });
      return;
    }

    if (request.body?.rulesVersion !== getRulesVersion(shipmentRules)) {
      response.status(409).json({
        error: "Booking rules changed. Reload the current price and terms before confirming.",
        code: "BOOKING_RULES_CHANGED",
      });
      return;
    }

    const validation = validateBooking(request.body, shipmentRules);
    if (validation.error) {
      response.status(400).json(validation);
      return;
    }

    const {
      pickup,
      recipient,
      parcel,
      service,
      pickupWindow,
      deliveryWindow,
    } = validation.booking;
    const basePrice = service.basePrice;
    const weightPrice = Math.round(parcel.weightKg * service.pricePerKg);
    const totalPrice = basePrice + weightPrice;
    const now = new Date();
    const shipment = {
      reference: `PW-${randomBytes(12).toString("hex").toUpperCase()}`,
      customerId: user.id,
      status: "booked",
      createdAt: now,
      pickup,
      recipient,
      parcel,
      service: { id: service.id, name: service.name },
      pickupWindow,
      deliveryWindow,
      contentsDescription: validation.booking.contentsDescription,
      price: {
        currency: shipmentRules.currency,
        base: basePrice,
        weight: weightPrice,
        total: totalPrice,
      },
      payment: {
        status: "demo_not_charged",
        provider: null,
      },
      termsVersion: shipmentRules.termsVersion,
      termsAcceptedAt: now,
      events: [{ status: "booked", timestamp: now }],
      idempotencyKey,
    };

    try {
      await collection.insertOne(shipment);
    } catch (error) {
      if (error.code !== 11000) throw error;
      const duplicate = await collection.findOne(
        { customerId: user.id, idempotencyKey },
        { projection: customerShipmentProjection },
      );
      if (!duplicate) throw error;
      response.status(200).json({
        shipment: toCustomerShipment(duplicate),
        duplicate: true,
      });
      return;
    }

    response.status(201).json({
      shipment: toCustomerShipment(shipment),
      duplicate: false,
    });
  });

  router.get("/shipments/:reference", async (request, response) => {
    const user = await getCustomer(request, response, config, authProvider);
    if (!user) return;
    const collection = await getCollection(response, database, databaseStatus, indexes);
    if (!collection) return;

    const shipment = await collection.findOne(
      { reference: request.params.reference, customerId: user.id },
      { projection: customerShipmentProjection },
    );
    if (!shipment) {
      response.status(404).json({
        error: "Shipment not found.",
        code: "SHIPMENT_NOT_FOUND",
      });
      return;
    }
    response.json({ shipment: toCustomerShipment(shipment) });
  });

  return router;
}

function toCustomerShipment(shipment) {
  const result = { ...shipment };
  for (const field of [
    "_id",
    "customerId",
    "courierId",
    "idempotencyKey",
    "courierActionKeys",
    "dispatchActionKeys",
    "dispatchHistory",
    "operationalExceptions",
  ]) {
    delete result[field];
  }
  result.events = (Array.isArray(shipment.events) ? shipment.events : []).map(
    (event) => ({ status: event.status, timestamp: event.timestamp }),
  );
  return result;
}

async function getCustomer(request, response, config, authProvider) {
  let user;
  if (config.devAuthMock) {
    user = {
      id: `development-${config.devAuthRole}`,
      role: config.devAuthRole,
    };
  } else if (authProvider) {
    try {
      user = await authProvider.getSession(request);
    } catch (error) {
      sendPublicAuthError(response, error);
      return null;
    }
  } else {
    response.status(503).json({
      error: "Customer booking requires configured server authentication.",
      code: "AUTH_NOT_CONFIGURED",
    });
    return null;
  }

  if (!user || typeof user.id !== "string" || !user.id.trim()) {
    response.status(503).json({
      error: "The authentication service returned an unavailable customer account.",
      code: "ACCOUNT_UNAVAILABLE",
    });
    return null;
  }
  if (user.role !== "customer") {
    response.status(403).json({
      error: "Only customer accounts can manage customer shipments.",
      code: "CUSTOMER_ACCESS_REQUIRED",
    });
    return null;
  }
  return user;
}

function requireDatabase(response, database, databaseStatus) {
  if (databaseStatus === "connected" && database) return true;
  response.status(503).json({
    error: "Customer shipment storage is unavailable because MongoDB is not connected.",
    code: "SHIPMENT_STORE_UNAVAILABLE",
  });
  return false;
}

async function getCollection(response, database, databaseStatus, indexes) {
  if (!requireDatabase(response, database, databaseStatus)) return null;

  if (!indexes.current) {
    indexes.current = database
      .collection("shipments")
      .createIndex({ customerId: 1, idempotencyKey: 1 }, { unique: true })
      .then(() =>
        database.collection("shipments").createIndex(
          { reference: 1 },
          { unique: true },
        ),
      )
      .catch((error) => {
        indexes.current = null;
        throw error;
      });
  }
  await indexes.current;
  return database.collection("shipments");
}

function validateBooking(body, rules) {
  const errors = {};
  const pickup = validateAddress(body?.pickup, "Pickup", errors);
  const recipient = validateAddress(body?.recipient, "Recipient", errors);
  const service = rules.services.find((item) => item.id === body?.serviceId);
  const supportedPostalCodes =
    service?.supportedPostalCodes || rules.supportedPostalCodes;

  if (
    pickup &&
    !supportedPostalCodes.includes(pickup.postalCode.toLowerCase())
  ) {
    errors.pickupPostalCode =
      "Pickup postal code is outside the configured service area for this service.";
  }
  if (
    recipient &&
    !supportedPostalCodes.includes(recipient.postalCode.toLowerCase())
  ) {
    errors.recipientPostalCode =
      "Recipient postal code is outside the configured service area for this service.";
  }

  const parcelInput = body?.parcel;
  const weightKg = parcelInput?.weightKg;
  const dimensions = parcelInput?.dimensionsCm;
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    errors.weightKg = "Enter a parcel weight greater than zero.";
  }
  for (const dimension of ["length", "width", "height"]) {
    if (!Number.isFinite(dimensions?.[dimension]) || dimensions[dimension] <= 0) {
      errors[dimension] = `Enter a ${dimension} greater than zero.`;
    }
  }

  const contentsDescription =
    typeof body?.contentsDescription === "string"
      ? body.contentsDescription.trim()
      : "";
  if (contentsDescription.length < 3 || contentsDescription.length > 300) {
    errors.contentsDescription =
      "Describe the parcel contents in 3–300 characters.";
  }

  if (!service) errors.serviceId = "Choose an available service.";

  const pickupWindow = service?.pickupWindows.find(
    (window) => window.id === body?.pickupWindowId,
  );
  if (!pickupWindow) errors.pickupWindowId = "Choose a pickup window.";

  const deliveryWindow = service?.deliveryWindows.find(
    (window) => window.id === body?.deliveryWindowId,
  );
  if (!deliveryWindow) errors.deliveryWindowId = "Choose a delivery window.";

  if (body?.termsVersion !== rules.termsVersion) {
    errors.termsVersion = "Review and accept the current booking terms.";
  }
  if (body?.acceptedTerms !== true) {
    errors.acceptedTerms = "Accept the current booking terms before confirming.";
  }

  if (service && Number.isFinite(weightKg)) {
    if (weightKg > service.maxWeightKg) {
      errors.weightKg = `This service supports parcels up to ${service.maxWeightKg} kg.`;
    }
    for (const dimension of ["length", "width", "height"]) {
      if (
        Number.isFinite(dimensions?.[dimension]) &&
        dimensions[dimension] > service.maxDimensionsCm[dimension]
      ) {
        errors[dimension] =
          `Maximum ${dimension} is ${service.maxDimensionsCm[dimension]} cm.`;
      }
    }
  }

  if (Object.keys(errors).length) {
    return {
      error: "Check the highlighted booking details and try again.",
      code: "INVALID_BOOKING",
      fields: errors,
    };
  }

  return {
    booking: {
      pickup,
      recipient,
      parcel: {
        weightKg,
        dimensionsCm: {
          length: dimensions.length,
          width: dimensions.width,
          height: dimensions.height,
        },
      },
      contentsDescription,
      service,
      pickupWindow,
      deliveryWindow,
    },
  };
}

function validateAddress(address, label, errors) {
  if (!address || typeof address !== "object") {
    errors[label.toLowerCase()] = `Enter the ${label.toLowerCase()} address details.`;
    return null;
  }

  const fields = ["name", "phone", "line1", "city", "postalCode"];
  const normalized = {};
  for (const field of fields) {
    const value = typeof address[field] === "string" ? address[field].trim() : "";
    if (!value || value.length > (field === "line1" ? 200 : 100)) {
      errors[`${label.toLowerCase()}${capitalize(field)}`] =
        `${label} ${field} is required and must be within the allowed length.`;
    }
    normalized[field] = value;
  }
  if (
    normalized.phone &&
    (!/^[+()\d .-]{7,24}$/.test(normalized.phone) ||
      (normalized.phone.match(/\d/g) || []).length < 7 ||
      (normalized.phone.match(/\d/g) || []).length > 15)
  ) {
    errors[`${label.toLowerCase()}Phone`] =
      `Enter a valid ${label.toLowerCase()} phone number.`;
  }
  return normalized;
}

async function getEffectiveShipmentRules(database, config) {
  const saved = await database.collection("adminSettings").findOne(
    { _id: "business" },
    { projection: { _id: 0, rules: 1 } },
  );
  return saved?.rules || config.shipmentRules;
}

function getRulesVersion(rules) {
  return createHash("sha256")
    .update(JSON.stringify(rules))
    .digest("hex");
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}
