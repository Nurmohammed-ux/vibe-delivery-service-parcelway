import { createHash } from "node:crypto";
import { Router } from "express";
import { sendPublicAuthError } from "./public-auth-error.js";

const failedAttemptReasons = new Set([
  "recipient_unavailable",
  "address_issue",
  "access_issue",
  "other",
]);
const nextActions = new Set([
  "contact_recipient",
  "dispatcher_follow_up",
  "return_to_depot",
]);
export function createCourierShipmentRouter({
  config,
  database,
  databaseStatus,
  authProvider,
}) {
  const router = Router();
  const indexes = { current: null };

  router.get("/shipments", async (request, response) => {
    const user = await getCourier(request, response, config, authProvider);
    if (!user) return;
    const collection = await getCollection(response, database, databaseStatus, indexes);
    if (!collection) return;

    const shipments = await collection
      .find({ courierId: user.id }, {
        projection: {
          _id: 0,
          customerId: 0,
          courierId: 0,
          contentsDescription: 0,
          idempotencyKey: 0,
          payment: 0,
          price: 0,
          courierActionKeys: 0,
          dispatchActionKeys: 0,
          dispatchHistory: 0,
          operationalExceptions: 0,
          "events.actorId": 0,
          "events.idempotencyKey": 0,
        },
      })
      .sort({ createdAt: 1 })
      .toArray();
    response.json({ shipments });
  });

  router.post("/shipments/:reference/actions", async (request, response) => {
    const user = await getCourier(request, response, config, authProvider);
    if (!user) return;
    const collection = await getCollection(response, database, databaseStatus, indexes);
    if (!collection) return;

    const idempotencyKey = request.get("Idempotency-Key") || "";
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(idempotencyKey)) {
      response.status(400).json({
        error: "A valid action request key is required. Please retry the action.",
        code: "INVALID_IDEMPOTENCY_KEY",
      });
      return;
    }

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const shipment = await collection.findOne(
      { reference: request.params.reference, courierId: user.id },
      { projection: { _id: 0, courierActionKeys: 1 } },
    );
    if (!shipment) {
      response.status(404).json({
        error: "Assigned shipment not found.",
        code: "SHIPMENT_NOT_FOUND",
      });
      return;
    }

    const previousAction = (shipment.courierActionKeys || []).find(
      (record) => record.key === idempotencyKey,
    );
    if (previousAction) {
      if (previousAction.fingerprint !== fingerprint) {
        response.status(409).json({
          error: "This action request key was already used for a different action.",
          code: "IDEMPOTENCY_KEY_REUSED",
        });
        return;
      }
      const current = await findAssignedShipment(collection, request.params.reference, user.id);
      response.json({ shipment: omitCourierInternals(current), duplicate: true });
      return;
    }

    const current = await findAssignedShipment(collection, request.params.reference, user.id);
    const transition = validateCourierAction(current, body);
    if (transition.error) {
      response.status(transition.status).json({
        error: transition.error,
        code: transition.code,
      });
      return;
    }

    const timestamp = new Date();
    const event = {
      status: transition.eventStatus,
      timestamp,
      actorId: user.id,
      action: body.action,
      source: "manual",
      ...(transition.details ? { details: transition.details } : {}),
    };
    const result = await collection.updateOne(
      {
        reference: current.reference,
        courierId: user.id,
        status: current.status,
        courierActionKeys: { $not: { $elemMatch: { key: idempotencyKey } } },
      },
      {
        $set: { status: transition.status, updatedAt: timestamp },
        $push: { events: event },
        $addToSet: {
          courierActionKeys: { key: idempotencyKey, fingerprint },
        },
      },
    );

    if (result.matchedCount === 0) {
      const latest = await findAssignedShipment(collection, current.reference, user.id);
      const recorded = (latest?.courierActionKeys || []).find(
        (record) => record.key === idempotencyKey,
      );
      if (recorded?.fingerprint === fingerprint) {
        response.json({ shipment: omitCourierInternals(latest), duplicate: true });
        return;
      }
      response.status(409).json({
        error: "The shipment changed before this action was recorded. Refresh and try again.",
        code: "SHIPMENT_STATE_CHANGED",
      });
      return;
    }

    const updated = await findAssignedShipment(collection, current.reference, user.id);
    response.json({ shipment: omitCourierInternals(updated), duplicate: false });
  });

  return router;
}

export function validateCourierAction(shipment, body) {
  if (!shipment || !body || typeof body.action !== "string") {
    return invalidAction();
  }

  if (body.action === "arrived") {
    if (shipment.status === "booked") {
      return { status: "booked", eventStatus: "arrived_for_pickup" };
    }
    if (shipment.status === "in_transit") {
      return { status: shipment.status, eventStatus: "arrived_for_delivery" };
    }
    return invalidTransition();
  }

  if (body.action === "picked_up") {
    if (shipment.status !== "booked") return invalidTransition();
    return { status: "picked_up", eventStatus: "picked_up" };
  }

  if (body.action === "in_transit") {
    if (shipment.status !== "picked_up") return invalidTransition();
    return { status: "in_transit", eventStatus: "in_transit" };
  }

  if (body.action === "delivery_attempted") {
    if (shipment.status !== "in_transit") {
      return invalidTransition();
    }
    if (!failedAttemptReasons.has(body.reason)) {
      return {
        status: 400,
        error: "Choose a reason for the failed delivery attempt.",
        code: "DELIVERY_REASON_REQUIRED",
      };
    }
    if (!nextActions.has(body.nextAction)) {
      return {
        status: 400,
        error: "Choose the next operational action for this exception.",
        code: "NEXT_ACTION_REQUIRED",
      };
    }
    if (
      body.notes !== undefined &&
      (typeof body.notes !== "string" || body.notes.trim().length > 500)
    ) {
      return {
        status: 400,
        error: "Notes must be 500 characters or fewer.",
        code: "INVALID_EXCEPTION_NOTES",
      };
    }
    return {
      status: "exception",
      eventStatus: "exception",
      details: {
        reason: body.reason,
        nextAction: body.nextAction,
        ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
      },
    };
  }

  if (body.action === "delivered") {
    if (shipment.status !== "in_transit") {
      return invalidTransition();
    }
    const recipientName =
      typeof body.recipientName === "string" ? body.recipientName.trim() : "";
    if (body.confirmed !== true || !recipientName || recipientName.length > 100) {
      return {
        status: 400,
        error: "Confirm handoff and enter the recipient's name before marking delivered.",
        code: "PROOF_OF_DELIVERY_REQUIRED",
      };
    }
    return {
      status: "delivered",
      eventStatus: "delivered",
      details: { recipientName, confirmation: "recipient_handoff" },
    };
  }

  return invalidAction();
}

async function getCourier(request, response, config, authProvider) {
  let user;
  if (config.devAuthMock) {
    user = { id: `development-${config.devAuthRole}`, role: config.devAuthRole };
  } else if (authProvider) {
    try {
      user = await authProvider.getSession(request);
    } catch (error) {
      sendPublicAuthError(response, error);
      return null;
    }
  } else {
    response.status(503).json({
      error: "Courier actions require configured server authentication.",
      code: "AUTH_NOT_CONFIGURED",
    });
    return null;
  }

  if (!user || typeof user.id !== "string" || !user.id.trim()) {
    response.status(503).json({
      error: "The authentication service returned an unavailable courier account.",
      code: "ACCOUNT_UNAVAILABLE",
    });
    return null;
  }
  if (user.role !== "courier") {
    response.status(403).json({
      error: "Only courier accounts can access assigned courier shipments.",
      code: "COURIER_ACCESS_REQUIRED",
    });
    return null;
  }
  return user;
}

async function getCollection(response, database, databaseStatus, indexes) {
  if (databaseStatus !== "connected" || !database) {
    response.status(503).json({
      error: "Courier shipment storage is unavailable because MongoDB is not connected.",
      code: "SHIPMENT_STORE_UNAVAILABLE",
    });
    return null;
  }
  if (!indexes.current) {
    indexes.current = database
      .collection("shipments")
      .createIndex({ courierId: 1, status: 1, createdAt: 1 })
      .catch((error) => {
        indexes.current = null;
        throw error;
      });
  }
  await indexes.current;
  return database.collection("shipments");
}

async function findAssignedShipment(collection, reference, courierId) {
  return collection.findOne(
    { reference, courierId },
    { projection: { _id: 0 } },
  );
}

function omitCourierInternals(shipment) {
  if (!shipment) return shipment;
  const result = { ...shipment };
  for (const field of [
    "_id",
    "customerId",
    "courierId",
    "contentsDescription",
    "idempotencyKey",
    "payment",
    "price",
    "courierActionKeys",
    "dispatchActionKeys",
    "dispatchHistory",
    "operationalExceptions",
  ]) {
    delete result[field];
  }
  return {
    ...result,
    events: (Array.isArray(shipment.events) ? shipment.events : []).map((event) => {
      const visibleEvent = { ...event };
      delete visibleEvent.actorId;
      delete visibleEvent.idempotencyKey;
      return visibleEvent;
    }),
  };
}

function invalidAction() {
  return {
    status: 400,
    error: "Choose a supported courier action.",
    code: "INVALID_COURIER_ACTION",
  };
}

function invalidTransition() {
  return {
    status: 409,
    error: "This action is not valid for the shipment's current status.",
    code: "INVALID_SHIPMENT_TRANSITION",
  };
}
