import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiRequest } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { ErrorState, LoadingState, Notice } from "../components/Feedback.jsx";

const failedAttemptReasons = [
  ["recipient_unavailable", "Recipient unavailable"],
  ["address_issue", "Address issue"],
  ["access_issue", "Could not access location"],
  ["other", "Other"],
];

const nextActions = [
  ["contact_recipient", "Contact recipient"],
  ["dispatcher_follow_up", "Dispatcher follow-up"],
  ["return_to_depot", "Return to depot"],
];

const statusLabels = {
  booked: "Pickup pending",
  picked_up: "Picked up",
  in_transit: "In transit",
  exception: "Needs follow-up",
  delivered: "Delivered",
};

export function CourierWorkspacePage() {
  const { getAccessToken, authMode } = useAuth();
  const [state, setState] = useState({ status: "loading", shipments: [], error: null });
  const [reference, setReference] = useState("");
  const [filter, setFilter] = useState("");
  const [actionErrors, setActionErrors] = useState({});
  const [pending, setPending] = useState({});
  const requestKeys = useRef(new Map());
  const pendingRef = useRef(new Set());

  const loadShipments = useCallback(async () => {
    setState({ status: "loading", shipments: [], error: null });
    try {
      const token = await getAccessToken();
      const result = await apiGet("/api/courier/shipments", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setState({ status: "ready", shipments: result.shipments, error: null });
    } catch (error) {
      setState({ status: "error", shipments: [], error });
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  async function submitAction(shipment, body) {
    const requestId = `${shipment.reference}:${JSON.stringify(body)}`;
    if (pendingRef.current.has(requestId)) return;
    pendingRef.current.add(requestId);
    setPending((current) => ({ ...current, [shipment.reference]: true }));
    setActionErrors((current) => ({ ...current, [shipment.reference]: null }));

    let idempotencyKey = requestKeys.current.get(requestId);
    if (!idempotencyKey) {
      idempotencyKey =
        globalThis.crypto?.randomUUID?.() ||
        `courier-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      requestKeys.current.set(requestId, idempotencyKey);
    }

    try {
      const token = await getAccessToken();
      const result = await apiRequest(
        `/api/courier/shipments/${encodeURIComponent(shipment.reference)}/actions`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        },
      );
      requestKeys.current.delete(requestId);
      setState((current) => ({
        ...current,
        shipments: current.shipments.map((item) =>
          item.reference === shipment.reference ? result.shipment : item,
        ),
      }));
    } catch (error) {
      setActionErrors((current) => ({
        ...current,
        [shipment.reference]: error,
      }));
    } finally {
      pendingRef.current.delete(requestId);
      setPending((current) => ({ ...current, [shipment.reference]: false }));
    }
  }

  const filteredShipments = state.shipments.filter((shipment) =>
    !filter || shipment.reference.toLowerCase().includes(filter.toLowerCase()),
  );
  const activeCount = state.shipments.filter((shipment) => shipment.status !== "delivered").length;
  const completedCount = state.shipments.length - activeCount;

  return (
    <section className="content-page courier-page">
      <div className="courier-page-heading">
        <div>
          <span className="eyebrow">COURIER WORKSPACE</span>
          <h1>Assigned stops</h1>
          <p className="page-intro">
            Review your assigned pickups and deliveries, then record each stop as it happens.
          </p>
        </div>
        <div className="courier-route-count" aria-label={`${activeCount} active stops`}>
          <strong>{activeCount}</strong>
          <span>active stops</span>
        </div>
      </div>

      {authMode === "development-mock" ? (
        <Notice tone="warning">
          Development-only courier identity. Assignment checks are enforced by the API, but this is not real authentication.
        </Notice>
      ) : null}
      <Notice>
        Booking records do not include scheduled dates. The saved pickup and delivery windows are shown as entered, not as confirmation that a stop is due today.
      </Notice>

      <div className="courier-tools surface-card">
        <div>
          <h2>Find an assigned parcel</h2>
          <p>Manual reference lookup is available; barcode scanning is not configured.</p>
        </div>
        <form
          className="courier-reference-form"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter(reference.trim());
          }}
        >
          <label className="booking-field">
            <span>Shipment reference</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="PW-…"
              maxLength={40}
            />
          </label>
          <button className="btn btn-secondary" type="submit">Find stop</button>
          {filter ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setFilter("");
                setReference("");
              }}
            >
              Clear
            </button>
          ) : null}
        </form>
      </div>

      {state.status === "loading" ? <LoadingState label="Loading assigned stops" /> : null}
      {state.status === "error" ? (
        <ErrorState
          title="Could not load assigned stops"
          message={state.error.message}
          onRetry={loadShipments}
        />
      ) : null}
      {state.status === "ready" && filteredShipments.length === 0 ? (
        <div className="surface-card courier-empty-state">
          <h2>{filter ? "No assigned stop matches that reference" : "No assigned stops yet"}</h2>
          <p>
            {filter
              ? "Check the reference and try again. A courier can only view shipments assigned to their account."
              : "Shipments assigned to your courier account will appear here."}
          </p>
        </div>
      ) : null}
      {state.status === "ready" && filteredShipments.length > 0 ? (
        <>
          <div className="courier-stop-summary" aria-live="polite">
            <span>{activeCount} active</span>
            <span>{completedCount} completed</span>
          </div>
          <div className="courier-stop-list">
            {filteredShipments.map((shipment) => (
              <CourierStop
                key={shipment.reference}
                shipment={shipment}
                error={actionErrors[shipment.reference]}
                pending={Boolean(pending[shipment.reference])}
                onAction={submitAction}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function CourierStop({ shipment, error, pending, onAction }) {
  const [showFailedAttempt, setShowFailedAttempt] = useState(false);
  const [reason, setReason] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [notes, setNotes] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const pickupStop = shipment.status === "booked";
  const deliveryStop = ["picked_up", "in_transit"].includes(shipment.status);
  const enRoute = shipment.status === "in_transit";
  const address = pickupStop ? shipment.pickup : shipment.recipient;
  const timeWindow = pickupStop ? shipment.pickupWindow : shipment.deliveryWindow;
  const isComplete = shipment.status === "delivered";
  const nextActionLabel = nextActions.find(([value]) => value === shipment.events?.at(-1)?.details?.nextAction)?.[1];

  function submitFailedAttempt(event) {
    event.preventDefault();
    onAction(shipment, {
      action: "delivery_attempted",
      reason,
      nextAction,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  }

  return (
    <article className={`courier-stop surface-card${isComplete ? " courier-stop-complete" : ""}`}>
      <header className="courier-stop-header">
        <div>
          <span className="eyebrow">{shipment.reference}</span>
          <h2>{pickupStop ? "Pickup stop" : "Delivery stop"}</h2>
        </div>
        <span className={`courier-status-badge courier-status-${shipment.status}`}>
          {statusLabels[shipment.status] || "Status update"}
        </span>
      </header>

      <div className="courier-stop-progress" aria-label={`Shipment status: ${statusLabels[shipment.status] || shipment.status}`}>
        <span className={shipment.status === "booked" ? "step-current" : "step-done"}>Assigned</span>
        <span className={["picked_up", "in_transit", "exception", "delivered"].includes(shipment.status) ? "step-done" : ""}>Picked up</span>
        <span className={isComplete ? "step-done" : ""}>{isComplete ? "Delivered" : "Handoff"}</span>
      </div>

      <div className="courier-stop-details">
        <div>
          <span className="courier-detail-label">{pickupStop ? "Pickup contact" : "Recipient"}</span>
          <strong>{address?.name || "Contact details unavailable"}</strong>
          {address?.phone ? <a href={`tel:${address.phone}`}>{address.phone}</a> : null}
        </div>
        <div>
          <span className="courier-detail-label">Address</span>
          <strong>{address?.line1}</strong>
          <span>{[address?.city, address?.postalCode].filter(Boolean).join(", ")}</span>
        </div>
        <div>
          <span className="courier-detail-label">{pickupStop ? "Pickup window" : "Delivery window"}</span>
          <strong>{timeWindow?.label || "Not specified"}</strong>
        </div>
      </div>

      {shipment.status === "exception" ? (
        <Notice tone="warning">
          Delivery exception recorded{nextActionLabel ? ` · next action: ${nextActionLabel.toLowerCase()}` : ""}. Follow-up is required before another delivery attempt.
        </Notice>
      ) : null}

      {error ? (
        <div className="courier-action-error" role="alert">
          <strong>Action not confirmed.</strong> {error.message} Retry when the connection is available; the request uses the same retry key.
        </div>
      ) : null}

      {pending ? <p className="courier-saving" role="status">Saving update…</p> : null}

      {!isComplete && !pending ? (
        <div className="courier-action-panel">
          {pickupStop ? (
            <div className="courier-action-buttons">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onAction(shipment, { action: "arrived" })}
              >
                Arrived at pickup
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => onAction(shipment, { action: "picked_up" })}
              >
                Confirm pickup
              </button>
            </div>
          ) : null}

          {deliveryStop ? (
            <>
              {shipment.status === "picked_up" ? (
                <div className="courier-action-buttons">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => onAction(shipment, { action: "in_transit" })}
                  >
                    Start delivery route
                  </button>
                </div>
              ) : (
                <div className="courier-action-buttons">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => onAction(shipment, { action: "arrived" })}
                  >
                    Arrived at delivery
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setShowFailedAttempt((current) => !current)}
                    aria-expanded={showFailedAttempt}
                  >
                    Report failed attempt
                  </button>
                </div>
              )}
              {enRoute ? (
                <>
                  <form
                    className="courier-delivery-proof"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onAction(shipment, {
                        action: "delivered",
                        recipientName,
                        confirmed,
                      });
                    }}
                  >
                    <h3>Proof of delivery</h3>
                    <p>Record the recipient’s name and confirm handoff. No photo or signature is collected.</p>
                    <label className="booking-field">
                      <span>Recipient who received the parcel</span>
                      <input
                        value={recipientName}
                        onChange={(event) => setRecipientName(event.target.value)}
                        required
                        maxLength={100}
                        autoComplete="name"
                      />
                    </label>
                    <label className="courier-confirmation">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                        required
                      />
                      <span>I confirm the parcel was handed to this recipient.</span>
                    </label>
                    <button className="btn btn-primary" type="submit">Mark delivered</button>
                  </form>
                  {showFailedAttempt ? (
                    <form className="courier-exception-form" onSubmit={submitFailedAttempt}>
                      <h3>Record failed delivery</h3>
                      <label className="booking-field">
                        <span>Reason</span>
                        <select value={reason} onChange={(event) => setReason(event.target.value)} required>
                          <option value="">Choose a reason</option>
                          {failedAttemptReasons.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="booking-field">
                        <span>Next operational action</span>
                        <select value={nextAction} onChange={(event) => setNextAction(event.target.value)} required>
                          <option value="">Choose next action</option>
                          {nextActions.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="booking-field">
                        <span>Notes (optional)</span>
                        <textarea
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          maxLength={500}
                          rows={3}
                        />
                      </label>
                      <button className="btn btn-primary" type="submit">Save exception</button>
                    </form>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
