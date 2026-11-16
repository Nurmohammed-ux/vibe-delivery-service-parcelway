import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiRequest } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { ErrorState, LoadingState, Notice } from "../components/Feedback.jsx";

const shipmentStatusLabels = {
  booked: "Booked",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  exception: "Needs attention",
};

const exceptionCategories = [
  ["pickup_failed", "Failed pickup"],
  ["delivery_failed", "Failed delivery"],
  ["address_issue", "Address issue"],
  ["delay", "Delay"],
  ["damage", "Damage"],
  ["return_request", "Return request"],
  ["other", "Other"],
];

const exceptionActions = [
  ["contact_recipient", "Contact recipient"],
  ["contact_sender", "Contact sender"],
  ["verify_address", "Verify address"],
  ["dispatcher_follow_up", "Dispatcher follow-up"],
  ["inspect_parcel", "Inspect parcel"],
  ["reschedule_delivery", "Reschedule delivery"],
  ["return_to_depot", "Return to depot"],
  ["approve_return", "Review return request"],
];

export function DispatcherWorkspacePage() {
  const { getAccessToken, authMode, user } = useAuth();
  const [overview, setOverview] = useState({ status: "loading", data: null, error: null });
  const [board, setBoard] = useState({ status: "loading", shipments: [], error: null });
  const [couriers, setCouriers] = useState([]);
  const [dispatchers, setDispatchers] = useState([]);
  const [services, setServices] = useState([]);
  const [capacityRulesConfigured, setCapacityRulesConfigured] = useState(false);
  const [peopleError, setPeopleError] = useState(null);
  const [filters, setFilters] = useState({
    q: "",
    status: "all",
    serviceId: "",
    area: "",
    courierId: "",
  });
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionNotice, setActionNotice] = useState("");
  const [pending, setPending] = useState(false);
  const requestKeys = useRef(new Map());
  const pendingRef = useRef(false);
  const selectedRef = useRef(null);

  const requestHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAccessToken]);

  const loadOverview = useCallback(async () => {
    setOverview((current) => ({ ...current, status: "loading", error: null }));
    try {
      const result = await apiGet("/api/dispatcher/overview", {
        headers: await requestHeaders(),
      });
      setOverview({ status: "ready", data: result, error: null });
    } catch (error) {
      setOverview({ status: "error", data: null, error });
    }
  }, [requestHeaders]);

  const loadBoard = useCallback(async () => {
    setBoard((current) => ({ ...current, status: "loading", error: null }));
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      const result = await apiGet(
        `/api/dispatcher/shipments${params.size ? `?${params}` : ""}`,
        { headers: await requestHeaders() },
      );
      setBoard({ status: "ready", shipments: result.shipments, error: null });
      setServices((current) => {
        const values = new Map(current.map((service) => [service.id, service.name]));
        for (const shipment of result.shipments) {
          if (shipment.service?.id) values.set(shipment.service.id, shipment.service.name);
        }
        return [...values.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((left, right) => left.name.localeCompare(right.name));
      });
      if (selectedRef.current) {
        const refreshedSelection = result.shipments.find(
          (shipment) => shipment.reference === selectedRef.current.reference,
        );
        if (refreshedSelection) {
          selectedRef.current = refreshedSelection;
          setSelected(refreshedSelection);
        }
      }
    } catch (error) {
      setBoard({ status: "error", shipments: [], error });
    }
  }, [filters, requestHeaders]);

  const loadPeople = useCallback(async () => {
    setPeopleError(null);
    try {
      const headers = await requestHeaders();
      const [courierResult, dispatcherResult] = await Promise.all([
        apiGet("/api/dispatcher/couriers", { headers }),
        apiGet("/api/dispatcher/dispatchers", { headers }),
      ]);
      setCouriers(courierResult.couriers);
      const operationsPeople = [...dispatcherResult.dispatchers];
      if (
        user?.role === "admin" &&
        user.id &&
        !operationsPeople.some((person) => person.id === user.id)
      ) {
        operationsPeople.push({
          id: user.id,
          displayName: user.displayName || "Administrator",
        });
      }
      setDispatchers(operationsPeople);
      setCapacityRulesConfigured(courierResult.capacityRulesConfigured);
    } catch (error) {
      setPeopleError(error);
    }
  }, [requestHeaders]);

  useEffect(() => {
    loadOverview();
    loadPeople();
  }, [loadOverview, loadPeople]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  async function submitAction(path, body, successMessage) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setActionError(null);
    setActionNotice("");
    const requestId = `${path}:${JSON.stringify(body)}`;
    let idempotencyKey = requestKeys.current.get(requestId);
    if (!idempotencyKey) {
      idempotencyKey =
        globalThis.crypto?.randomUUID?.() ||
        `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      requestKeys.current.set(requestId, idempotencyKey);
    }

    try {
      const result = await apiRequest(path, {
        method: "POST",
        headers: {
          ...(await requestHeaders()),
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      requestKeys.current.delete(requestId);
      if (result.shipment) {
        selectedRef.current = result.shipment;
        setSelected(result.shipment);
      }
      setActionNotice(successMessage);
      await Promise.all([loadOverview(), loadBoard()]);
      return result.shipment;
    } catch (error) {
      setActionError(error);
      return null;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const selectShipment = useCallback((shipment) => {
    selectedRef.current = shipment;
    setSelected(shipment);
    setActionError(null);
    setActionNotice("");
  }, []);

  return (
    <section className="content-page dispatcher-page">
      <header className="dispatcher-heading">
        <div>
          <span className="eyebrow">
            {user?.role === "admin" ? "ADMIN OPERATIONS WORKSPACE" : "DISPATCHER WORKSPACE"}
          </span>
          <h1>Operations overview</h1>
          <p className="page-intro">
            Review shipment flow, assign couriers, and keep operational exceptions moving.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => {
          loadOverview();
          loadBoard();
          loadPeople();
        }}>
          Refresh operations
        </button>
      </header>

      {authMode === "development-mock" ? (
        <Notice tone="warning">
          Development-only operations identity. Operational actions are not real authentication.
        </Notice>
      ) : null}
      {!capacityRulesConfigured ? (
        <Notice>
          Courier availability and capacity rules are not configured. Assignments are checked against active courier accounts only.
        </Notice>
      ) : null}
      {actionNotice ? <Notice tone="success">{actionNotice}</Notice> : null}
      {actionError ? (
        <div className="dispatcher-action-error" role="alert">
          <strong>Action not confirmed.</strong> {actionError.message} Refresh the shipment before retrying.
        </div>
      ) : null}
      {peopleError ? (
        <ErrorState
          title="Could not load operations staff"
          message={peopleError.message}
          onRetry={loadPeople}
        />
      ) : null}

      <section className="dispatcher-overview" aria-label="Shipment counts">
        {overview.status === "loading" && !overview.data ? (
          <LoadingState label="Loading operations counts" />
        ) : null}
        {overview.status === "error" ? (
          <ErrorState
            title="Could not load operations overview"
            message={overview.error.message}
            onRetry={loadOverview}
          />
        ) : null}
        {overview.status === "ready" ? (
          <div className="dispatcher-count-grid">
            {[
              ["Total shipments", overview.data.counts.total, "total"],
              ["Awaiting assignment", overview.data.counts.unassigned, "unassigned"],
              ["Assigned", overview.data.counts.assigned, "assigned"],
              ["In transit", overview.data.counts.in_transit, "in-transit"],
              ["Exceptions", overview.data.counts.exception, "exceptions"],
              ["Delivered", overview.data.counts.delivered, "delivered"],
            ].map(([label, count, kind]) => (
              <article className={`dispatcher-count-card dispatcher-count-${kind}`} key={kind}>
                <span>{label}</span>
                <strong>{count}</strong>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="dispatcher-exceptions surface-card" aria-labelledby="dispatcher-exceptions-title">
        <div className="dispatcher-section-heading">
          <div>
            <span className="eyebrow">PRIORITIZED QUEUE</span>
            <h2 id="dispatcher-exceptions-title">Exceptions needing attention</h2>
          </div>
          <p>Damage and address issues first, then older records. No SLA or live location data is configured.</p>
        </div>
        {overview.status === "ready" && overview.data.exceptions.length === 0 ? (
          <p className="dispatcher-empty-copy">No shipment exceptions need attention.</p>
        ) : null}
        {overview.status === "ready" && overview.data.exceptions.length > 0 ? (
          <div className="dispatcher-exception-list">
            {overview.data.exceptions.map((shipment) => {
              const activeException = findActiveException(shipment);
              const courierName = findPersonName(couriers, shipment.courierId);
              return (
                <button
                  type="button"
                  className={`dispatcher-exception-item${selected?.reference === shipment.reference ? " dispatcher-exception-selected" : ""}`}
                  key={shipment.reference}
                  onClick={() => selectShipment(shipment)}
                >
                  <span className="dispatcher-exception-mark" aria-hidden="true">!</span>
                  <span className="dispatcher-exception-copy">
                    <strong>{shipment.reference}</strong>
                    <span>{categoryLabel(activeException?.category || latestException(shipment)?.details?.reason)}</span>
                    <small>
                      {courierName || (shipment.courierId ? "Assigned courier" : "Unassigned")}
                      {activeException?.ownerId
                        ? ` · Owner: ${findPersonName(dispatchers, activeException.ownerId) || "Operations owner"}`
                        : ""}
                    </small>
                  </span>
                  <span className="dispatcher-exception-next">
                    {actionLabel(activeException?.nextAction || latestException(shipment)?.details?.nextAction)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <div className="dispatcher-board-heading">
        <div>
          <span className="eyebrow">SHIPMENT BOARD</span>
          <h2>All shipments</h2>
        </div>
        <span className="dispatcher-board-result-count">
          {board.status === "ready" ? `${board.shipments.length} results` : ""}
        </span>
      </div>

      <form className="dispatcher-filters surface-card" onSubmit={(event) => event.preventDefault()}>
        <label className="booking-field">
          <span>Search reference or contact</span>
          <input
            value={filters.q}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
            placeholder="Search shipments"
            maxLength={100}
          />
        </label>
        <label className="booking-field">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="all">All statuses</option>
            {Object.entries(shipmentStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="booking-field">
          <span>Service</span>
          <select
            value={filters.serviceId}
            onChange={(event) => setFilters((current) => ({ ...current, serviceId: event.target.value }))}
          >
            <option value="">All services</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </label>
        <label className="booking-field">
          <span>Area (city or postal code)</span>
          <input
            value={filters.area}
            onChange={(event) => setFilters((current) => ({ ...current, area: event.target.value }))}
            maxLength={100}
          />
        </label>
        <label className="booking-field">
          <span>Courier</span>
          <select
            value={filters.courierId}
            onChange={(event) => setFilters((current) => ({ ...current, courierId: event.target.value }))}
          >
            <option value="">All couriers</option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>{courier.displayName}</option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setFilters({
            q: "",
            status: "all",
            serviceId: "",
            area: "",
            courierId: "",
          })}
        >
          Clear filters
        </button>
      </form>

      <div className={`dispatcher-work-area${selected ? " dispatcher-work-area-selected" : ""}`}>
        <section className="dispatcher-board surface-card" aria-label="Shipment board results">
          {board.status === "loading" ? <LoadingState label="Loading shipments" /> : null}
          {board.status === "error" ? (
            <ErrorState
              title="Could not load shipments"
              message={board.error.message}
              onRetry={loadBoard}
            />
          ) : null}
          {board.status === "ready" && board.shipments.length === 0 ? (
            <div className="dispatcher-empty-state">
              <h3>No matching shipments</h3>
              <p>Try clearing one or more board filters.</p>
            </div>
          ) : null}
          {board.status === "ready" && board.shipments.length > 0 ? (
            <div className="dispatcher-shipment-list">
              {board.shipments.map((shipment) => (
                <button
                  type="button"
                  className={`dispatcher-shipment-row${selected?.reference === shipment.reference ? " dispatcher-shipment-selected" : ""}`}
                  key={shipment.reference}
                  onClick={() => selectShipment(shipment)}
                >
                  <span className="dispatcher-shipment-main">
                    <strong>{shipment.reference}</strong>
                    <span>{shipment.recipient?.name || "Recipient unavailable"}</span>
                    <small>{shipment.service?.name || "Service unspecified"} · {shipment.recipient?.city || "Area unavailable"}</small>
                  </span>
                  <span className={`dispatcher-status dispatcher-status-${shipment.status}`}>
                    {shipmentStatusLabels[shipment.status] || shipment.status}
                  </span>
                  <span className="dispatcher-courier-name">
                    {findPersonName(couriers, shipment.courierId) || "Unassigned"}
                  </span>
                  <span className="dispatcher-open-detail">Open details →</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {selected ? (
          <DispatcherShipmentDetails
            key={selected.reference}
            shipment={selected}
            couriers={couriers}
            dispatchers={dispatchers}
            currentDispatcherId={user?.id}
            pending={pending}
            onAction={submitAction}
            onClose={() => {
              selectedRef.current = null;
              setSelected(null);
            }}
          />
        ) : (
          <aside className="dispatcher-detail-placeholder surface-card">
            <span className="workspace-icon" aria-hidden="true">⌖</span>
            <h3>Select a shipment</h3>
            <p>Open any board item to review its operational details without leaving the list.</p>
          </aside>
        )}
      </div>
    </section>
  );
}

function DispatcherShipmentDetails({
  shipment,
  couriers,
  dispatchers,
  currentDispatcherId,
  pending,
  onAction,
  onClose,
}) {
  const [courierId, setCourierId] = useState(shipment.courierId || "");
  const [confirmAssignment, setConfirmAssignment] = useState(false);
  const [category, setCategory] = useState("");
  const [exceptionNextAction, setExceptionNextAction] = useState("dispatcher_follow_up");
  const [exceptionOwner, setExceptionOwner] = useState(currentDispatcherId || "");
  const [exceptionNotes, setExceptionNotes] = useState("");
  const [showNewException, setShowNewException] = useState(false);
  const currentException = findActiveException(shipment);
  const assignedCourierName = findPersonName(couriers, shipment.courierId);
  const assignedDispatcherName = findPersonName(dispatchers, currentException?.ownerId);

  async function confirmCourierAssignment() {
    const result = await onAction(
      `/api/dispatcher/shipments/${encodeURIComponent(shipment.reference)}/assignment`,
      {
        courierId: courierId || null,
        expectedCourierId: shipment.courierId || null,
      },
      courierId ? "Courier assignment saved." : "Courier assignment cleared.",
    );
    if (result) setConfirmAssignment(false);
  }

  async function createException(event) {
    event.preventDefault();
    const result = await onAction(
      `/api/dispatcher/shipments/${encodeURIComponent(shipment.reference)}/exceptions`,
      {
        category,
        nextAction: exceptionNextAction,
        ownerId: exceptionOwner,
        ...(exceptionNotes.trim() ? { notes: exceptionNotes.trim() } : {}),
      },
      "Operational exception recorded.",
    );
    if (result) setShowNewException(false);
  }

  async function updateException(body, message) {
    return onAction(
      `/api/dispatcher/shipments/${encodeURIComponent(shipment.reference)}/exceptions/${encodeURIComponent(currentException.id)}/actions`,
      body,
      message,
    );
  }

  return (
    <aside className="dispatcher-detail surface-card" aria-label={`Shipment ${shipment.reference} details`}>
      <div className="dispatcher-detail-top">
        <div>
          <span className="eyebrow">SHIPMENT DETAILS</span>
          <h2>{shipment.reference}</h2>
        </div>
        <button className="btn btn-ghost dispatcher-detail-close" type="button" onClick={onClose}>
          Close details
        </button>
      </div>
      <div className="dispatcher-detail-status">
        <span className={`dispatcher-status dispatcher-status-${shipment.status}`}>
          {shipmentStatusLabels[shipment.status] || shipment.status}
        </span>
        <span>{shipment.service?.name || "Service unspecified"}</span>
      </div>

      <div className="dispatcher-address-grid">
        <AddressSummary title="Pickup" address={shipment.pickup} window={shipment.pickupWindow} />
        <AddressSummary title="Recipient" address={shipment.recipient} window={shipment.deliveryWindow} />
      </div>
      {shipment.parcel ? (
        <p className="dispatcher-parcel-summary">
          Parcel · {shipment.parcel.weightKg} kg · {shipment.parcel.dimensionsCm?.length} × {shipment.parcel.dimensionsCm?.width} × {shipment.parcel.dimensionsCm?.height} cm
        </p>
      ) : null}

      <section className="dispatcher-assignment-section">
        <div className="dispatcher-subsection-heading">
          <div>
            <h3>Courier assignment</h3>
            <p>Current: {assignedCourierName || "Unassigned"}</p>
          </div>
        </div>
        {shipment.status === "delivered" ? (
          <p className="dispatcher-muted-copy">Delivered shipments cannot be reassigned.</p>
        ) : (
          <div className="dispatcher-assignment-controls">
            <label className="booking-field">
              <span>Assign courier</span>
              <select value={courierId} onChange={(event) => {
                setCourierId(event.target.value);
                setConfirmAssignment(false);
              }}>
                <option value="">Unassigned</option>
                {couriers.map((courier) => (
                  <option key={courier.id} value={courier.id}>{courier.displayName}</option>
                ))}
              </select>
            </label>
            {confirmAssignment ? (
              <div className="dispatcher-confirm-box" role="group" aria-label="Confirm courier assignment">
                <p>
                  Confirm {courierId ? `assignment to ${findPersonName(couriers, courierId)}` : "removing the courier assignment"}?
                </p>
                <button className="btn btn-primary" type="button" disabled={pending} onClick={confirmCourierAssignment}>
                  Confirm assignment
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setConfirmAssignment(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary"
                type="button"
                disabled={pending || courierId === (shipment.courierId || "")}
                onClick={() => setConfirmAssignment(true)}
              >
                Review assignment
              </button>
            )}
          </div>
        )}
      </section>

      <section className="dispatcher-exception-section">
        <div className="dispatcher-subsection-heading">
          <div>
            <h3>Operational exception</h3>
            {currentException ? (
              <p>
                {categoryLabel(currentException.category)} · {currentException.status.replace("_", " ")}
                {assignedDispatcherName ? ` · Owner: ${assignedDispatcherName}` : ""}
              </p>
            ) : (
              <p>{shipment.status === "exception" ? "Courier-reported issue needs an operational case." : "No operational case is open."}</p>
            )}
          </div>
          {!currentException && shipment.status !== "delivered" ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowNewException((current) => !current)}
            >
              {showNewException ? "Cancel" : "Create case"}
            </button>
          ) : null}
        </div>

        {currentException ? (
          <ExceptionManager
            exception={currentException}
            dispatchers={dispatchers}
            pending={pending}
            onUpdate={updateException}
          />
        ) : null}

        {showNewException ? (
          <form className="dispatcher-new-exception" onSubmit={createException}>
            <label className="booking-field">
              <span>Issue type</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} required>
                <option value="">Choose issue</option>
                {exceptionCategories.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="booking-field">
              <span>Owner</span>
              <select value={exceptionOwner} onChange={(event) => setExceptionOwner(event.target.value)} required>
                {dispatchers.map((dispatcher) => (
                  <option key={dispatcher.id} value={dispatcher.id}>{dispatcher.displayName}</option>
                ))}
              </select>
            </label>
            <label className="booking-field">
              <span>Next action</span>
              <select value={exceptionNextAction} onChange={(event) => setExceptionNextAction(event.target.value)} required>
                {exceptionActions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="booking-field">
              <span>Notes (optional)</span>
              <textarea
                value={exceptionNotes}
                onChange={(event) => setExceptionNotes(event.target.value)}
                maxLength={500}
                rows={3}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              Save exception case
            </button>
          </form>
        ) : null}
      </section>

      <section className="dispatcher-timeline">
        <h3>Shipment history</h3>
        {(shipment.events || []).length === 0 ? (
          <p className="dispatcher-muted-copy">No shipment events are recorded.</p>
        ) : (
          <ol>
            {[...(shipment.events || [])].reverse().map((event, index) => (
              <li key={`${event.status}-${event.timestamp}-${index}`}>
                <strong>{eventLabel(event)}</strong>
                <time dateTime={normalizeTimestamp(event.timestamp)}>{formatTimestamp(event.timestamp)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

function AddressSummary({ title, address, window }) {
  return (
    <section className="dispatcher-address-card">
      <span className="courier-detail-label">{title}</span>
      <strong>{address?.name || "Contact unavailable"}</strong>
      {address?.phone ? <a href={`tel:${address.phone}`}>{address.phone}</a> : null}
      <span>{address?.line1}</span>
      <span>{[address?.city, address?.postalCode].filter(Boolean).join(", ")}</span>
      <small>{window?.label || "Time window not specified"}</small>
    </section>
  );
}

function ExceptionManager({ exception, dispatchers, pending, onUpdate }) {
  const [ownerId, setOwnerId] = useState(exception.ownerId);
  const [nextAction, setNextAction] = useState(exception.nextAction);
  const [resolutionNotes, setResolutionNotes] = useState("");

  useEffect(() => {
    setOwnerId(exception.ownerId);
    setNextAction(exception.nextAction);
    setResolutionNotes("");
  }, [exception.id, exception.ownerId, exception.nextAction, exception.status]);

  const hasChanges =
    ownerId !== exception.ownerId || nextAction !== exception.nextAction;

  return (
    <div className="dispatcher-exception-management">
      <div className="dispatcher-exception-fields">
        <label className="booking-field">
          <span>Owner</span>
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            disabled={pending}
          >
            {dispatchers.map((dispatcher) => (
              <option key={dispatcher.id} value={dispatcher.id}>{dispatcher.displayName}</option>
            ))}
          </select>
        </label>
        <label className="booking-field">
          <span>Next action</span>
          <select
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            disabled={pending}
          >
            {exceptionActions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      {hasChanges ? (
        <button
          className="btn btn-secondary"
          type="button"
          disabled={pending}
          onClick={() => onUpdate(
            { ownerId, nextAction },
            "Exception owner and next action updated.",
          )}
        >
          Save case updates
        </button>
      ) : null}
      {exception.status === "open" ? (
        <button
          className="btn btn-secondary"
          type="button"
          disabled={pending}
          onClick={() => onUpdate(
            { status: "in_progress" },
            "Exception marked in progress.",
          )}
        >
          Mark in progress
        </button>
      ) : null}
      <label className="booking-field">
        <span>Resolution notes</span>
        <textarea
          value={resolutionNotes}
          onChange={(event) => setResolutionNotes(event.target.value)}
          minLength={3}
          maxLength={500}
          rows={2}
        />
      </label>
      <button
        className="btn btn-primary"
        type="button"
        disabled={pending || resolutionNotes.trim().length < 3}
        onClick={() => onUpdate(
          { status: "resolved", resolutionNotes: resolutionNotes.trim() },
          "Exception resolved and shipment returned to its prior active state.",
        )}
      >
        Resolve exception
      </button>
      <ExceptionHistory history={exception.history} />
    </div>
  );
}

function ExceptionHistory({ history = [] }) {
  return (
    <div className="dispatcher-history">
      <h4>Exception history</h4>
      {history.length ? (
        <ol>
          {[...history].reverse().map((event, index) => (
            <li key={`${event.action}-${event.timestamp}-${index}`}>
              <strong>{humanize(event.action)}</strong>
              <time dateTime={normalizeTimestamp(event.timestamp)}>{formatTimestamp(event.timestamp)}</time>
            </li>
          ))}
        </ol>
      ) : <p className="dispatcher-muted-copy">No exception history is available.</p>}
    </div>
  );
}

function findActiveException(shipment) {
  return (shipment?.operationalExceptions || []).find(
    (exception) => exception.status !== "resolved",
  );
}

function latestException(shipment) {
  return [...(shipment?.events || [])].reverse().find(
    (event) => event.status === "exception",
  );
}

function findPersonName(people, id) {
  return people.find((person) => person.id === id)?.displayName || "";
}

function categoryLabel(value) {
  return exceptionCategories.find(([category]) => category === value)?.[1] ||
    (value ? humanize(value) : "Operational issue");
}

function actionLabel(value) {
  return exceptionActions.find(([action]) => action === value)?.[1] ||
    (value ? humanize(value) : "Needs triage");
}

function eventLabel(event) {
  return humanize(event.action || event.status);
}

function humanize(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeTimestamp(value) {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : undefined;
}

function formatTimestamp(value) {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp)
    : "Time unavailable";
}
