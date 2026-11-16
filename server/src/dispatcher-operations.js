import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { sendPublicAuthError } from "./public-auth-error.js";

const exceptionCategories = new Set([
  "pickup_failed",
  "delivery_failed",
  "address_issue",
  "delay",
  "damage",
  "return_request",
  "other",
]);
const exceptionActions = new Set([
  "contact_recipient",
  "contact_sender",
  "verify_address",
  "dispatcher_follow_up",
  "inspect_parcel",
  "reschedule_delivery",
  "return_to_depot",
  "approve_return",
]);
const shipmentStatuses = new Set([
  "booked",
  "picked_up",
  "in_transit",
  "delivered",
  "exception",
]);
const activeShipmentStatuses = ["booked", "picked_up", "in_transit", "exception"];
const operationsRoles = new Set(["dispatcher", "admin"]);

export function createDispatcherOperationsRouter({
  config,
  database,
  databaseStatus,
  authProvider,
}) {
  const router = Router();
  const indexes = { current: null };

  router.get("/overview", async (request, response) => {
    const user = await getOperationsUser(request, response, config, authProvider);
    if (!user) return;
    const collection = await getShipmentCollection(
      response,
      database,
      databaseStatus,
      indexes,
    );
    if (!collection) return;

    const shipments = await collection
      .find({}, { projection: shipmentProjection })
      .sort({ createdAt: -1 })
      .toArray();
    const counts = {
      total: shipments.length,
      booked: 0,
      assigned: 0,
      picked_up: 0,
      in_transit: 0,
      exception: 0,
      delivered: 0,
      unassigned: 0,
    };
    for (const shipment of shipments) {
      if (shipmentStatuses.has(shipment.status)) counts[shipment.status] += 1;
      if (
        activeShipmentStatuses.includes(shipment.status) &&
        typeof shipment.courierId === "string" &&
        shipment.courierId
      ) {
        counts.assigned += 1;
      }
      if (shipment.status === "booked" && !shipment.courierId) {
        counts.unassigned += 1;
      }
    }

    const exceptions = shipments
      .filter(hasOpenException)
      .sort(compareExceptionPriority)
      .slice(0, 20)
      .map(toDispatcherShipment);
    response.json({ counts, exceptions });
  });

  router.get("/shipments", async (request, response) => {
    const user = await getOperationsUser(request, response, config, authProvider);
    if (!user) return;
    const filterResult = createShipmentFilter(request.query);
    if (filterResult.error) {
      response.status(400).json(filterResult.error);
      return;
    }
    const collection = await getShipmentCollection(
      response,
      database,
      databaseStatus,
      indexes,
    );
    if (!collection) return;

    const shipments = await collection
      .find(filterResult.filter, { projection: shipmentProjection })
      .sort({ createdAt: -1 })
      .toArray();
    response.json({ shipments: shipments.map(toDispatcherShipment) });
  });

  router.get("/couriers", async (request, response) => {
    const user = await getOperationsUser(request, response, config, authProvider);
    if (!user) return;
    if (!requireDatabase(response, database, databaseStatus)) return;
    if (config.devAuthMock) {
      response.json({
        couriers: [{
          id: "development-courier",
          displayName: "Development courier",
        }],
        capacityRulesConfigured: false,
      });
      return;
    }
    const profiles = await database
      .collection("users")
      .find(
        { role: "courier" },
        { projection: { _id: 0, firebaseUid: 1, displayName: 1 } },
      )
      .sort({ displayName: 1 })
      .toArray();
    response.json({
      couriers: profiles.map(({ firebaseUid, displayName }) => ({
        id: firebaseUid,
        displayName,
      })),
      capacityRulesConfigured: false,
    });
  });

  router.get("/dispatchers", async (request, response) => {
    const user = await getOperationsUser(request, response, config, authProvider);
    if (!user) return;
    if (!requireDatabase(response, database, databaseStatus)) return;
    if (config.devAuthMock) {
      response.json({
        dispatchers: [{
          id: user.id,
          displayName: user.displayName,
        }],
      });
      return;
    }
    const profiles = await database
      .collection("users")
      .find(
        { role: "dispatcher" },
        { projection: { _id: 0, firebaseUid: 1, displayName: 1 } },
      )
      .sort({ displayName: 1 })
      .toArray();
    response.json({
      dispatchers: profiles.map(({ firebaseUid, displayName }) => ({
        id: firebaseUid,
        displayName,
      })),
    });
  });

  router.post("/shipments/:reference/assignment", async (request, response) => {
    const user = await getOperationsUser(request, response, config, authProvider);
    if (!user) return;
    const collection = await getShipmentCollection(
      response,
      database,
      databaseStatus,
      indexes,
    );
    if (!collection) return;

    const body = request.body || {};
    if (
      !hasOwn(body, "courierId") ||
      !hasOwn(body, "expectedCourierId") ||
      !isNullableId(body.courierId) ||
      !isNullableId(body.expectedCourierId)
    ) {
      response.status(400).json({
        error: "Provide a courier ID (or null to unassign) and the currently expected courier ID.",
        code: "INVALID_ASSIGNMENT",
      });
      return;
    }

    const requestInfo = getIdempotencyRequest(request, body);
    if (!requestInfo.key) {
      response.status(400).json({
        error: "A valid action request key is required. Please retry the assignment.",
        code: "INVALID_IDEMPOTENCY_KEY",
      });
      return;
    }

    const shipment = await findDispatcherShipment(collection, request.params.reference);
    if (!shipment) return sendNotFound(response);
    const prior = findPriorAction(shipment, requestInfo);
    if (prior === "mismatch") {
      return sendIdempotencyConflict(response);
    }
    if (prior === "duplicate") {
      response.json({
        shipment: toDispatcherShipment(shipment),
        duplicate: true,
      });
      return;
    }
    if (shipment.status === "delivered") {
      response.status(409).json({
        error: "A delivered shipment cannot be reassigned.",
        code: "DELIVERED_SHIPMENT_ASSIGNMENT",
      });
      return;
    }
    if (!activeShipmentStatuses.includes(shipment.status)) {
      response.status(409).json({
        error: "This shipment status does not allow assignment changes.",
        code: "INVALID_ASSIGNMENT_STATUS",
      });
      return;
    }
    if ((shipment.courierId || null) !== body.expectedCourierId) {
      return sendAssignmentConflict(response);
    }
    if ((shipment.courierId || null) === body.courierId) {
      response.json({ shipment: toDispatcherShipment(shipment), duplicate: true });
      return;
    }

    if (body.courierId) {
      const courier = await findStaffProfile(
        database,
        body.courierId,
        "courier",
        config,
      );
      if (!courier) {
        response.status(400).json({
          error: "Choose an existing courier account.",
          code: "COURIER_NOT_FOUND",
        });
        return;
      }
    }

    const timestamp = new Date();
    const action = body.courierId
      ? shipment.courierId
        ? "courier_reassigned"
        : "courier_assigned"
      : "courier_unassigned";
    const auditEvent = {
      action,
      actorId: user.id,
      previousCourierId: shipment.courierId || null,
      courierId: body.courierId,
      timestamp,
    };
    const result = await collection.updateOne(
      {
        reference: shipment.reference,
        status: { $ne: "delivered" },
        courierId: shipment.courierId || null,
        "dispatchActionKeys.key": { $ne: requestInfo.key },
      },
      {
        $set: { courierId: body.courierId, updatedAt: timestamp },
        $push: {
          dispatchHistory: auditEvent,
          dispatchActionKeys: requestInfo.record,
        },
      },
    );
    if (result.matchedCount === 0) {
      const latest = await findDispatcherShipment(collection, shipment.reference);
      if (latest && findPriorAction(latest, requestInfo) === "duplicate") {
        response.json({ shipment: toDispatcherShipment(latest), duplicate: true });
        return;
      }
      return sendAssignmentConflict(response);
    }

    const updated = await findDispatcherShipment(collection, shipment.reference);
    response.json({ shipment: toDispatcherShipment(updated), duplicate: false });
  });

  router.post("/shipments/:reference/exceptions", async (request, response) => {
    const user = await getOperationsUser(request, response, config, authProvider);
    if (!user) return;
    const collection = await getShipmentCollection(
      response,
      database,
      databaseStatus,
      indexes,
    );
    if (!collection) return;

    const body = request.body || {};
    const requestInfo = getIdempotencyRequest(request, body);
    const validation = validateExceptionCreation(body);
    if (!requestInfo.key) {
      response.status(400).json({
        error: "A valid action request key is required. Please retry the exception update.",
        code: "INVALID_IDEMPOTENCY_KEY",
      });
      return;
    }
    if (validation.error) {
      response.status(400).json(validation.error);
      return;
    }

    const shipment = await findDispatcherShipment(collection, request.params.reference);
    if (!shipment) return sendNotFound(response);
    const prior = findPriorAction(shipment, requestInfo);
    if (prior === "mismatch") return sendIdempotencyConflict(response);
    if (prior === "duplicate") {
      response.json({ shipment: toDispatcherShipment(shipment), duplicate: true });
      return;
    }
    if (shipment.status === "delivered") {
      response.status(409).json({
        error: "A delivered shipment cannot receive a new operational exception.",
        code: "DELIVERED_SHIPMENT_EXCEPTION",
      });
      return;
    }
    if (!activeShipmentStatuses.includes(shipment.status)) {
      response.status(409).json({
        error: "This shipment status does not allow a new operational exception.",
        code: "INVALID_EXCEPTION_SHIPMENT_STATUS",
      });
      return;
    }
    if ((shipment.operationalExceptions || []).some(isOpenException)) {
      response.status(409).json({
        error: "This shipment already has an open operational exception.",
        code: "ACTIVE_EXCEPTION_EXISTS",
      });
      return;
    }

    const ownerId = body.ownerId || user.id;
    const owner = await findStaffProfile(database, ownerId, "dispatcher", config);
    if (!owner) {
      response.status(400).json({
        error: "Choose an existing dispatcher as the exception owner.",
        code: "DISPATCHER_NOT_FOUND",
      });
      return;
    }

    const timestamp = new Date();
    const exception = {
      id: randomUUID(),
      category: body.category,
      notes: body.notes?.trim() || "",
      ownerId,
      nextAction: body.nextAction,
      status: "open",
      resumeStatus: getResumeStatus(shipment),
      createdAt: timestamp,
      createdBy: user.id,
      history: [{
        action: "created",
        actorId: user.id,
        timestamp,
        ownerId,
        nextAction: body.nextAction,
        category: body.category,
      }],
    };
    const auditEvent = {
      action: "exception_created",
      actorId: user.id,
      exceptionId: exception.id,
      category: exception.category,
      timestamp,
    };
    const updates = {
      $set: { status: "exception", updatedAt: timestamp },
      $push: {
        operationalExceptions: exception,
        dispatchHistory: auditEvent,
        dispatchActionKeys: requestInfo.record,
      },
    };
    if (shipment.status !== "exception") {
      updates.$push.events = {
        status: "exception",
        timestamp,
        actorId: user.id,
        action: "dispatcher_exception_created",
        details: { category: body.category, nextAction: body.nextAction },
      };
    }

    const result = await collection.updateOne(
      {
        reference: shipment.reference,
        status: shipment.status,
        "dispatchActionKeys.key": { $ne: requestInfo.key },
      },
      updates,
    );
    if (result.matchedCount === 0) {
      return sendShipmentChanged(response);
    }
    const updated = await findDispatcherShipment(collection, shipment.reference);
    response.status(201).json({
      shipment: toDispatcherShipment(updated),
      duplicate: false,
    });
  });

  router.post(
    "/shipments/:reference/exceptions/:exceptionId/actions",
    async (request, response) => {
      const user = await getOperationsUser(request, response, config, authProvider);
      if (!user) return;
      const collection = await getShipmentCollection(
        response,
        database,
        databaseStatus,
        indexes,
      );
      if (!collection) return;

      const body = request.body || {};
      const requestInfo = getIdempotencyRequest(request, body);
      const validation = validateExceptionUpdate(body);
      if (!requestInfo.key) {
        response.status(400).json({
          error: "A valid action request key is required. Please retry the exception update.",
          code: "INVALID_IDEMPOTENCY_KEY",
        });
        return;
      }
      if (validation.error) {
        response.status(400).json(validation.error);
        return;
      }

      const shipment = await findDispatcherShipment(collection, request.params.reference);
      if (!shipment) return sendNotFound(response);
      const prior = findPriorAction(shipment, requestInfo);
      if (prior === "mismatch") return sendIdempotencyConflict(response);
      if (prior === "duplicate") {
        response.json({ shipment: toDispatcherShipment(shipment), duplicate: true });
        return;
      }
      const exception = (shipment.operationalExceptions || []).find(
        (item) => item.id === request.params.exceptionId,
      );
      if (!exception || exception.status === "resolved") {
        response.status(409).json({
          error: "This operational exception is not open for updates.",
          code: "EXCEPTION_NOT_OPEN",
        });
        return;
      }
      if (shipment.status === "delivered") {
        response.status(409).json({
          error: "A delivered shipment's exception cannot be changed.",
          code: "DELIVERED_SHIPMENT_EXCEPTION",
        });
        return;
      }
      if (
        body.status === "resolved" &&
        (!activeShipmentStatuses.includes(exception.resumeStatus) ||
          shipment.status !== "exception")
      ) {
        response.status(409).json({
          error: "The shipment cannot return to a valid active status from this exception.",
          code: "INVALID_EXCEPTION_TRANSITION",
        });
        return;
      }
      if (
        ["open", "in_progress"].includes(body.status) &&
        exception.status !== "open"
      ) {
        response.status(409).json({
          error: "Only an open exception can be started or remain open.",
          code: "INVALID_EXCEPTION_TRANSITION",
        });
        return;
      }

      const changes = {};
      if (body.ownerId !== undefined) {
        const owner = await findStaffProfile(
          database,
          body.ownerId,
          "dispatcher",
          config,
        );
        if (!owner) {
          response.status(400).json({
            error: "Choose an existing dispatcher as the exception owner.",
            code: "DISPATCHER_NOT_FOUND",
          });
          return;
        }
        changes.ownerId = body.ownerId;
      }
      if (body.nextAction !== undefined) changes.nextAction = body.nextAction;
      if (body.status !== undefined) changes.status = body.status;
      if (body.resolutionNotes !== undefined) {
        changes.resolutionNotes = body.resolutionNotes.trim();
      }

      const timestamp = new Date();
      const historyEvent = {
        action: body.status === "resolved" ? "resolved" : "updated",
        actorId: user.id,
        timestamp,
        changes,
      };
      const update = {
        $set: { updatedAt: timestamp },
        $push: {
          "operationalExceptions.$.history": historyEvent,
          dispatchHistory: {
            action: `exception_${historyEvent.action}`,
            actorId: user.id,
            exceptionId: exception.id,
            changes,
            timestamp,
          },
          dispatchActionKeys: requestInfo.record,
        },
      };
      for (const [field, value] of Object.entries(changes)) {
        update.$set[`operationalExceptions.$.${field}`] = value;
      }
      if (body.status === "resolved") {
        update.$set.status = exception.resumeStatus;
        update.$push.events = {
          status: exception.resumeStatus,
          timestamp,
          actorId: user.id,
          action: "dispatcher_exception_resolved",
          details: { exceptionId: exception.id },
        };
      }

      const result = await collection.updateOne(
        {
          reference: shipment.reference,
          status: shipment.status,
          "operationalExceptions.id": exception.id,
          "operationalExceptions.status": exception.status,
          "dispatchActionKeys.key": { $ne: requestInfo.key },
        },
        update,
      );
      if (result.matchedCount === 0) {
        return sendShipmentChanged(response);
      }
      const updated = await findDispatcherShipment(collection, shipment.reference);
      response.json({
        shipment: toDispatcherShipment(updated),
        duplicate: false,
      });
    },
  );

  return router;
}

const shipmentProjection = {
  _id: 0,
  customerId: 0,
  contentsDescription: 0,
  idempotencyKey: 0,
  payment: 0,
  price: 0,
  courierActionKeys: 0,
  dispatchActionKeys: 0,
  "events.actorId": 0,
};

function createShipmentFilter(query) {
  const filter = {};
  const conditions = [];
  if (typeof query.status === "string" && query.status !== "all") {
    if (!shipmentStatuses.has(query.status)) {
      return { error: invalidFilter("Choose a valid shipment status filter.") };
    }
    filter.status = query.status;
  }
  if (typeof query.serviceId === "string" && query.serviceId.trim()) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(query.serviceId)) {
      return { error: invalidFilter("Choose a valid service filter.") };
    }
    filter["service.id"] = query.serviceId;
  }
  if (typeof query.courierId === "string" && query.courierId.trim()) {
    if (query.courierId.length > 128) {
      return { error: invalidFilter("Choose a valid courier filter.") };
    }
    filter.courierId = query.courierId === "unassigned" ? null : query.courierId;
  }
  if (typeof query.area === "string" && query.area.trim()) {
    if (query.area.trim().length > 100) {
      return { error: invalidFilter("Area search must be 100 characters or fewer.") };
    }
    const pattern = new RegExp(escapeRegExp(query.area.trim()), "i");
    conditions.push({
      $or: [
        { "pickup.city": pattern },
        { "pickup.postalCode": pattern },
        { "recipient.city": pattern },
        { "recipient.postalCode": pattern },
      ],
    });
  }
  if (typeof query.q === "string" && query.q.trim()) {
    if (query.q.trim().length > 100) {
      return { error: invalidFilter("Search must be 100 characters or fewer.") };
    }
    const pattern = new RegExp(escapeRegExp(query.q.trim()), "i");
    conditions.push({
      $or: [
        { reference: pattern },
        { "pickup.name": pattern },
        { "recipient.name": pattern },
      ],
    });
  }
  if (conditions.length) filter.$and = conditions;
  return { filter };
}

function validateExceptionCreation(body) {
  if (!exceptionCategories.has(body.category)) {
    return {
      error: {
        error: "Choose a supported operational exception category.",
        code: "INVALID_EXCEPTION_CATEGORY",
      },
    };
  }
  if (!exceptionActions.has(body.nextAction)) {
    return {
      error: {
        error: "Choose the next operational action.",
        code: "INVALID_EXCEPTION_NEXT_ACTION",
      },
    };
  }
  if (
    body.notes !== undefined &&
    (typeof body.notes !== "string" || body.notes.trim().length > 500)
  ) {
    return {
      error: {
        error: "Exception notes must be 500 characters or fewer.",
        code: "INVALID_EXCEPTION_NOTES",
      },
    };
  }
  if (body.ownerId !== undefined && !isNullableId(body.ownerId)) {
    return {
      error: {
        error: "Choose an existing dispatcher as the exception owner.",
        code: "INVALID_EXCEPTION_OWNER",
      },
    };
  }
  return { error: null };
}

function validateExceptionUpdate(body) {
  const hasChanges = ["ownerId", "nextAction", "status", "resolutionNotes"].some(
    (key) => hasOwn(body, key),
  );
  if (!hasChanges) {
    return {
      error: {
        error: "Choose an exception owner, next action, or workflow status to update.",
        code: "EMPTY_EXCEPTION_UPDATE",
      },
    };
  }
  if (body.ownerId !== undefined && !isNullableId(body.ownerId)) {
    return {
      error: {
        error: "Choose an existing dispatcher as the exception owner.",
        code: "INVALID_EXCEPTION_OWNER",
      },
    };
  }
  if (body.nextAction !== undefined && !exceptionActions.has(body.nextAction)) {
    return {
      error: {
        error: "Choose the next operational action.",
        code: "INVALID_EXCEPTION_NEXT_ACTION",
      },
    };
  }
  if (body.status !== undefined && !["open", "in_progress", "resolved"].includes(body.status)) {
    return {
      error: {
        error: "Choose open, in progress, or resolved for the exception status.",
        code: "INVALID_EXCEPTION_STATUS",
      },
    };
  }
  if (
    body.resolutionNotes !== undefined &&
    (typeof body.resolutionNotes !== "string" ||
      body.resolutionNotes.trim().length < 3 ||
      body.resolutionNotes.trim().length > 500)
  ) {
    return {
      error: {
        error: "Resolution notes must be between 3 and 500 characters.",
        code: "INVALID_RESOLUTION_NOTES",
      },
    };
  }
  if (body.status === "resolved" && body.resolutionNotes === undefined) {
    return {
      error: {
        error: "Add resolution notes before closing this exception.",
        code: "RESOLUTION_NOTES_REQUIRED",
      },
    };
  }
  return { error: null };
}

async function getOperationsUser(request, response, config, authProvider) {
  let user;
  if (config.devAuthMock) {
    user = {
      id: `development-${config.devAuthRole}`,
      displayName: `Development ${config.devAuthRole}`,
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
      error: "Operations require configured server authentication.",
      code: "AUTH_NOT_CONFIGURED",
    });
    return null;
  }

  if (!user || typeof user.id !== "string" || !user.id.trim()) {
    response.status(503).json({
      error: "The authentication service returned an unavailable dispatcher account.",
      code: "ACCOUNT_UNAVAILABLE",
    });
    return null;
  }
  if (!operationsRoles.has(user.role)) {
    response.status(403).json({
      error: "Only dispatcher or admin accounts can manage shipment operations.",
      code: "OPERATIONS_ACCESS_REQUIRED",
    });
    return null;
  }
  return user;
}

async function getShipmentCollection(response, database, databaseStatus, indexes) {
  if (!requireDatabase(response, database, databaseStatus)) return null;
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

function requireDatabase(response, database, databaseStatus) {
  if (databaseStatus === "connected" && database) return true;
  response.status(503).json({
    error: "Dispatcher shipment storage is unavailable because MongoDB is not connected.",
    code: "SHIPMENT_STORE_UNAVAILABLE",
  });
  return false;
}

async function findDispatcherShipment(collection, reference) {
  return collection.findOne(
    { reference },
    { projection: { _id: 0 } },
  );
}

async function findStaffProfile(database, id, role, config) {
  if (config.devAuthMock && id === `development-${role}`) {
    return { firebaseUid: id, displayName: `Development ${role}` };
  }
  if (!database) return null;
  return database.collection("users").findOne(
    { firebaseUid: id, role },
    { projection: { _id: 0, firebaseUid: 1, displayName: 1 } },
  );
}

function getIdempotencyRequest(request, body) {
  const key = request.get("Idempotency-Key") || "";
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) return { key: null };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  return {
    key,
    fingerprint,
    record: { key, fingerprint },
  };
}

function findPriorAction(shipment, requestInfo) {
  const prior = (shipment.dispatchActionKeys || []).find(
    (record) => record.key === requestInfo.key,
  );
  if (!prior) return null;
  return prior.fingerprint === requestInfo.fingerprint ? "duplicate" : "mismatch";
}

function hasOpenException(shipment) {
  return (
    shipment.status === "exception" ||
    (shipment.operationalExceptions || []).some(isOpenException)
  );
}

function isOpenException(exception) {
  return exception.status !== "resolved";
}

function compareExceptionPriority(left, right) {
  return exceptionPriority(left) - exceptionPriority(right) ||
    new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
}

function exceptionPriority(shipment) {
  const active = (shipment.operationalExceptions || []).find(isOpenException);
  const category = active?.category || latestExceptionEvent(shipment)?.details?.reason;
  if (["damage", "address_issue"].includes(category)) return 0;
  if (["pickup_failed", "delivery_failed", "recipient_unavailable"].includes(category)) return 1;
  if (["delay", "return_request"].includes(category)) return 2;
  return 3;
}

function latestExceptionEvent(shipment) {
  return [...(shipment.events || [])]
    .reverse()
    .find((event) => event.status === "exception");
}

function getResumeStatus(shipment) {
  if (shipment.status !== "exception") return shipment.status;
  const priorEvent = [...(shipment.events || [])]
    .reverse()
    .find((event) => ["in_transit", "picked_up", "booked"].includes(event.status));
  return priorEvent?.status || "booked";
}

function toDispatcherShipment(shipment) {
  if (!shipment) return shipment;
  const result = { ...shipment };
  for (const field of [
    "_id",
    "customerId",
    "contentsDescription",
    "idempotencyKey",
    "payment",
    "price",
    "courierActionKeys",
    "dispatchActionKeys",
  ]) {
    delete result[field];
  }
  return result;
}

function sendNotFound(response) {
  response.status(404).json({
    error: "Shipment not found.",
    code: "SHIPMENT_NOT_FOUND",
  });
}

function sendAssignmentConflict(response) {
  response.status(409).json({
    error: "The assignment changed. Refresh the shipment before trying again.",
    code: "ASSIGNMENT_CHANGED",
  });
}

function sendShipmentChanged(response) {
  response.status(409).json({
    error: "The shipment changed before this update was recorded. Refresh and try again.",
    code: "SHIPMENT_STATE_CHANGED",
  });
}

function sendIdempotencyConflict(response) {
  response.status(409).json({
    error: "This action request key was already used for a different action.",
    code: "IDEMPOTENCY_KEY_REUSED",
  });
}

function invalidFilter(message) {
  return { error: message, code: "INVALID_SHIPMENT_FILTER" };
}

function isNullableId(value) {
  return value === null ||
    (typeof value === "string" && value.trim().length > 0 && value.length <= 128);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
