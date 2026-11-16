import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { Notice } from "../components/Feedback.jsx";

const sampleServices = [
  {
    id: "city-standard",
    category: "City delivery",
    name: "City Standard",
    description: "A flexible option for everyday parcels within the metro area.",
    areaSummary: "Dhaka metro",
    serviceArea: "Dhaka, Gazipur, and Narayanganj",
    maxWeight: "10 kg",
    maxDimensions: "60 × 40 × 40 cm",
    deliverySummary: "1–2 business days",
    deliveryWindows: ["9:00 AM–1:00 PM", "1:00 PM–6:00 PM"],
  },
  {
    id: "city-express",
    category: "Priority delivery",
    name: "City Express",
    description: "A faster sample option for time-sensitive city deliveries.",
    areaSummary: "Dhaka metro",
    serviceArea: "Selected areas of Dhaka city",
    maxWeight: "5 kg",
    maxDimensions: "40 × 30 × 30 cm",
    deliverySummary: "Same day",
    deliveryWindows: ["10:00 AM–2:00 PM", "2:00 PM–7:00 PM"],
  },
  {
    id: "nationwide",
    category: "Intercity delivery",
    name: "Nationwide",
    description: "A practical example for parcels traveling between cities.",
    areaSummary: "Selected city routes",
    serviceArea: "Dhaka, Chattogram, Sylhet, Khulna, and Rajshahi",
    maxWeight: "10 kg",
    maxDimensions: "60 × 50 × 40 cm",
    deliverySummary: "2–3 business days",
    deliveryWindows: ["Weekday daytime", "Saturday daytime"],
  },
];

const sampleRates = [
  {
    name: "City Standard",
    amount: "৳60",
    deliveryWindow: "1–2 business days",
    description: "An easy choice for everyday local deliveries.",
  },
  {
    name: "City Express",
    amount: "৳100",
    deliveryWindow: "Same day",
    description: "Priority handling for time-sensitive city parcels.",
  },
  {
    name: "Nationwide",
    amount: "৳130",
    deliveryWindow: "2–3 business days",
    description: "A practical option for longer-distance deliveries.",
  },
];

export function BookingInfoPage() {
  const { user } = useAuth();

  return (
    <section className="content-page narrow-page">
      <span className="eyebrow">BOOK A DELIVERY</span>
      <h1>Book from your customer workspace.</h1>
      <p className="page-intro">
        The guided flow checks configured coverage, parcel limits, delivery
        windows, prices, and terms before a booking can be confirmed.
      </p>
      <Notice tone="warning">
        Payments are not connected. Any available booking uses a demo boundary
        and will not charge a payment method.
      </Notice>
      <div className="welcome-actions">
        <Link className="btn btn-primary" to={user?.role === "customer" ? "/app/booking" : "/login"}>
          {user?.role === "customer" ? "Continue to booking" : "Sign in to book"}
        </Link>
        <Link className="btn btn-ghost" to="/services">View service status</Link>
      </div>
    </section>
  );
}

export function ServicesPage() {
  const [selectedServiceId, setSelectedServiceId] = useState(sampleServices[0].id);
  const selectedService = sampleServices.find(
    ({ id }) => id === selectedServiceId,
  );

  return (
    <section className="content-page services-page">
      <header className="services-hero">
        <div className="services-hero-copy">
          <span className="eyebrow">DELIVERY SERVICES</span>
          <h1>Choose a delivery that fits your parcel.</h1>
          <p className="page-intro">
            Compare example service areas, parcel limits, and delivery windows.
            Final options depend on the rules configured for booking.
          </p>
        </div>
        <div className="services-preview-badge" aria-label="Sample information, not live service details">
          <span aria-hidden="true">✦</span>
          <strong>Service guide preview</strong>
          <span>Explore sample options</span>
        </div>
      </header>

      <Notice tone="warning">
        All service areas, parcel limits, and delivery windows on this page are
        fictional examples for preview only. They are not connected to live
        service rules or a coverage checker.
      </Notice>

      <section className="services-explorer" aria-labelledby="services-options-title">
        <div className="services-section-heading">
          <div>
            <span className="eyebrow">COMPARE OPTIONS</span>
            <h2 id="services-options-title">Find your sample service</h2>
          </div>
          <p>Select an option to see its example coverage and parcel details.</p>
        </div>

        <div className="service-option-grid" aria-label="Sample delivery options">
          {sampleServices.map((service) => (
            <button
              aria-pressed={selectedServiceId === service.id}
              className={`service-option${selectedServiceId === service.id ? " service-option-active" : ""}`}
              key={service.id}
              onClick={() => setSelectedServiceId(service.id)}
              type="button"
            >
              <span className="service-option-category">{service.category}</span>
              <strong className="service-option-name">{service.name}</strong>
              <span className="service-option-description">{service.description}</span>
              <span className="service-option-facts">
                <span>{service.areaSummary}</span>
                <span>{service.deliverySummary}</span>
              </span>
            </button>
          ))}
        </div>

        <section
          aria-live="polite"
          aria-labelledby="service-details-title"
          className="service-details surface-card"
        >
          <div className="service-details-heading">
            <div>
              <span className="eyebrow">SAMPLE DETAILS</span>
              <h2 id="service-details-title">{selectedService.name}</h2>
            </div>
            <span className="service-details-chip">Example only</span>
          </div>
          <dl className="service-details-grid">
            <div>
              <dt>Sample service area</dt>
              <dd>{selectedService.serviceArea}</dd>
            </div>
            <div>
              <dt>Parcel limit</dt>
              <dd>
                Up to {selectedService.maxWeight}
                <span>Maximum size: {selectedService.maxDimensions}</span>
              </dd>
            </div>
            <div>
              <dt>Estimated delivery</dt>
              <dd>{selectedService.deliverySummary}</dd>
            </div>
            <div className="service-delivery-windows">
              <dt>Example delivery windows</dt>
              <dd>
                <ul>
                  {selectedService.deliveryWindows.map((window) => (
                    <li key={window}>{window}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <p className="service-details-footnote">
            In a live booking, both postal codes and parcel measurements would
            be checked against the selected service’s configured rules.
          </p>
        </section>
      </section>

      <div className="services-bottom-callout">
        <div>
          <span className="eyebrow">NEXT STEP</span>
          <h2>See what’s configured for your booking.</h2>
          <p>Booking checks current service rules before showing available options.</p>
        </div>
        <div className="services-actions">
          <Link className="btn btn-primary" to="/book">Explore booking</Link>
          <Link className="btn btn-ghost" to="/pricing">View sample pricing</Link>
        </div>
      </div>
    </section>
  );
}

export function PricingPage() {
  return (
    <section className="content-page pricing-page">
      <span className="eyebrow">PRICING</span>
      <h1>Sample delivery prices</h1>
      <p className="page-intro">
        Choose a delivery style to explore. These example rates are for preview
        purposes only.
      </p>
      <div className="pricing-grid">
        {sampleRates.map((rate) => (
          <article className="pricing-card" key={rate.name}>
            <span className="pricing-tier">Example rate</span>
            <h2>{rate.name}</h2>
            <p className="pricing-description">{rate.description}</p>
            <p className="pricing-amount">
              <strong>{rate.amount}</strong>
              <span> / parcel</span>
            </p>
            <ul className="pricing-details">
              <li>First 1 kg included</li>
              <li>{rate.deliveryWindow} estimate</li>
            </ul>
          </article>
        ))}
      </div>
      <p className="pricing-disclaimer" role="note">
        Demo pricing only: all rates are fictional BDT examples. Extra weight,
        service area, and parcel details may change a real quote. The booking
        flow uses configured service rules and shows its calculated price before
        confirmation.
      </p>
      <Link className="btn btn-primary" to="/book">Open booking</Link>
    </section>
  );
}

export function HelpPage() {
  return (
    <section className="content-page">
      <span className="eyebrow">HELP CENTER</span>
      <h1>What you can do in this preview.</h1>
      <p className="page-intro">
        Customer booking is available only when sign-in, storage, published
        service rules, and terms are configured for the current environment.
      </p>
      <div className="help-grid">
        <InfoCard title="Can I book a parcel?" status="Setup required">
          Booking requires a customer account, MongoDB, and configured service
          rules. Online payments are not connected.
        </InfoCard>
        <InfoCard title="Can I see a shipment’s location?" status="Not yet">
          Tracking data and live location services are not connected. No live
          map or delivery estimate is shown.
        </InfoCard>
        <InfoCard title="How can I contact support?" status="Not configured">
          A support email address and phone number have not been provided.
          We won’t display a made-up contact channel.
        </InfoCard>
      </div>
      <Notice>
        Do not enter real shipment or personal details unless the operator has
        confirmed that this environment is approved for them. No payment
        provider, external address lookup, or support channel is connected.
      </Notice>
    </section>
  );
}

export function PolicyPage({ type }) {
  const isPrivacy = type === "privacy";

  return (
    <section className="content-page narrow-page">
      <span className="eyebrow">{isPrivacy ? "PRIVACY" : "TERMS OF SERVICE"}</span>
      <h1>{isPrivacy ? "Privacy notice not published." : "Terms are not published."}</h1>
      <p className="page-intro">
        {isPrivacy
          ? "A complete privacy notice has not been supplied for this preview."
          : "Terms of service have not been supplied for this preview."}
      </p>
      <Notice tone="warning">
        This page is not a legal policy. Do not use the preview for real
        shipments or submit personal or payment information.
      </Notice>
      <p className="policy-next-step">
        {isPrivacy
          ? "Before launch, publish the data collected, purposes, retention periods, processors, user rights, and a real privacy contact."
          : "Before launch, publish service terms, delivery and cancellation rules, claims handling, payment conditions, and a real support contact."}
      </p>
      <Link className="text-link back-link" to="/help">Visit help</Link>
    </section>
  );
}

function InfoCard({ title, status, children }) {
  return (
    <article className="info-card surface-card">
      <span className="status-label">{status}</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </article>
  );
}
