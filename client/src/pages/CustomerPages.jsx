import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { ErrorState, LoadingState, Notice } from "../components/Feedback.jsx";

const shipmentStatuses = [
  ["all", "All shipments"],
  ["booked", "Booked"],
  ["picked_up", "Picked up"],
  ["in_transit", "In transit"],
  ["delivered", "Delivered"],
  ["exception", "Needs attention"],
];

export function CustomerDashboardPage() {
  const { getAccessToken, authMode } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [state, setState] = useState({ status: "loading", shipments: [], error: null });

  const loadShipments = useCallback(async () => {
    setState({ status: "loading", shipments: [], error: null });
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ status: statusFilter });
      const result = await apiGet(`/api/customer/shipments?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setState({ status: "ready", shipments: result.shipments, error: null });
    } catch (error) {
      setState({ status: "error", shipments: [], error });
    }
  }, [getAccessToken, statusFilter]);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  return (
    <section className="content-page customer-page">
      <div className="customer-page-heading">
        <div>
          <span className="eyebrow">CUSTOMER WORKSPACE</span>
          <h1>Your shipments</h1>
          <p className="page-intro">Book a delivery and follow its status from your account.</p>
        </div>
        <Link className="btn btn-primary" to="/app/booking">Book a shipment</Link>
      </div>

      {authMode === "development-mock" ? (
        <Notice tone="warning">
          Development-only account. Shipment data is private to this configured demo identity.
        </Notice>
      ) : null}

      <div className="shipment-list-toolbar">
        <label className="customer-filter">
          <span>Filter shipments</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {shipmentStatuses.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {state.status === "loading" ? <LoadingState label="Loading your shipments" /> : null}
      {state.status === "error" ? (
        <ErrorState
          title="Could not load shipments"
          message={state.error.message}
          onRetry={loadShipments}
        />
      ) : null}
      {state.status === "ready" && state.shipments.length === 0 ? (
        <div className="surface-card shipment-empty-state">
          <h2>{statusFilter === "all" ? "No shipments yet" : "No matching shipments"}</h2>
          <p>
            {statusFilter === "all"
              ? "When you create a booking, its reference and latest status will appear here."
              : "Try another status filter to see more of your shipments."}
          </p>
          {statusFilter === "all" ? (
            <Link className="btn btn-primary" to="/app/booking">Start a booking</Link>
          ) : null}
        </div>
      ) : null}
      {state.status === "ready" && state.shipments.length > 0 ? (
        <div className="shipment-list">
          {state.shipments.map((shipment) => (
            <Link
              className="shipment-list-card surface-card"
              key={shipment.reference}
              to={`/app/shipments/${encodeURIComponent(shipment.reference)}`}
            >
              <div>
                <span className="eyebrow">{shipment.reference}</span>
                <h2>{shipment.recipient.name}</h2>
                <p>{shipment.service.name} · {formatDate(shipment.createdAt)}</p>
              </div>
              <div className="shipment-list-meta">
                <StatusBadge status={shipment.status} />
                <strong>{formatPrice(shipment.price)}</strong>
                <span className="shipment-open-label">View details →</span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ShipmentBookingPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [optionsState, setOptionsState] = useState({
    status: "loading",
    options: null,
    error: null,
  });
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [submissionKey, setSubmissionKey] = useState(createRequestKey);
  const [form, setForm] = useState({
    pickup: emptyAddress(),
    recipient: emptyAddress(),
    parcel: { weightKg: "", length: "", width: "", height: "" },
    contentsDescription: "",
    serviceId: "",
    pickupWindowId: "",
    deliveryWindowId: "",
    acceptTerms: false,
  });

  const loadOptions = useCallback(async () => {
    setError(null);
    setOptionsState({ status: "loading", options: null, error: null });
    try {
      const token = await getAccessToken();
      const options = await apiGet("/api/customer/booking-options", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setOptionsState({ status: "ready", options, error: null });
      setForm((current) => {
        const service = options.services.find((item) => item.id === current.serviceId)
          || options.services[0];
        return {
          ...current,
          serviceId: service.id,
          pickupWindowId: service.pickupWindows[0].id,
          deliveryWindowId: service.deliveryWindows[0].id,
          acceptTerms: false,
        };
      });
    } catch (loadError) {
      setOptionsState({ status: "error", options: null, error: loadError });
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const services = optionsState.options?.services || [];
  const availableServices = useMemo(() => {
    const globalCoverage = optionsState.options?.supportedPostalCodes;
    if (!globalCoverage) return services;
    const pickupCode = form.pickup.postalCode.trim().toLowerCase();
    const recipientCode = form.recipient.postalCode.trim().toLowerCase();
    return services.filter((service) => {
      const coverage = service.supportedPostalCodes || globalCoverage;
      return coverage.includes(pickupCode) && coverage.includes(recipientCode);
    });
  }, [
    form.pickup.postalCode,
    form.recipient.postalCode,
    optionsState.options,
    services,
  ]);
  const selectedService = availableServices.find(
    (service) => service.id === form.serviceId,
  );
  const quote = useMemo(() => {
    if (!selectedService || !Number(form.parcel.weightKg)) return null;
    const base = selectedService.basePrice;
    const weight = Math.round(Number(form.parcel.weightKg) * selectedService.pricePerKg);
    return {
      currency: optionsState.options.currency,
      base,
      weight,
      total: base + weight,
    };
  }, [form.parcel.weightKg, optionsState.options, selectedService]);

  useEffect(() => {
    if (step !== 3 || availableServices.some((service) => service.id === form.serviceId)) {
      return;
    }

    const service = availableServices[0];
    setForm((current) => ({
      ...current,
      serviceId: service?.id || "",
      pickupWindowId: service?.pickupWindows[0]?.id || "",
      deliveryWindowId: service?.deliveryWindows[0]?.id || "",
    }));
  }, [availableServices, form.serviceId, step]);

  function updateForm(field, value) {
    setSubmissionKey(createRequestKey());
    setError(null);
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAddress(group, field, value) {
    setSubmissionKey(createRequestKey());
    setError(null);
    setForm((current) => ({
      ...current,
      [group]: { ...current[group], [field]: value },
    }));
  }

  function updateService(serviceId) {
    const service = availableServices.find((item) => item.id === serviceId);
    setSubmissionKey(createRequestKey());
    setError(null);
    setForm((current) => ({
      ...current,
      serviceId,
      pickupWindowId: service?.pickupWindows[0]?.id || "",
      deliveryWindowId: service?.deliveryWindows[0]?.id || "",
    }));
  }

  function continueBooking(event) {
    const fields = event.currentTarget.form?.querySelectorAll(":invalid") || [];
    if (fields.length) {
      fields[0].focus();
      fields[0].reportValidity();
      return;
    }
    setError(null);
    setStep((current) => Math.min(4, current + 1));
  }

  async function submitBooking(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const token = await getAccessToken();
      const body = {
        pickup: form.pickup,
        recipient: form.recipient,
        parcel: {
          weightKg: Number(form.parcel.weightKg),
          dimensionsCm: {
            length: Number(form.parcel.length),
            width: Number(form.parcel.width),
            height: Number(form.parcel.height),
          },
        },
        contentsDescription: form.contentsDescription,
        serviceId: form.serviceId,
        pickupWindowId: form.pickupWindowId,
        deliveryWindowId: form.deliveryWindowId,
        rulesVersion: optionsState.options.rulesVersion,
        termsVersion: optionsState.options.termsVersion,
        acceptedTerms: form.acceptTerms,
      };
      const result = await apiRequest("/api/customer/shipments", {
        method: "POST",
        headers: {
          "Idempotency-Key": submissionKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      navigate(`/app/shipments/${encodeURIComponent(result.shipment.reference)}`);
    } catch (submitError) {
      setError(submitError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-page customer-page">
      <Link className="text-link back-link" to="/app">← Your shipments</Link>
      <span className="eyebrow">NEW SHIPMENT</span>
      <h1>Book a delivery</h1>
      <p className="page-intro">
        Enter both addresses, parcel details, and review the configured price and terms before confirming.
      </p>

      {optionsState.status === "loading" ? <LoadingState label="Checking booking availability" /> : null}
      {optionsState.status === "error" ? (
        <ErrorState
          title={optionsState.error.code === "BOOKING_NOT_CONFIGURED"
            ? "Booking rules are not configured"
            : "Could not load booking options"}
          message={optionsState.error.message}
          onRetry={loadOptions}
        />
      ) : null}

      {optionsState.status === "ready" ? (
        <>
          <Notice tone="warning">
            Demo payment only. Confirming creates a shipment booking record but does not charge a payment method.
          </Notice>
          <ol className="booking-steps" aria-label="Booking steps">
            {["Addresses", "Parcel", "Service", "Review"].map((label, index) => (
              <li className={step === index + 1 ? "booking-step-active" : ""} key={label}>
                <span>{index + 1}</span>{label}
              </li>
            ))}
          </ol>

          <form className="booking-form surface-card" onSubmit={submitBooking}>
            {step === 1 ? (
              <fieldset className="booking-fieldset">
                <legend>Pickup and delivery contacts</legend>
                <div className="booking-address-grid">
                  <AddressFields
                    title="Pickup address"
                    group="pickup"
                    address={form.pickup}
                    onChange={updateAddress}
                  />
                  <AddressFields
                    title="Recipient address"
                    group="recipient"
                    address={form.recipient}
                    onChange={updateAddress}
                  />
                </div>
                <div className="booking-actions">
                  <span />
                  <button className="btn btn-primary" type="button" onClick={continueBooking}>
                    Continue to parcel
                  </button>
                </div>
              </fieldset>
            ) : null}

            {step === 2 ? (
              <fieldset className="booking-fieldset">
                <legend>Parcel details and contents</legend>
                <div className="booking-input-grid">
                  <Field label="Weight (kg)" type="number" min="0.01" step="0.01" required
                    value={form.parcel.weightKg}
                    onChange={(value) => updateForm("parcel", { ...form.parcel, weightKg: value })} />
                  {["length", "width", "height"].map((dimension) => (
                    <Field key={dimension} label={`${capitalize(dimension)} (cm)`} type="number"
                      min="0.1" step="0.1" required
                      value={form.parcel[dimension]}
                      onChange={(value) => updateForm("parcel", { ...form.parcel, [dimension]: value })} />
                  ))}
                </div>
                <Field label="Contents declaration" as="textarea" required minLength={3} maxLength={300}
                  hint="Describe what is in the parcel. Address support and item restrictions are not externally verified."
                  value={form.contentsDescription}
                  onChange={(value) => updateForm("contentsDescription", value)} />
                <div className="booking-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>Back</button>
                  <button className="btn btn-primary" type="button" onClick={continueBooking}>
                    Continue to service
                  </button>
                </div>
              </fieldset>
            ) : null}

            {step === 3 ? (
              <fieldset className="booking-fieldset">
                <legend>Service and time windows</legend>
                <div className="service-option-list">
                  {availableServices.map((service) => (
                    <label className={`service-option${form.serviceId === service.id ? " service-option-selected" : ""}`}
                      key={service.id}>
                      <input type="radio" name="serviceId" value={service.id}
                        checked={form.serviceId === service.id}
                        onChange={() => updateService(service.id)} />
                      <span>
                        <strong>{service.name}</strong>
                        <span>{service.description}</span>
                        <span className="service-option-limit">
                          Up to {service.maxWeightKg} kg · {service.maxDimensionsCm.length} × {service.maxDimensionsCm.width} × {service.maxDimensionsCm.height} cm
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {!availableServices.length ? (
                  <Notice tone="warning">
                    No service covers both postal codes. Go back and check the pickup and recipient postcodes.
                  </Notice>
                ) : null}
                {selectedService ? (
                  <div className="booking-input-grid">
                    <label className="booking-field">
                      <span>Pickup window</span>
                      <select required value={form.pickupWindowId}
                        onChange={(event) => updateForm("pickupWindowId", event.target.value)}>
                        {selectedService.pickupWindows.map((window) => (
                          <option key={window.id} value={window.id}>{window.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="booking-field">
                      <span>Delivery window</span>
                      <select required value={form.deliveryWindowId}
                        onChange={(event) => updateForm("deliveryWindowId", event.target.value)}>
                        {selectedService.deliveryWindows.map((window) => (
                          <option key={window.id} value={window.id}>{window.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                {quote ? <PriceBreakdown price={quote} /> : null}
                <div className="booking-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => setStep(2)}>Back</button>
                  <button className="btn btn-primary" type="button" onClick={continueBooking}
                    disabled={!selectedService}>
                    Review booking
                  </button>
                </div>
              </fieldset>
            ) : null}

            {step === 4 ? (
              <fieldset className="booking-fieldset">
                <legend>Review and confirm</legend>
                <div className="booking-review-grid">
                  <ReviewAddress title="Pickup" address={form.pickup} />
                  <ReviewAddress title="Recipient" address={form.recipient} />
                </div>
                <div className="booking-review-card">
                  <h2>Parcel and service</h2>
                  <p>{form.contentsDescription}</p>
                  <p>
                    {form.parcel.weightKg} kg · {form.parcel.length} × {form.parcel.width} × {form.parcel.height} cm
                  </p>
                  <p>{selectedService?.name}</p>
                  <p>Pickup: {windowLabel(selectedService?.pickupWindows, form.pickupWindowId)}</p>
                  <p>Delivery: {windowLabel(selectedService?.deliveryWindows, form.deliveryWindowId)}</p>
                  {quote ? <PriceBreakdown price={quote} /> : null}
                </div>
                <div className="booking-terms">
                  <h2>Terms · {optionsState.options.termsVersion}</h2>
                  <p>{optionsState.options.termsText}</p>
                  <label className="booking-checkbox">
                    <input type="checkbox" required checked={form.acceptTerms}
                      onChange={(event) => updateForm("acceptTerms", event.target.checked)} />
                    <span>I have reviewed and agree to these booking terms.</span>
                  </label>
                </div>
                {error ? (
                  <div className="booking-submit-error" role="alert">
                    <strong>{error.message}</strong>
                    {error.fields ? (
                      <ul>{Object.values(error.fields).map((message) => <li key={message}>{message}</li>)}</ul>
                    ) : null}
                    {error.code === "BOOKING_RULES_CHANGED" ? (
                      <button className="btn btn-ghost" type="button" onClick={loadOptions}>
                        Reload updated price and terms
                      </button>
                    ) : null}
                    <span>Correct the details or retry. A repeated request uses the same booking key safely.</span>
                  </div>
                ) : null}
                <div className="booking-actions">
                  <button className="btn btn-ghost" type="button" disabled={saving}
                    onClick={() => setStep(3)}>Back</button>
                  <button className="btn btn-primary" type="submit" disabled={saving || !quote}>
                    {saving ? "Creating booking…" : "Confirm demo booking — no charge"}
                  </button>
                </div>
              </fieldset>
            ) : null}
          </form>
        </>
      ) : null}
    </section>
  );
}

export function ShipmentDetailPage() {
  const { reference } = useParams();
  const { getAccessToken } = useAuth();
  const [state, setState] = useState({ status: "loading", shipment: null, error: null });

  const loadShipment = useCallback(async () => {
    setState({ status: "loading", shipment: null, error: null });
    try {
      const token = await getAccessToken();
      const result = await apiGet(
        `/api/customer/shipments/${encodeURIComponent(reference)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setState({ status: "ready", shipment: result.shipment, error: null });
    } catch (error) {
      setState({ status: "error", shipment: null, error });
    }
  }, [getAccessToken, reference]);

  useEffect(() => {
    loadShipment();
  }, [loadShipment]);

  return (
    <section className="content-page customer-page">
      <Link className="text-link back-link" to="/app">← Your shipments</Link>
      {state.status === "loading" ? <LoadingState label="Loading shipment details" /> : null}
      {state.status === "error" ? (
        <ErrorState title="Could not load this shipment" message={state.error.message} onRetry={loadShipment} />
      ) : null}
      {state.status === "ready" ? <ShipmentDetails shipment={state.shipment} /> : null}
    </section>
  );
}

function ShipmentDetails({ shipment }) {
  return (
    <>
      <span className="eyebrow">SHIPMENT · {shipment.reference}</span>
      <h1>Shipment details</h1>
      <div className="shipment-detail-heading">
        <StatusBadge status={shipment.status} />
        <span>Booked {formatDate(shipment.createdAt)}</span>
      </div>
      <div className="shipment-detail-grid">
        <section className="surface-card">
          <h2>Shipment timeline</h2>
          <ol className="shipment-timeline">
            {shipment.events.map((event, index) => (
              <li key={`${event.status}-${event.timestamp}-${index}`}>
                <span className="timeline-dot" aria-hidden="true" />
                <div><strong>{humanize(event.status)}</strong><time>{formatDate(event.timestamp)}</time></div>
              </li>
            ))}
          </ol>
          <p className="muted-copy">Updates appear when the operations system records a shipment event.</p>
        </section>
        <section className="surface-card">
          <h2>Pickup and recipient</h2>
          <address>
            <strong>Pickup</strong><br />
            {shipment.pickup.name}<br />{shipment.pickup.line1}<br />
            {shipment.pickup.city} {shipment.pickup.postalCode}<br />{shipment.pickup.phone}
          </address>
          <address>
            <strong>Recipient</strong><br />
            {shipment.recipient.name}<br />{shipment.recipient.line1}<br />
            {shipment.recipient.city} {shipment.recipient.postalCode}<br />{shipment.recipient.phone}
          </address>
        </section>
        <section className="surface-card shipment-receipt">
          <span className="eyebrow">BOOKING RECEIPT · {shipment.reference}</span>
          <h2>{shipment.service.name}</h2>
          <p>{shipment.parcel.weightKg} kg · {shipment.contentsDescription}</p>
          <PriceBreakdown price={shipment.price} />
          <p className="payment-boundary">
            Payment: <strong>Demo only — not charged</strong>. No payment provider is connected.
          </p>
        </section>
      </div>
    </>
  );
}

function AddressFields({ title, group, address, onChange }) {
  return (
    <fieldset className="address-field-group">
      <legend>{title}</legend>
      <Field label="Full name" required maxLength={100} value={address.name}
        onChange={(value) => onChange(group, "name", value)} />
      <Field label="Phone" type="tel" required maxLength={24} value={address.phone}
        onChange={(value) => onChange(group, "phone", value)} />
      <Field label="Street address" required maxLength={200} value={address.line1}
        onChange={(value) => onChange(group, "line1", value)} />
      <div className="booking-input-grid">
        <Field label="City" required maxLength={100} value={address.city}
          onChange={(value) => onChange(group, "city", value)} />
        <Field label="Postal code" required maxLength={20} value={address.postalCode}
          onChange={(value) => onChange(group, "postalCode", value)} />
      </div>
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  as = "input",
  required = false,
  min,
  max,
  step,
  minLength,
  maxLength,
  hint,
}) {
  const Component = as;
  const props = {
    value,
    required,
    min,
    max,
    step,
    minLength,
    maxLength,
    onChange: (event) => onChange(event.target.value),
  };
  return (
    <label className="booking-field">
      <span>{label}{required ? " *" : ""}</span>
      <Component {...props} {...(as === "input" ? { type } : {})} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function ReviewAddress({ title, address }) {
  return (
    <section className="booking-review-card">
      <h2>{title}</h2>
      <p><strong>{address.name}</strong><br />{address.line1}<br />
        {address.city} {address.postalCode}<br />{address.phone}</p>
    </section>
  );
}

function PriceBreakdown({ price }) {
  return (
    <dl className="price-breakdown">
      <div><dt>Service fee</dt><dd>{formatPriceAmount(price.base, price.currency)}</dd></div>
      <div><dt>Weight charge</dt><dd>{formatPriceAmount(price.weight, price.currency)}</dd></div>
      <div className="price-total"><dt>Total</dt><dd>{formatPrice(price)}</dd></div>
    </dl>
  );
}

function StatusBadge({ status }) {
  return <span className={`shipment-status shipment-status-${status}`}>{humanize(status)}</span>;
}

function emptyAddress() {
  return { name: "", phone: "", line1: "", city: "", postalCode: "" };
}

function createRequestKey() {
  return globalThis.crypto?.randomUUID?.()
    || `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatPrice(price) {
  return formatPriceAmount(price.total, price.currency);
}

function formatPriceAmount(amount, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function humanize(value) {
  return value.replaceAll("_", " ");
}

function windowLabel(windows = [], id) {
  return windows.find((window) => window.id === id)?.label || "Not selected";
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}
