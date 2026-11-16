import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.js";

async function withServer(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("health endpoint reports API and database configuration", async () => {
  const app = createApp({ devAuthMock: false }, "not_configured");

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      api: "available",
      database: "not_configured",
      firebaseAuthentication: "not_configured",
      firebaseProjectIdConfigured: false,
      shipmentBookingRulesConfigured: false,
      developmentAuthMock: false,
    });
  });
});

test("authentication boundary reports that real authentication is not configured", async () => {
  const app = createApp({ devAuthMock: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      user: null,
      authMode: "not-configured",
    });
  });
});

test("development mock session is clearly marked and uses the configured role", async () => {
  let firebaseSessionCalled = false;
  const app = createApp(
    { devAuthMock: true, devAuthRole: "courier" },
    "not_configured",
    {
      async getSession() {
        firebaseSessionCalled = true;
        throw new Error("Development mock should take precedence.");
      },
    },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      user: {
        id: "development-courier",
        displayName: "Development courier",
        role: "courier",
        homePath: "/courier",
      },
      authMode: "development-mock",
    });
    assert.equal(firebaseSessionCalled, false);
  });
});

test("Firebase session returns only the account profile from the server", async () => {
  const app = createApp(
    { devAuthMock: false },
    "not_configured",
    {
      async getSession(request) {
        assert.equal(request.get("authorization"), "Bearer verified-token");
        return {
          id: "customer-42",
          email: "casey@example.test",
          displayName: "Casey Customer",
          role: "customer",
        };
      },
    },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { authorization: "Bearer verified-token" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      user: {
        id: "customer-42",
        email: "casey@example.test",
        displayName: "Casey Customer",
        role: "customer",
        homePath: "/app",
      },
      authMode: "firebase",
    });
  });
});

test("expired Firebase sessions return an explicit unauthorized response", async () => {
  const app = createApp(
    { devAuthMock: false },
    "not_configured",
    {
      async getSession() {
        throw Object.assign(new Error("Your session has expired."), {
          status: 401,
          code: "SESSION_EXPIRED",
          isPublicAuthError: true,
        });
      },
    },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { authorization: "Bearer expired-token" },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Your session has expired.",
      code: "SESSION_EXPIRED",
    });
  });
});

test("unexpected authentication errors are not returned to clients", async () => {
  const app = createApp(
    { devAuthMock: false },
    "not_configured",
    {
      async getSession() {
        throw new Error("provider details must remain private");
      },
    },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "The authentication or account service is temporarily unavailable.",
      code: "AUTH_UNAVAILABLE",
    });
  });
});

test("malformed JSON receives a client error instead of an internal server error", async () => {
  const app = createApp({ devAuthMock: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/public/tracking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Request body must be valid JSON.",
      code: "INVALID_JSON",
    });
  });
});

test("oversized JSON requests return a payload-too-large response", async () => {
  const app = createApp({ devAuthMock: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/public/tracking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(1024 * 1024) }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: "Request body must not exceed 1 MB.",
      code: "PAYLOAD_TOO_LARGE",
    });
  });
});

test("profile creation delegates verified identity and does not accept a client role", async () => {
  let receivedDisplayName;
  const account = {
    id: "customer-42",
    email: "casey@example.test",
    displayName: "Casey Customer",
    role: "customer",
  };
  const app = createApp(
    { devAuthMock: false },
    "not_configured",
    {
      async createProfile(request, displayName) {
        assert.equal(request.get("authorization"), "Bearer verified-token");
        assert.equal(request.body.role, "admin");
        receivedDisplayName = displayName;
        return account;
      },
    },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: "POST",
      headers: {
        authorization: "Bearer verified-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ displayName: "Casey Customer", role: "admin" }),
    });
    assert.equal(response.status, 200);
    assert.equal(receivedDisplayName, "Casey Customer");
    const payload = await response.json();
    assert.equal(payload.user.role, "customer");
    assert.equal(payload.user.email, "casey@example.test");
  });
});

test("profile provisioning reports Firebase setup as unavailable when missing", async () => {
  const app = createApp({ devAuthMock: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Casey" }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "AUTH_NOT_CONFIGURED");
  });
});

test("profile provisioning rejects invalid display names before provider access", async () => {
  let providerCalled = false;
  const app = createApp(
    { devAuthMock: false },
    "not_configured",
    {
      async createProfile() {
        providerCalled = true;
      },
    },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ displayName: "  " }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_DISPLAY_NAME");
    assert.equal(providerCalled, false);
  });
});

test("public tracking rejects malformed codes", async () => {
  const app = createApp({ devAuthMock: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/public/tracking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingCode: "not valid" }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Enter a valid tracking code using 6–40 letters, numbers, or hyphens.",
      code: "INVALID_TRACKING_CODE",
    });
  });
});

test("public tracking does not claim a result without shipment data", async () => {
  const app = createApp({ devAuthMock: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/public/tracking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingCode: "ABCD-123456" }),
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "Public tracking is unavailable because shipment storage is not connected.",
      code: "TRACKING_UNAVAILABLE",
    });
  });
});
