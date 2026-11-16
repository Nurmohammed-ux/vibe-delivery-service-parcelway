import assert from "node:assert/strict";
import test from "node:test";
import { createFirebaseAuthProvider } from "../src/firebase-auth.js";

function createTestDatabase(initialProfiles = []) {
  const profiles = new Map(
    initialProfiles.map((profile) => [profile.firebaseUid, { ...profile }]),
  );
  const indexes = [];
  const collection = {
    async createIndex(fields, options) {
      indexes.push({ fields, options });
    },
    async findOne(query) {
      return profiles.get(query.firebaseUid) || null;
    },
    async updateOne(query, update, options) {
      let profile = profiles.get(query.firebaseUid);
      if (!profile && options.upsert) {
        profile = { ...update.$setOnInsert };
        profiles.set(query.firebaseUid, profile);
      }
      Object.assign(profile, update.$set);
    },
  };

  return {
    database: { collection: () => collection },
    profiles,
    indexes,
  };
}

function createRequest(token) {
  return {
    get(name) {
      return name === "authorization" ? `Bearer ${token}` : undefined;
    },
  };
}

test("profile creation uses verified Firebase identity and assigns customer role", async () => {
  const { database, profiles, indexes } = createTestDatabase();
  const provider = createFirebaseAuthProvider(
    { firebaseProjectId: "test-project" },
    database,
    {
      async verifyIdToken(token, checkRevoked) {
        assert.equal(token, "valid-token");
        assert.equal(checkRevoked, true);
        return {
          uid: "firebase-uid-1",
          email: "CASEY@EXAMPLE.TEST",
        };
      },
    },
  );

  const profile = await provider.createProfile(
    createRequest("valid-token"),
    "Casey Customer",
  );

  assert.deepEqual(profile, {
    id: "firebase-uid-1",
    email: "casey@example.test",
    displayName: "Casey Customer",
    role: "customer",
    homePath: "/app",
  });
  assert.equal(profiles.get("firebase-uid-1").role, "customer");
  assert.deepEqual(indexes, [
    { fields: { firebaseUid: 1 }, options: { unique: true } },
  ]);
});

test("profile sync does not overwrite a trusted existing role", async () => {
  const { database, profiles } = createTestDatabase([
    {
      firebaseUid: "firebase-uid-1",
      email: "casey@example.test",
      displayName: "Casey",
      role: "dispatcher",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ]);
  const provider = createFirebaseAuthProvider(
    { firebaseProjectId: "test-project" },
    database,
    {
      async verifyIdToken() {
        return { uid: "firebase-uid-1", email: "casey@example.test" };
      },
    },
  );

  const profile = await provider.createProfile(
    createRequest("valid-token"),
    "Casey Updated",
  );

  assert.equal(profile.role, "dispatcher");
  assert.equal(profiles.get("firebase-uid-1").displayName, "Casey Updated");
});

test("expired Firebase token is rejected rather than treated as a session", async () => {
  const provider = createFirebaseAuthProvider(
    { firebaseProjectId: "test-project" },
    createTestDatabase().database,
    {
      async verifyIdToken() {
        throw Object.assign(new Error("expired"), {
          code: "auth/id-token-expired",
        });
      },
    },
  );

  await assert.rejects(
    provider.getSession(createRequest("expired-token")),
    { status: 401, code: "SESSION_EXPIRED" },
  );
});

test("Firebase profile endpoints reject requests without a bearer token", async () => {
  let verificationCalled = false;
  const provider = createFirebaseAuthProvider(
    { firebaseProjectId: "test-project" },
    createTestDatabase().database,
    {
      async verifyIdToken() {
        verificationCalled = true;
        return { uid: "firebase-uid-1" };
      },
    },
  );

  await assert.rejects(
    provider.createProfile({ get: () => "" }, "Casey"),
    { status: 401, code: "AUTH_REQUIRED" },
  );
  assert.equal(verificationCalled, false);
});
