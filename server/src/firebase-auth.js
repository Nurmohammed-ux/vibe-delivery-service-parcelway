import { existsSync } from "node:fs";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { isSupportedRole, getRoleHomePath } from "./authorization.js";

const invalidTokenCodes = new Set([
  "auth/argument-error",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/tenant-id-mismatch",
  "auth/user-disabled",
  "auth/user-not-found",
]);

export function createFirebaseAuthProvider(
  config,
  database,
  firebaseAuthClient = null,
) {
  if (
    !firebaseAuthClient &&
    (!config.firebaseProjectId || !config.googleApplicationCredentials)
  ) {
    return null;
  }

  if (!firebaseAuthClient && !existsSync(config.googleApplicationCredentials)) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS must point to a readable Firebase service-account file.",
    );
  }

  let auth = firebaseAuthClient;
  if (!auth) {
    const appName = "parcel-delivery-auth";
    const app =
      getApps().find((existingApp) => existingApp.name === appName) ||
      initializeApp(
        {
          credential: applicationDefault(),
          projectId: config.firebaseProjectId,
        },
        appName,
      );
    auth = getAuth(app);
  }
  let indexPromise;

  async function getUsersCollection() {
    if (!database) {
      throw createAuthError(
        503,
        "PROFILE_STORE_UNAVAILABLE",
        "Account profiles are unavailable because the database is not configured.",
      );
    }

    const collection = database.collection("users");
    if (!indexPromise) {
      indexPromise = collection
        .createIndex({ firebaseUid: 1 }, { unique: true })
        .catch((error) => {
          indexPromise = null;
          throw error;
        });
    }
    await indexPromise;
    return collection;
  }

  async function verifyRequest(request) {
    const authorization = request.get("authorization") || "";
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) {
      throw createAuthError(
        401,
        "AUTH_REQUIRED",
        "Sign in to continue.",
      );
    }

    try {
      return await auth.verifyIdToken(match[1], true);
    } catch (error) {
      if (invalidTokenCodes.has(error.code)) {
        throw createAuthError(
          401,
          "SESSION_EXPIRED",
          "Your session has expired. Sign in again to continue.",
        );
      }
      throw error;
    }
  }

  function toPublicProfile(profile) {
    if (!profile || !isSupportedRole(profile.role)) {
      throw createAuthError(
        503,
        "ACCOUNT_UNAVAILABLE",
        "This account is unavailable. Contact support.",
      );
    }

    return {
      id: profile.firebaseUid,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
      homePath: getRoleHomePath(profile.role),
    };
  }

  return {
    async getSession(request) {
      const decoded = await verifyRequest(request);
      const users = await getUsersCollection();
      const profile = await users.findOne({ firebaseUid: decoded.uid });
      if (!profile) {
        throw createAuthError(
          403,
          "ACCOUNT_PROFILE_MISSING",
          "Your account profile is not available. Try signing in again.",
        );
      }
      return toPublicProfile(profile);
    },

    async createProfile(request, displayName) {
      const decoded = await verifyRequest(request);
      if (typeof decoded.uid !== "string" || !decoded.uid) {
        throw createAuthError(
          401,
          "AUTH_REQUIRED",
          "The identity provider returned an invalid account.",
        );
      }

      const email =
        typeof decoded.email === "string" ? decoded.email.toLowerCase() : "";
      const name =
        displayName ||
        (typeof decoded.name === "string" ? decoded.name.trim() : "") ||
        email.split("@")[0] ||
        "Parcelway customer";
      const users = await getUsersCollection();
      try {
        await users.updateOne(
          { firebaseUid: decoded.uid },
          {
            $set: { email, displayName: name },
            $setOnInsert: {
              firebaseUid: decoded.uid,
              role: "customer",
              createdAt: new Date(),
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if (error.code !== 11000) {
          throw error;
        }
        await users.updateOne(
          { firebaseUid: decoded.uid },
          { $set: { email, displayName: name } },
        );
      }

      const profile = await users.findOne({ firebaseUid: decoded.uid });
      return toPublicProfile(profile);
    },
  };
}

function createAuthError(status, code, message) {
  return Object.assign(new Error(message), {
    status,
    code,
    isPublicAuthError: true,
  });
}
