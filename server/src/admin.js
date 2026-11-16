import { randomUUID } from "node:crypto";
import { Router } from "express";
import { isSupportedRole } from "./authorization.js";
import { supportedRoles } from "./config.js";
import { loadShipmentRules } from "./shipment-rules.js";
import { sendPublicAuthError } from "./public-auth-error.js";

const roles = supportedRoles;
const weekDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function createAdminRouter({
  config,
  database,
  databaseStatus,
  authProvider,
  notificationsConfigured = false,
}) {
  const router = Router();

  router.use(async (request, response, next) => {
    let user;
    if (config.devAuthMock && config.nodeEnv !== "production") {
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
        return;
      }
    } else {
      response.status(503).json({
        error: "Administration requires configured server authentication.",
        code: "AUTH_NOT_CONFIGURED",
      });
      return;
    }

    if (!user || !isSupportedRole(user.role)) {
      response.status(503).json({
        error: "The authentication service returned an unavailable account.",
        code: "ACCOUNT_UNAVAILABLE",
      });
      return;
    }
    if (user.role !== "admin") {
      response.status(403).json({
        error: "Only administrator accounts can manage settings.",
        code: "ADMIN_ACCESS_REQUIRED",
      });
      return;
    }
    if (databaseStatus !== "connected" || !database) {
      response.status(503).json({
        error: "Administration is unavailable because MongoDB is not connected.",
        code: "ADMIN_STORE_UNAVAILABLE",
      });
      return;
    }
    request.adminUser = user;
    next();
  });

  router.get("/settings", async (_request, response) => {
    const stored = await database.collection("adminSettings").findOne({
      _id: "business",
    });
    response.json({
      settings: stored
        ? { rules: stored.rules, operatingHours: stored.operatingHours }
        : {
            rules: config.shipmentRules,
            operatingHours: null,
          },
      source: stored ? "database" : config.shipmentRules ? "environment" : "unconfigured",
      bookingRulesConfigured: Boolean(stored?.rules || config.shipmentRules),
    });
  });

  router.put("/settings", async (request, response) => {
    const current = await database.collection("adminSettings").findOne({
      _id: "business",
    });
    const existingRules = current?.rules || config.shipmentRules;
    if (!existingRules) {
      response.status(503).json({
        error: "Set SHIPMENT_RULES_JSON before editing service coverage and pricing.",
        code: "BOOKING_RULES_NOT_CONFIGURED",
      });
      return;
    }

    const validation = validateSettings(request.body, existingRules);
    if (validation.error) {
      response.status(400).json({
        error: validation.error,
        code: "INVALID_ADMIN_SETTINGS",
      });
      return;
    }

    const timestamp = new Date();
    const settings = {
      rules: validation.rules,
      operatingHours: validation.operatingHours,
      updatedAt: timestamp,
      updatedBy: request.adminUser.id,
    };
    await database.collection("adminSettings").updateOne(
      { _id: "business" },
      { $set: settings },
      { upsert: true },
    );
    await writeAudit(database, {
      type: "business_settings_updated",
      actorId: request.adminUser.id,
      actorName: request.adminUser.displayName,
      timestamp,
      changedFields: ["serviceAreas", "services", "currency", "operatingHours"],
    });
    response.json({
      settings: { rules: settings.rules, operatingHours: settings.operatingHours },
      source: "database",
      bookingRulesConfigured: true,
    });
  });

  router.get("/users", async (_request, response) => {
    const users = await database
      .collection("users")
      .find(
        {},
        {
          projection: {
            _id: 0,
            firebaseUid: 1,
            email: 1,
            displayName: 1,
            role: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ displayName: 1 })
      .limit(200)
      .toArray();
    response.json({
      users: users.map((user) => ({
        id: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      })),
      limit: 200,
    });
  });

  router.patch("/users/:id/role", async (request, response) => {
    const { role } = request.body || {};
    if (!roles.includes(role)) {
      response.status(400).json({
        error: `Choose a supported role: ${roles.join(", ")}.`,
        code: "INVALID_ROLE",
      });
      return;
    }

    const lockToken = await acquireRoleChangeLock(database);
    if (!lockToken) {
      response.status(503).json({
        error: "Another role change is being processed. Retry in a moment.",
        code: "ROLE_CHANGE_BUSY",
      });
      return;
    }
    try {
      const users = database.collection("users");
      const target = await users.findOne({ firebaseUid: request.params.id });
      if (!target) {
        response.status(404).json({
          error: "The account was not found.",
          code: "ACCOUNT_NOT_FOUND",
        });
        return;
      }
      if (
        target.firebaseUid === request.adminUser.id &&
        target.role === "admin" &&
        role !== "admin"
      ) {
        response.status(409).json({
          error: "You cannot remove your own administrator access.",
          code: "FINAL_ADMIN_PROTECTED",
        });
        return;
      }
      if (target.role === "admin" && role !== "admin") {
        const adminCount = await users.countDocuments({ role: "admin" });
        if (adminCount <= 1) {
          response.status(409).json({
            error: "The final administrator account cannot be demoted.",
            code: "FINAL_ADMIN_PROTECTED",
          });
          return;
        }
      }

      await users.updateOne(
        { firebaseUid: target.firebaseUid },
        { $set: { role } },
      );
      const timestamp = new Date();
      await writeAudit(database, {
        type: "user_role_changed",
        actorId: request.adminUser.id,
        actorName: request.adminUser.displayName,
        targetId: target.firebaseUid,
        targetName: target.displayName,
        previousRole: target.role,
        role,
        timestamp,
      });
      response.json({
        user: {
          id: target.firebaseUid,
          displayName: target.displayName,
          email: target.email,
          role,
        },
      });
    } finally {
      await releaseRoleChangeLock(database, lockToken);
    }
  });

  router.get("/audit", async (_request, response) => {
    const [adminEvents, shipments] = await Promise.all([
      database
        .collection("adminAudit")
        .find({}, { projection: { _id: 0 } })
        .sort({ timestamp: -1 })
        .limit(100)
        .toArray(),
      database
        .collection("shipments")
        .find(
          {
            $or: [
              { "dispatchHistory.0": { $exists: true } },
              { "events.actorId": { $exists: true } },
            ],
          },
          {
            projection: {
              _id: 0,
              reference: 1,
              dispatchHistory: 1,
              events: 1,
            },
          },
        )
        .sort({ updatedAt: -1 })
        .limit(100)
        .toArray(),
    ]);
    const operationalEvents = shipments.flatMap((shipment) => [
      ...(shipment.dispatchHistory || []).map((event) => ({
        ...event,
        type: event.action,
        targetId: shipment.reference,
        timestamp: event.timestamp,
      })),
      ...(shipment.events || [])
        .filter((event) => event.actorId)
        .map((event) => ({
          ...event,
          type: event.action || event.status,
          targetId: shipment.reference,
          timestamp: event.timestamp,
        })),
    ]);
    const events = [...adminEvents, ...operationalEvents]
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
      .slice(0, 100);
    response.json({ events, limit: 100 });
  });

  router.get("/integrations", async (_request, response) => {
    const stored = await database.collection("adminSettings").findOne({
      _id: "business",
    });
    response.json({
      database: databaseStatus,
      firebaseAuthentication: authProvider ? "configured" : "not_configured",
      shipmentRules: stored?.rules || config.shipmentRules
        ? "configured"
        : "not_configured",
      notifications: notificationsConfigured ? "configured" : "not_configured",
      valuesExposed: false,
    });
  });

  return router;
}

function validateSettings(body, existingRules) {
  if (
    !body ||
    !Array.isArray(body.serviceAreas) ||
    !Array.isArray(body.services) ||
    typeof body.currency !== "string" ||
    !body.operatingHours ||
    !Array.isArray(body.operatingHours.days) ||
    typeof body.operatingHours.opensAt !== "string" ||
    typeof body.operatingHours.closesAt !== "string"
  ) {
    return { error: "Provide service areas, service levels, currency, and operating hours." };
  }
  const serviceAreas = body.serviceAreas.map((area) =>
    typeof area === "string" ? area.trim().toLowerCase() : "",
  );
  if (
    serviceAreas.length === 0 ||
    serviceAreas.length > 100 ||
    serviceAreas.some((area) => !/^[a-z0-9][a-z0-9 -]{0,23}$/.test(area)) ||
    new Set(serviceAreas).size !== serviceAreas.length
  ) {
    return { error: "Service areas must contain 1–100 unique valid postal codes." };
  }
  const days = body.operatingHours.days;
  if (
    days.length === 0 ||
    days.some((day) => !weekDays.includes(day)) ||
    new Set(days).size !== days.length ||
    !isTime(body.operatingHours.opensAt) ||
    !isTime(body.operatingHours.closesAt) ||
    body.operatingHours.opensAt >= body.operatingHours.closesAt
  ) {
    return { error: "Choose valid operating days and an opening time before closing time." };
  }
  let rules;
  try {
    rules = loadShipmentRules(
      JSON.stringify({
        ...existingRules,
        currency: body.currency.trim().toUpperCase(),
        supportedPostalCodes: serviceAreas,
        services: body.services,
      }),
    );
  } catch {
    return {
      error:
        "Check each service level: names, non-negative prices, parcel limits, dimensions, and unique pickup/delivery windows are required.",
    };
  }
  return {
    error: null,
    rules,
    operatingHours: {
      days: [...days].sort((left, right) => weekDays.indexOf(left) - weekDays.indexOf(right)),
      opensAt: body.operatingHours.opensAt,
      closesAt: body.operatingHours.closesAt,
    },
  };
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

async function acquireRoleChangeLock(database) {
  const control = database.collection("adminControl");
  try {
    await control.updateOne(
      { _id: "role-change-lock" },
      { $setOnInsert: { lockedUntil: new Date(0) } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  const token = randomUUID();
  const now = new Date();
  const lock = await control.findOneAndUpdate(
    {
      _id: "role-change-lock",
      $or: [
        { lockedUntil: { $lte: now } },
        { lockedUntil: { $exists: false } },
      ],
    },
    {
      $set: {
        lockToken: token,
        lockedUntil: new Date(now.getTime() + 15000),
      },
    },
    { returnDocument: "after" },
  );
  const lockDocument = lock?.value || lock;
  return lockDocument?.lockToken === token ? token : null;
}

async function releaseRoleChangeLock(database, token) {
  await database.collection("adminControl").updateOne(
    { _id: "role-change-lock", lockToken: token },
    {
      $set: { lockedUntil: new Date(0) },
      $unset: { lockToken: "" },
    },
  );
}

async function writeAudit(database, event) {
  await database.collection("adminAudit").insertOne(event);
}
