import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../api.js";
import { ErrorState, LoadingState } from "../components/Feedback.jsx";

export function StatusPage() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  const loadStatus = useCallback(async () => {
    setState({ status: "loading", data: null, error: null });

    try {
      const data = await apiGet("/api/health");
      setState({ status: "ready", data, error: null });
    } catch (error) {
      setState({ status: "error", data: null, error });
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  return (
    <section className="content-page narrow-page">
      <span className="eyebrow">SYSTEM STATUS</span>
      <h1>Service status</h1>
      <p className="page-intro">
        This page reports the API and database configuration; it does not imply
        delivery services are live.
      </p>

      {state.status === "loading" ? <LoadingState label="Checking service status" /> : null}
      {state.status === "error" ? (
        <ErrorState message={state.error.message} onRetry={loadStatus} />
      ) : null}
      {state.status === "ready" ? (
        <div className="status-grid">
          <StatusItem label="API" value={state.data.api} />
          <StatusItem label="MongoDB" value={state.data.database} />
          <StatusItem
            label="Booking rules"
            value={state.data.shipmentBookingRulesConfigured ? "configured" : "not_configured"}
          />
        </div>
      ) : null}
    </section>
  );
}

function StatusItem({ label, value }) {
  return (
    <div className="surface-card status-item">
      <span className="eyebrow">{label}</span>
      <strong>{value.replaceAll("_", " ")}</strong>
    </div>
  );
}
