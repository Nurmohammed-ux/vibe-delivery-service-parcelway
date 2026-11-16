# Parcel Delivery App — Prompt Pack

Use these prompts **in order**, one at a time, in your coding assistant. Review each result before moving to the next prompt. They are written to work with either an existing codebase or a new one; the first prompt makes the assistant inspect the project instead of guessing its stack.

## How to use this pack

1. Start with **Prompt 0**. Confirm its assumptions and decisions before asking it to build.
2. Paste the **Project rules** into the assistant's project instructions if your tool supports them. Otherwise include them with each prompt.
3. Run each implementation prompt only after its prerequisites are complete.
4. If the assistant proposes a major product, data, or technology decision that is not already settled, ask it to explain the trade-offs and wait for your approval.
5. After each implementation phase, run the app and tests before continuing.

## Project rules

Include these rules with the prompts below:

```text
You are helping build a production-minded parcel-delivery web application. First inspect the existing repository, conventions, and available scripts; preserve the current stack and working behavior. Do not replace working architecture or add dependencies without a clear need.

Work in small, complete increments. Before editing, summarize the relevant files and a concise implementation plan. Make the requested changes, run the smallest relevant checks (and tests), fix failures caused by your changes, and report exactly what changed and what you verified. Never claim a check passed if it was not run. Do not leave fake buttons, dead-end flows, placeholder success states, or silently swallowed errors.

Keep the UI responsive, accessible, and consistent. Use semantic HTML, keyboard support, clear labels and validation, loading/empty/error/success states, and reduced-motion support. Animations should be subtle and should never delay or obscure important actions.

Enforce authorization on the server/API as well as in the UI. Validate inputs on trusted boundaries. Keep secrets out of source control and logs. Minimize personal and location data displayed to each role. Record important shipment and administrative changes in an auditable way.

Do not invent real payment, maps, SMS/email, identity-verification, or address-validation integrations. Inspect what is configured. If an integration is not configured, implement a clearly bounded interface and a safe development/demo path, explain its limitations, and list the credentials or decisions needed to enable production use. Never present simulated data as live data.

Avoid unrelated refactors. Follow existing formatting, linting, localization, and naming patterns. Do not create documentation or planning files unless a prompt asks for them.
```

## Prompt 0 — Inspect the repository and agree on the product

```text
Inspect this repository before making changes. Identify the framework, application entry points, existing routes/pages, styling and component conventions, data/API layer, authentication approach, tests, and run/build commands. If this repository is empty or only contains planning material, say so and recommend the smallest suitable starting structure without installing or generating anything yet.

Help me shape a parcel-delivery MVP around these roles:
- Visitor: learn about the service, estimate/check service availability where supported, and track a parcel with a tracking code.
- Customer/sender: create and manage shipments, addresses, payment/receipts, and support requests.
- Recipient: view limited tracking information and delivery options for a shipment addressed to them.
- Courier: view assigned stops, update pickup/delivery progress, and record proof or an exception.
- Dispatcher: monitor shipments, assign couriers, and resolve operational exceptions.
- Administrator: manage users, roles, service configuration, and audit history.

Use a practical initial operating assumption unless the codebase or I say otherwise: one service area, a small courier team, manual dispatch, and a clearly defined parcel/status workflow. Do not build route optimization or claim real-time GPS unless there is an actual integration.

Propose:
1. What already exists and what is missing.
2. The recommended MVP scope and explicit out-of-scope items.
3. The shipment lifecycle, exception states, role permissions, and key user journeys.
4. A page/route map for public, customer, courier, dispatcher, and admin experiences.
5. A data model/API and authentication approach that fits this repository.
6. External integrations and business decisions still required.
7. A phased implementation and verification plan.

Do not implement features in this step. Ask me only the few decisions that block a safe, coherent foundation; make other assumptions visible for my approval.
```

## Prompt 1 — Build the application foundation

```text
Using the approved decisions from Prompt 0, implement only the application foundation needed for the MVP. First inspect the current repository and summarize your plan.

Set up or complete the app shell, route structure, environment/config handling, shared layout, error handling, and the project's existing test/lint conventions. Add a consistent responsive design foundation: typography, spacing, colors, buttons, form controls, cards, tables, dialogs, status badges, and navigation. Use the existing styling system where possible.

Create role-aware navigation and route protection only to the extent supported by the actual authentication/data setup. Do not use client-side hiding as the sole authorization control. If authentication is not configured, establish a clear, replaceable auth boundary and a development-only mock path that cannot be mistaken for production authentication.

Provide sensible loading, not-found, and error states. Honor reduced-motion preferences. Do not build all business pages yet.

Run the relevant checks and report the changed files, how to run the app, and any remaining setup needed.
```

## Prompt 2 — Create the public website

```text
Implement the public-facing website using the approved product scope and existing design system.

Build:
- A responsive homepage with clear value proposition, primary “Book a delivery” action, parcel tracking entry, service overview, how-it-works section, service-area entry point if supported, trust/support information, and footer links.
- Service/pricing information that explains delivery options and parcel restrictions. Show only prices and service promises backed by configured rules; otherwise provide a clearly labeled estimate flow or explain that a quote is needed.
- A public tracking page that validates the tracking code and displays only information safe for an unauthenticated viewer.
- Useful help/contact, privacy, and terms entry points consistent with what the project actually supports.

Use polished but restrained motion for transitions and feedback; honor reduced motion. Ensure mobile layouts, keyboard navigation, accessible labels, and clear empty/error/loading states. Do not add fake live maps, fake testimonials, or nonfunctional CTAs.

Add focused tests for the important route and form behavior. Run relevant checks and summarize any real integrations still needed.
```

## Prompt 3 — Implement sign-in, roles, and account boundaries

```text
Implement or complete account access for the approved roles using the repository's existing authentication approach. If no provider/configuration exists, do not invent credentials or ship insecure authentication; implement the narrow auth integration boundary and clearly identify the setup required.

Requirements:
- Support the approved sign-in and sign-out flows and appropriate session handling.
- Enforce role and resource authorization in server/API operations, not only in page navigation.
- Prevent customers/recipients from accessing another person's shipment or personal details by guessing an ID or tracking code.
- Keep courier access limited to assigned work and the minimum recipient information needed to complete it.
- Make unauthorized, expired-session, and unavailable-account states clear and safe.
- Include role/permission tests for allowed and denied access, especially shipment ownership and courier assignment.

Do not create a broad “admin” bypass for convenience. Run relevant tests and report any provider configuration or security limitations.
```

## Prompt 4 — Build customer shipment booking and management

```text
Implement the customer shipment journey end to end using the approved data model and configured service rules.

Build a guided booking flow for:
1. Sender/pickup and recipient/delivery details.
2. Address and contact validation supported by the app.
3. Parcel dimensions/weight and required contents declarations.
4. Available service level and pickup/delivery window.
5. Full price and terms review before confirmation.
6. Payment only through an already configured provider; otherwise provide a clearly labeled development/demo payment boundary and do not claim a real charge occurred.
7. Confirmation with a stable shipment reference and next steps.

Also build the customer dashboard, shipment list with useful filters, shipment detail/timeline, saved address management if in scope, and receipt/invoice access where supported. Handle duplicate submissions safely and make booking errors recoverable.

Enforce server-side ownership and validation. Add focused tests for successful booking, invalid parcel/address data, duplicate submission, pricing display, and access to another customer's shipment. Run relevant checks and list integrations that remain unconfigured.
```

## Prompt 5 — Build tracking, recipient options, and notifications

```text
Implement shipment tracking and delivery updates against the real application status model.

Requirements:
- Show a chronological, timestamped shipment timeline and a clear current status.
- Show an ETA only when the system has a defensible estimate, label it as an estimate, and represent stale or unavailable updates honestly.
- Support a recipient's permitted delivery instructions, rescheduling, or delivery preferences only if approved business rules and operational support exist.
- Send status notifications through configured channels only. If email/SMS/push is not configured, create a clear provider boundary and development preview; do not report an unsent message as delivered.
- Prevent tracking and notification pages from unnecessarily exposing personal information.
- Make repeated status events and notification retries safe against duplicate effects.

Add tests for status ordering, restricted tracking data, invalid tracking references, and notification behavior with the configured or mocked provider boundary. Run relevant checks and explain what is simulated versus live.
```

## Prompt 6 — Build the courier workspace

```text
Implement the courier experience as a mobile-first workflow using the approved shipment lifecycle.

Build:
- A courier home/today view with assigned pickups and deliveries, time windows, progress, and clear priority.
- Stop details with only necessary address/contact/access information.
- Supported status actions such as arrived, picked up, delivery attempted, and delivered.
- Parcel scan support if hardware/browser APIs and the app support it, plus an auditable manual fallback.
- Proof-of-delivery capture according to the approved policy (for example recipient confirmation, signature, or permitted photo).
- A structured failed-attempt/exception flow with reason, notes where appropriate, and next operational action.

Enforce that a courier can act only on assigned shipments and only make valid state transitions. Handle network errors and duplicate action submissions without falsely marking a delivery complete. Do not claim offline synchronization unless implemented and tested.

Add tests for assignment checks, valid/invalid transitions, proof requirements, and failed-delivery handling. Verify the key screens at a narrow mobile viewport and run relevant checks.
```

## Prompt 7 — Build the dispatcher operations workspace

```text
Implement the dispatcher workspace for the approved manual-dispatch MVP.

Build:
- An operations overview with counts and a prioritized exception/at-risk queue.
- A searchable, filterable shipment board by status, service, area, and courier where those fields exist.
- Shipment detail access from the board without losing the current list context.
- Courier assignment and reassignment with validation for availability/capacity rules that are actually configured.
- An exceptions workflow for failed pickup/delivery, address issues, delays, damage, and return requests, with an owner, history, and next action.
- A route/map view only if a real map/location source exists; clearly label stale data and never fabricate courier positions.

Keep important actions auditable and protect against invalid status changes or conflicting assignments. Use clear confirmation for consequential actions and show failures explicitly.

Add focused authorization and workflow tests, including prevention of invalid assignment/status changes. Run relevant checks and report any operational rules that still need product decisions.
```

## Prompt 8 — Build administrator and business settings

```text
Implement the administrator area for the approved MVP with strict role enforcement and auditable changes.

Include only settings supported by the agreed scope:
- User management and role assignment.
- Service areas, service levels, operating hours, parcel limits, and pricing rules.
- Notification templates/configuration if the app owns them.
- Support/claims oversight if included.
- Audit history for sensitive configuration and operational changes.
- Integration/system configuration status without exposing secrets.

Validate settings before saving, explain the impact of changes, and protect the final administrator account and other critical configuration from accidental lockout. Never display secret values after they are saved.

Add tests for non-admin denial, invalid configuration, and audit history. Run relevant checks and identify settings that are placeholders versus connected to live services.
```

## Prompt 9 — Integrate, harden, and verify the MVP

```text
Review the implemented parcel-delivery MVP as a whole. Do not add unrelated features. First map the main user journeys and identify broken links, inconsistent status/permission behavior, missing error states, dead controls, and mismatches between UI and backend.

Verify end-to-end journeys:
1. Visitor finds service information and tracks a valid/invalid shipment safely.
2. Customer books a shipment, sees the correct price/confirmation, and can view only their shipments.
3. Courier sees only assigned stops, records pickup/delivery proof, or reports an exception.
4. Dispatcher assigns work and resolves an exception.
5. Administrator changes an approved setting and the change is auditable.

Check responsive behavior, accessibility basics (keyboard, labels, focus, contrast, reduced motion), form validation, authorization at API/server boundaries, duplicate submissions, and loading/error/empty states. Review personal/location data exposure and ensure logs do not include unnecessary sensitive data. This is defensive application quality work; do not perform intrusive testing against external systems.

Run the project's relevant tests, lint, type-check, and production build where available. Fix defects caused by this review. Report exact commands and results, known limitations, required environment variables/integrations, and a concise manual smoke-test checklist. Do not claim production readiness if live payments, notifications, monitoring, backups, or deployment configuration are still missing.
```

## Optional follow-up prompt — Prepare a release

```text
Prepare this app for a release without deploying it or changing production data. Inspect the repository's deployment setup and produce a release-readiness checklist covering environment configuration, migrations, secrets handling, TLS/domain assumptions, backups, monitoring/alerts, error reporting, payment and notification provider setup, privacy/retention, and rollback. Implement only clearly scoped, repository-consistent release improvements that do not require credentials or irreversible actions. Run the relevant build/tests and distinguish verified items from recommendations.
```

## Optional prompt template — Add one feature safely

```text
Add [FEATURE] for [ROLE] to the existing parcel-delivery app.

User outcome:
[What the user should be able to accomplish]

Business rules and edge cases:
[Rules, permissions, valid status transitions, failure behavior]

UI consistency and polish:
- Keep the design consistent across all existing pages, including shared navigation, typography, spacing, colors, buttons, forms, and status indicators.
- Make modest UI improvements where needed so pages feel clear, polished, and responsive; reuse the existing design system and avoid an unrelated redesign.

Acceptance criteria:
- [Observable behavior 1]
- [Observable behavior 2]
- [Validation/error behavior]
- [Authorization behavior]
- [The UI is consistent across existing pages and works well on mobile]

Before editing, inspect related routes, components, data/API models, and tests. Summarize the smallest implementation plan and any blocking assumptions. Follow the project rules, preserve existing behavior, implement the feature end to end, add focused tests, run relevant checks, and report exact results. Do not build adjacent features or leave placeholder actions.
```