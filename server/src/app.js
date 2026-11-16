import express from "express";
import { getRoleHomePath, isSupportedRole } from "./authorization.js";
import { createCustomerShipmentRouter } from "./customer-shipments.js";
import { createCourierShipmentRouter } from "./courier-shipments.js";
import { createDispatcherOperationsRouter } from "./dispatcher-operations.js";
import { createAdminRouter } from "./admin.js";
import { createStatusNotificationBoundary } from "./notifications.js";
import { createPublicTrackingResult } from "./public-tracking.js";
import { sendPublicAuthError } from "./public-auth-error.js";

export function createApp(
  config,
  databaseStatus = "not_configured",
  authProvider = null,
  database = null,
  notificationProvider = null,
) {
  const app = express();
  app.locals.statusNotifications = createStatusNotificationBoundary({
    provider: notificationProvider,
    environment: config.nodeEnv || "development",
  });
  let publicTrackingIndex = null;
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      api: "available",
      database: databaseStatus,
      firebaseAuthentication: authProvider ? "configured" : "not_configured",
      firebaseProjectIdConfigured: Boolean(config.firebaseProjectId),
      shipmentBookingRulesConfigured: Boolean(config.shipmentRules),
      developmentAuthMock: Boolean(config.devAuthMock),
    });
  });

  app.use(
    "/api/customer",
    createCustomerShipmentRouter({
      config,
      database,
      databaseStatus,
      authProvider,
    }),
  );
  app.use(
    "/api/courier",
    createCourierShipmentRouter({
      config,
      database,
      databaseStatus,
      authProvider,
    }),
  );
  app.use(
    "/api/dispatcher",
    createDispatcherOperationsRouter({
      config,
      database,
      databaseStatus,
      authProvider,
    }),
  );
  app.use(
    "/api/admin",
    createAdminRouter({
      config,
      database,
      databaseStatus,
      authProvider,
      notificationsConfigured: Boolean(notificationProvider),
    }),
  );

  app.get("/api/auth/session", async (request, response) => {
    if (config.devAuthMock) {
      response.json({
        user: {
          id: `development-${config.devAuthRole}`,
          displayName: `Development ${config.devAuthRole}`,
          role: config.devAuthRole,
          homePath: getRoleHomePath(config.devAuthRole),
        },
        authMode: "development-mock",
      });
      return;
    }

    if (authProvider) {
      try {
        const account = await authProvider.getSession(request);
        if (!isValidAccount(account)) {
          response.status(503).json({
            error: "The authentication service returned an unavailable account.",
            code: "ACCOUNT_UNAVAILABLE",
          });
          return;
        }

        response.json({
          user: {
            id: account.id,
            email: account.email,
            displayName: account.displayName,
            role: account.role,
            homePath: getRoleHomePath(account.role),
          },
          authMode: "firebase",
        });
      } catch (error) {
        sendAuthError(error, response, "Authentication session lookup failed");
      }
      return;
    }

    if (!config.devAuthMock) {
      response.json({
        user: null,
        authMode: "not-configured",
      });
      return;
    }

    response.json({
      user: {
        id: `development-${config.devAuthRole}`,
        displayName: `Development ${config.devAuthRole}`,
        role: config.devAuthRole,
        homePath: getRoleHomePath(config.devAuthRole),
      },
      authMode: "development-mock",
    });
  });

  app.post("/api/auth/profile", async (request, response) => {
    if (!authProvider) {
      response.status(503).json({
        error: "Firebase authentication is not configured on the server.",
        code: "AUTH_NOT_CONFIGURED",
      });
      return;
    }

    let displayName;
    if (request.body?.displayName !== undefined) {
      if (
        typeof request.body.displayName !== "string" ||
        request.body.displayName.trim().length === 0 ||
        request.body.displayName.trim().length > 100
      ) {
        response.status(400).json({
          error: "Display name must be between 1 and 100 characters.",
          code: "INVALID_DISPLAY_NAME",
        });
        return;
      }
      displayName = request.body.displayName.trim();
    }

    try {
      const account = await authProvider.createProfile(request, displayName);
      if (!isValidAccount(account)) {
        response.status(503).json({
          error: "The authentication service returned an unavailable account.",
          code: "ACCOUNT_UNAVAILABLE",
        });
        return;
      }
      response.json({
        user: {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          role: account.role,
          homePath: getRoleHomePath(account.role),
        },
        authMode: "firebase",
      });
    } catch (error) {
      sendAuthError(error, response, "Authentication profile creation failed");
    }
  });

  app.post("/api/public/tracking", async (request, response, next) => {
    const trackingCode =
      typeof request.body?.trackingCode === "string"
        ? request.body.trackingCode.trim()
        : "";

    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{5,39}$/.test(trackingCode)) {
      response.status(400).json({
        error: "Enter a valid tracking code using 6–40 letters, numbers, or hyphens.",
        code: "INVALID_TRACKING_CODE",
      });
      return;
    }

    if (databaseStatus !== "connected" || !database) {
      response.status(503).json({
        error: "Public tracking is unavailable because shipment storage is not connected.",
        code: "TRACKING_UNAVAILABLE",
      });
      return;
    }

    try {
      const collection = database.collection("shipments");
      if (!publicTrackingIndex) {
        publicTrackingIndex = collection
          .createIndex({ reference: 1 }, { unique: true })
          .catch((error) => {
            publicTrackingIndex = null;
            throw error;
          });
      }
      await publicTrackingIndex;

      const normalizedCode = trackingCode.toUpperCase();
      const shipment = await collection.findOne(
        { reference: normalizedCode },
        { projection: { _id: 0, reference: 1, status: 1, events: 1 } },
      );
      if (!shipment) {
        response.status(404).json({
          error: "No shipment was found for that tracking reference.",
          code: "SHIPMENT_NOT_FOUND",
        });
        return;
      }

      response.json(createPublicTrackingResult(shipment, normalizedCode));
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "API route not found." });
  });

  app.use((error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error?.type === "entity.parse.failed") {
      response.status(400).json({
        error: "Request body must be valid JSON.",
        code: "INVALID_JSON",
      });
      return;
    }

    if (error?.type === "entity.too.large") {
      response.status(413).json({
        error: "Request body must not exceed 1 MB.",
        code: "PAYLOAD_TOO_LARGE",
      });
      return;
    }

    console.error("Unhandled API error", {
      name: typeof error?.name === "string" ? error.name : "Error",
    });
    response.status(500).json({ error: "An unexpected server error occurred." });
  });

  return app;
}

function isValidAccount(account) {
  return (
    account &&
    typeof account.id === "string" &&
    account.id.trim().length > 0 &&
    typeof account.displayName === "string" &&
    account.displayName.trim().length > 0 &&
    typeof account.email === "string" &&
    isSupportedRole(account.role)
  );
}

function sendAuthError(error, response, logMessage) {
  if (error?.isPublicAuthError !== true) {
    console.error(logMessage, {
      name: typeof error?.name === "string" ? error.name : "Error",
    });
  }

  sendPublicAuthError(response, error);
}
