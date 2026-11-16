# Release readiness checklist

**Status: not ready for production release.** This review inspects repository configuration only. It does not deploy the application, connect to MongoDB, or change production data.

## Verified in the repository

- The project requires Node.js 22 or newer and provides `npm run check` for a Vite production build and client/server tests ([`package.json`](./package.json)).
- `.env.example` documents the current environment variables. `.env` and other `.env.*` files are ignored by Git, except `.env.example` ([`.gitignore`](./.gitignore)).
- The server can be started with `npm run start --workspace @parcel/server`. It binds to `127.0.0.1`; the Vite host and `/api` proxy are development-only ([`server/package.json`](./server/package.json), [`server/src/server.js`](./server/src/server.js), [`client/vite.config.js`](./client/vite.config.js)).
- MongoDB indexes are created by application routes/auth code when first used. There is no central migration runner or release migration command ([`server/src/database.js`](./server/src/database.js)).
- `/api/health` reports API, database, Firebase, and booking-rule configuration. It is not a full readiness check: it can return HTTP 200 while dependencies or booking rules are unavailable ([`server/src/app.js`](./server/src/app.js)).
- The current booking flow records payment as `demo_not_charged`; the server is not wired to a payment provider. The notification boundary supports provider injection, but the normal server startup supplies no provider ([`server/src/customer-shipments.js`](./server/src/customer-shipments.js), [`server/src/notifications.js`](./server/src/notifications.js), [`server/src/server.js`](./server/src/server.js)).
- No deployment manifest, CI workflow, backup/restore procedure, monitoring configuration, centralized error-reporting integration, or retention/deletion workflow was found at the project root.

## Required before release

### Environment and deployment

- [ ] Choose and document the production hosting target, build/deploy process, domains, and API routing. No provider-specific deployment configuration currently exists.
- [ ] Configure production secrets through the host’s secret manager; do not copy `.env` or service-account JSON into the repository, client bundle, or build logs.
- [ ] Set `NODE_ENV=production`, `DEV_AUTH_MOCK=false`, `MONGODB_URI`, `FIREBASE_PROJECT_ID`, and `GOOGLE_APPLICATION_CREDENTIALS`. Verify the server service-account file is available to the process and matches the Firebase project.
- [ ] Set the `VITE_FIREBASE_*` values before building the client. These are client configuration and become public in the built assets; restrict the Firebase web API key and configure Firebase authentication/security policies appropriately.
- [ ] Configure approved booking rules in persisted administrator settings or `SHIPMENT_RULES_JSON`. Confirm currency, actual service coverage, rates, parcel limits, pickup/delivery windows, terms text, and terms version with the business owner. Do not use sample rates or invented coverage.
- [ ] Confirm the API bind address and network policy for the selected host. The current loopback bind is suitable only when the serving proxy can reach the API on the same host/network.
- [ ] Terminate TLS at the hosting edge or a trusted reverse proxy, route HTTPS traffic to the correct app/API, and verify certificate renewal, domain redirects, and secure headers for the chosen platform.

### Database and rollback

- [ ] Test production-like MongoDB connectivity, least-privilege credentials, network allowlists, and index creation on staging before release.
- [ ] Document schema/data compatibility for every release. There is no migration system; route initialization creates indexes, so preflight unique-index conflicts and ensure the deployment identity can create required indexes.
- [ ] Configure automated MongoDB backups with a defined retention period, recovery point/recovery time objectives, and a successful restore test before accepting real shipments.
- [ ] Define a rollback process using immutable application artifacts and versioned configuration. Verify that rolling back app code remains compatible with data written by the newer version; document database restore separately and require approval before any destructive recovery.

### Operations and customer services

- [ ] Add external uptime/dependency monitoring and alerts for API availability, MongoDB, Firebase authentication, failed bookings, and index/configuration errors. `/api/health` alone is not an alerting or readiness system.
- [ ] Choose centralized error reporting and log retention. Keep shipment addresses, phone numbers, authentication tokens, secrets, and service-account data out of logs and error payloads.
- [ ] Integrate and test a real payment provider before presenting payments as available. Until then, clearly retain the demo/no-charge boundary.
- [ ] Integrate and test notification providers (email/SMS/push), delivery receipts, retries, provider-level idempotency, and failure handling. The current server does not send notifications.
- [ ] Define privacy disclosures and retention/deletion rules for customer and recipient names, phone numbers, addresses, parcel descriptions, shipment events, audit data, and backups. Verify access controls and the process for deletion/export requests.
- [ ] Complete staging smoke tests for customer booking, ownership isolation, courier assignment/proof, dispatcher exception resolution, administrator auditing, invalid configuration, and failure/rollback paths.

## Release verification

Run from a clean checkout after configuring the target build environment:

```text
npm ci
npm run check
```

`npm run check` is the repository’s available build-and-test command. No separate lint or type-check script is defined. Record the command output and artifact version with the release approval.
