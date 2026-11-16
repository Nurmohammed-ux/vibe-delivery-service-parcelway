import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api.js";

export function isValidTrackingCode(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]{5,39}$/.test(value);
}

export function TrackLookupForm({ compact = false }) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [trackingCode, setTrackingCode] = useState("");
  const [state, setState] = useState({
    status: "idle",
    error: null,
    tracking: null,
  });

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedCode = trackingCode.trim();

    if (!isValidTrackingCode(normalizedCode)) {
      setState({
        status: "error",
        tracking: null,
        error: {
          code: "INVALID_TRACKING_CODE",
          message: "Use 6–40 letters or numbers; hyphens are allowed.",
        },
      });
      return;
    }

    setState({ status: "submitting", error: null, tracking: null });

    try {
      const tracking = await apiRequest("/api/public/tracking", {
        method: "POST",
        body: JSON.stringify({ trackingCode: normalizedCode }),
      });

      if (!isPublicTrackingResult(tracking)) {
        throw new Error("The tracking service returned incomplete public status data.");
      }

      setState({ status: "success", error: null, tracking });
    } catch (error) {
      setState({ status: "error", error, tracking: null });
    }
  }

  const errorTitle =
    state.error?.code === "TRACKING_UNAVAILABLE"
      ? "Tracking isn’t available yet"
      : state.error?.code === "INVALID_TRACKING_CODE"
        ? "Check the tracking code"
        : "We couldn’t check that code";

  return (
    <div className={`tracking-widget${compact ? " tracking-widget-compact" : ""}`}>
      <form
        aria-label="Track a parcel"
        className="tracking-form"
        onSubmit={handleSubmit}
        noValidate
      >
        <label htmlFor={inputId}>Tracking code</label>
        <div className="tracking-input-row">
          <input
            autoComplete="off"
            className="input input-bordered tracking-input"
            id={inputId}
            maxLength={40}
            onChange={(event) => {
              setTrackingCode(event.target.value);
              if (state.status === "error" || state.status === "success") {
                setState({ status: "idle", error: null, tracking: null });
              }
            }}
            placeholder="Enter your tracking code"
            spellCheck="false"
            aria-describedby={state.status === "error" ? errorId : undefined}
            disabled={state.status === "submitting"}
            value={trackingCode}
          />
          <button
            className="btn btn-primary tracking-submit"
            disabled={state.status === "submitting"}
            type="submit"
          >
            {state.status === "submitting" ? "Checking…" : "Track parcel"}
          </button>
        </div>
        <p className="tracking-hint">
          Public tracking is intended to show shipment status only, not private
          addresses or contact details.
        </p>
      </form>

      {state.status === "success" ? (
        <PublicTrackingResult tracking={state.tracking} />
      ) : null}
      {state.status === "error" ? (
        <div className="tracking-feedback" id={errorId} role="alert">
          <strong>{errorTitle}</strong>
          <p>{state.error.message}</p>
        </div>
      ) : null}
    </div>
  );
}

function isPublicTrackingResult(value) {
  return (
    typeof value?.status === "string" &&
    (value.estimatedDelivery === null ||
      (typeof value.estimatedDelivery === "string" &&
        !Number.isNaN(Date.parse(value.estimatedDelivery)))) &&
    (value.lastUpdatedAt === null ||
      (typeof value.lastUpdatedAt === "string" &&
        !Number.isNaN(Date.parse(value.lastUpdatedAt)))) &&
    ["recorded", "unavailable"].includes(value.updateState) &&
    Array.isArray(value.events) &&
    value.events.every(
      (event) =>
        typeof event?.status === "string" &&
        typeof event.timestamp === "string" &&
        !Number.isNaN(Date.parse(event.timestamp)),
    )
  );
}

function PublicTrackingResult({ tracking }) {
  const events = [...tracking.events].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );

  return (
    <section className="public-tracking-result" aria-live="polite" aria-label="Shipment tracking result">
      <div className="public-tracking-current">
        <span className="status-label">Current status</span>
        <strong>{formatStatus(tracking.status)}</strong>
      </div>
      <div className="public-tracking-summary">
        <div>
          <span>Estimated delivery</span>
          <strong>
            {tracking.estimatedDelivery
              ? formatTimestamp(tracking.estimatedDelivery)
              : "Not available"}
          </strong>
          {!tracking.estimatedDelivery ? (
            <small>There isn’t enough configured route data for a reliable estimate.</small>
          ) : null}
        </div>
        <div>
          <span>Last recorded update</span>
          <strong>
            {tracking.lastUpdatedAt
              ? formatTimestamp(tracking.lastUpdatedAt)
              : "No updates recorded"}
          </strong>
        </div>
      </div>
      {events.length > 0 ? (
        <ol className="public-tracking-events" aria-label="Shipment status timeline">
          {events.map((event, index) => (
            <li key={`${event.timestamp}-${index}`}>
              <span>{formatStatus(event.status)}</span>
              <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="public-tracking-empty">
          No valid shipment status events are available yet.
        </p>
      )}
    </section>
  );
}

function formatStatus(status) {
  const words = status.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

export function TrackingPage() {
  return (
    <section className="content-page tracking-page">
      <span className="eyebrow">PARCEL STATUS</span>
      <h1>Track a delivery</h1>
      <p className="page-intro">
        Enter a tracking code to see status events recorded for that shipment.
        An estimated delivery appears only when the system has enough configured
        route data to support one.
      </p>
      <div className="tracking-page-card surface-card">
        <TrackLookupForm />
      </div>
      <p className="privacy-note">
        Public tracking shows recorded status events, not a live location. It
        does not reveal recipient contact details, exact addresses, delivery
        instructions, or proof-of-delivery media. The latest timestamp is the
        last event recorded by the system; updates may not be immediate.
      </p>
      <p className="privacy-note">
        Delivery instructions, rescheduling, and notifications are not enabled
        in this preview. No email, SMS, or push message is sent.
      </p>
      <Link className="text-link back-link" to="/help">Need help?</Link>
    </section>
  );
}
