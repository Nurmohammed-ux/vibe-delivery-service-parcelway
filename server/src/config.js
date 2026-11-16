import { loadShipmentRules } from "./shipment-rules.js";

export const supportedRoles = [
  "customer",
  "recipient",
  "courier",
  "dispatcher",
  "admin",
];

export function loadConfig(environment = process.env) {
  const nodeEnv = environment.NODE_ENV || "development";
  const port = Number(environment.PORT || 4000);
  const devAuthMock = environment.DEV_AUTH_MOCK === "true";
  const devAuthRole = environment.DEV_AUTH_ROLE || "customer";
  const firebaseProjectId = environment.FIREBASE_PROJECT_ID || "";
  const googleApplicationCredentials =
    environment.GOOGLE_APPLICATION_CREDENTIALS || "";
  const shipmentRules = loadShipmentRules(environment.SHIPMENT_RULES_JSON);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  if (devAuthMock && nodeEnv === "production") {
    throw new Error("DEV_AUTH_MOCK must never be enabled in production.");
  }

  if (!supportedRoles.includes(devAuthRole)) {
    throw new Error(
      `DEV_AUTH_ROLE must be one of: ${supportedRoles.join(", ")}.`,
    );
  }

  return Object.freeze({
    nodeEnv,
    port,
    mongoUri: environment.MONGODB_URI || "",
    devAuthMock,
    devAuthRole,
    firebaseProjectId,
    googleApplicationCredentials,
    shipmentRules,
  });
}
