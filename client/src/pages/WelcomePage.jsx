import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiCheckCircle, FiClipboard, FiEdit3, FiTruck } from "react-icons/fi";
import { TrackLookupForm } from "./TrackingPage.jsx";
import { PartnerSection } from "../components/PartnerSection.jsx";

const banners = [
  {
    id: "local-route",
    eyebrow: "LOCAL DELIVERY, MADE CLEAR",
    title: "A clearer journey from pickup to doorstep.",
    description:
      "We’re shaping a straightforward way to arrange local deliveries. Booking is not live yet.",
    image: "/images/delivery-van.svg",
    imageAlt: "Illustration of a parcel van on a delivery route",
  },
  {
    id: "careful-handoff",
    eyebrow: "EVERY HANDOFF MATTERS",
    title: "Careful delivery starts with a clear handoff.",
    description:
      "A courier-first workflow is taking shape, with thoughtful pickup and delivery steps.",
    image: "/images/courier-bike.svg",
    imageAlt: "Illustration of a bicycle courier carrying a parcel",
  },
  {
    id: "doorstep",
    eyebrow: "THE LAST MILE, LESS GUESSWORK",
    title: "Know what happens next at every step.",
    description:
      "We’re building privacy-conscious shipment updates. Live tracking data is not connected yet.",
    image: "/images/parcel-doorstep.svg",
    imageAlt: "Illustration of parcels safely left beside a front door",
  },
];

const slideVariants = {
  enter: (direction) => ({
    opacity: 0,
    x: direction > 0 ? 48 : -48,
  }),
  center: {
    opacity: 1,
    x: 0,
  },
  exit: (direction) => ({
    opacity: 0,
    x: direction > 0 ? -48 : 48,
  }),
};

const slideTransition = {
  duration: 0.48,
  ease: [0.22, 0.61, 0.36, 1],
};

const testimonials = [
  {
    quote: "The clear pickup steps made it easy to know what to prepare before a delivery.",
    name: "Nadia Rahman",
    detail: "Sample customer",
    service: "Pickup planning",
    initials: "NR",
  },
  {
    quote: "I liked having the parcel details and delivery terms together in one place.",
    name: "Imran Hossain",
    detail: "Sample small-business owner",
    service: "Parcel details",
    initials: "IH",
  },
  {
    quote: "A simple status history would make it much easier to keep my customers informed.",
    name: "Farah Ahmed",
    detail: "Sample shop owner",
    service: "Delivery updates",
    initials: "FA",
  },
  {
    quote: "The booking flow feels straightforward, especially when arranging a local delivery.",
    name: "Rafiq Karim",
    detail: "Sample customer",
    service: "Local delivery",
    initials: "RK",
  },
  {
    quote: "Knowing what happens at each handoff is exactly what I look for in a delivery service.",
    name: "Sadia Islam",
    detail: "Sample customer",
    service: "Careful handoffs",
    initials: "SI",
  },
  {
    quote: "I appreciate seeing service details before deciding how to send a parcel.",
    name: "Tanvir Chowdhury",
    detail: "Sample online seller",
    service: "Service guide",
    initials: "TC",
  },
  {
    quote: "A clear delivery confirmation would give both me and the recipient peace of mind.",
    name: "Maliha Sultana",
    detail: "Sample customer",
    service: "Delivery confirmation",
    initials: "MS",
  },
  {
    quote: "The focus on careful handoffs makes this feel designed around real delivery needs.",
    name: "Arif Mahmud",
    detail: "Sample customer",
    service: "Careful handoffs",
    initials: "AM",
  },
  {
    quote: "I want a delivery experience that is easy to understand from booking to doorstep.",
    name: "Jannat Akter",
    detail: "Sample local seller",
    service: "Local delivery",
    initials: "JA",
  },
];

const serviceOverview = [
  {
    label: "Customer booking",
    value: "Setup required",
    description: "Accounts and delivery rules must be configured.",
  },
  {
    label: "Live tracking",
    value: "Not connected",
    description: "Live shipment location data is not available.",
  },
  {
    label: "Online payments",
    value: "Not connected",
    description: "No payment provider is configured.",
  },
  {
    label: "Customer stories",
    value: "Sample only",
    description: "These fictional examples are not real reviews.",
  },
];

export function WelcomePage() {
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [manualAutoplayOverride, setManualAutoplayOverride] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [activeTestimonialIndex, setActiveTestimonialIndex] = useState(0);
  const [testimonialAutoplayEnabled, setTestimonialAutoplayEnabled] = useState(true);
  const [isTestimonialHovered, setIsTestimonialHovered] = useState(false);
  const [isTestimonialFocused, setIsTestimonialFocused] = useState(false);
  const activeBanner = banners[activeIndex];
  const isPaused =
    ((isHovered || isFocused) && !manualAutoplayOverride) ||
    !autoPlayEnabled ||
    prefersReducedMotion === true;
  const isTestimonialPaused =
    isTestimonialHovered ||
    isTestimonialFocused ||
    !testimonialAutoplayEnabled ||
    prefersReducedMotion === true;

  useEffect(() => {
    if (isPaused) return undefined;

    const timer = window.setInterval(() => {
      setDirection(1);
      setActiveIndex((index) => (index + 1) % banners.length);
    }, 6500);

    return () => window.clearInterval(timer);
  }, [activeIndex, isPaused]);

  useEffect(() => {
    if (isTestimonialPaused) return undefined;

    const timer = window.setInterval(() => {
      setActiveTestimonialIndex((index) => (index + 1) % testimonials.length);
    }, 5500);

    return () => window.clearInterval(timer);
  }, [activeTestimonialIndex, isTestimonialPaused]);

  function showBanner(nextIndex) {
    if (nextIndex === activeIndex) return;
    setDirection(nextIndex > activeIndex ? 1 : -1);
    setActiveIndex(nextIndex);
  }

  function showPrevious() {
    showBanner((activeIndex - 1 + banners.length) % banners.length);
  }

  function showNext() {
    setDirection(1);
    setActiveIndex((index) => (index + 1) % banners.length);
  }

  function toggleAutoplay() {
    if (autoPlayEnabled) {
      setAutoPlayEnabled(false);
      setManualAutoplayOverride(false);
      return;
    }

    setAutoPlayEnabled(true);
    setManualAutoplayOverride(true);
  }

  function showTestimonial(nextIndex) {
    setActiveTestimonialIndex(
      (nextIndex + testimonials.length) % testimonials.length,
    );
  }

  function getTestimonialPosition(index) {
    const total = testimonials.length;
    let offset = (index - activeTestimonialIndex + total) % total;
    if (offset > total / 2) offset -= total;
    return offset;
  }

  return (
    <div className="home-page">
      <section
        className="welcome-carousel"
        aria-label="Delivery highlights"
        aria-roledescription="carousel"
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsFocused(false);
            setManualAutoplayOverride(false);
          }
        }}
        onFocusCapture={() => setIsFocused(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="welcome-copy">
          <div
            className="hero-copy-stage"
            aria-live={isPaused ? "polite" : "off"}
            aria-atomic="true"
          >
            <AnimatePresence initial={false} mode="wait" custom={direction}>
              <motion.div
                key={activeBanner.id}
                className="hero-slide-copy"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={prefersReducedMotion ? { duration: 0 } : slideTransition}
                role="group"
                aria-roledescription="slide"
                aria-label={`Slide ${activeIndex + 1} of ${banners.length}`}
              >
                <span className="eyebrow">{activeBanner.eyebrow}</span>
                <h1>{activeBanner.title}</h1>
                <p className="welcome-lede">{activeBanner.description}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="welcome-actions">
            <Link className="btn btn-primary" to="/book">
              Book a delivery
            </Link>
            <Link className="btn btn-ghost" to="/track">
              Track a parcel
            </Link>
          </div>

          <div className="carousel-control-bar">
            <div className="carousel-controls" role="group" aria-label="Banner controls">
              <button
                className="carousel-arrow"
                type="button"
                aria-label="Previous banner"
                onClick={showPrevious}
              >
                <span aria-hidden="true">←</span>
              </button>
              <div className="carousel-dots" role="group" aria-label="Choose a banner">
                {banners.map((banner, index) => (
                  <button
                    key={banner.id}
                    className={`carousel-dot${index === activeIndex ? " carousel-dot-active" : ""}`}
                    type="button"
                    aria-label={`Show banner ${index + 1}: ${banner.title}`}
                    aria-pressed={index === activeIndex}
                    onClick={() => showBanner(index)}
                  />
                ))}
              </div>
              <button
                className="carousel-arrow"
                type="button"
                aria-label="Next banner"
                onClick={showNext}
              >
                <span aria-hidden="true">→</span>
              </button>
            </div>
            {prefersReducedMotion !== true ? (
              <button
                className="carousel-autoplay"
                type="button"
                aria-label={autoPlayEnabled ? "Pause automatic slides" : "Resume automatic slides"}
                onClick={toggleAutoplay}
              >
                {autoPlayEnabled ? "Pause" : "Play"}
              </button>
            ) : (
              <span className="carousel-motion-note">Auto-play off for reduced motion</span>
            )}
          </div>
        </div>

        <div className="welcome-art">
          <span className="art-glow" aria-hidden="true" />
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.img
              key={activeBanner.id}
              className="welcome-image"
              src={activeBanner.image}
              alt={activeBanner.imageAlt}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={prefersReducedMotion ? { duration: 0 } : slideTransition}
              draggable="false"
            />
          </AnimatePresence>
        </div>
      </section>

      <PartnerSection />

      <section
        className="home-testimonials"
        aria-label="Sample customer stories"
        aria-roledescription="carousel"
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsTestimonialFocused(false);
          }
        }}
        onFocusCapture={() => setIsTestimonialFocused(true)}
        onMouseEnter={() => setIsTestimonialHovered(true)}
        onMouseLeave={() => setIsTestimonialHovered(false)}
      >
        <div className="testimonial-inner">
          <div className="testimonial-overview">
            <div className="testimonials-heading">
              <span className="eyebrow">DELIVERY AT A GLANCE</span>
              <h2>Clear expectations, every step of the way.</h2>
              <p>Here’s what’s available in this delivery-service preview today.</p>
            </div>
            <div className="testimonial-metric-grid" aria-label="Current service information">
              {serviceOverview.map((item) => (
                <article className="testimonial-metric" key={item.label}>
                  <span className="testimonial-metric-label">{item.label}</span>
                  <strong>{item.value}</strong>
                  <span className="testimonial-metric-description">{item.description}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="testimonial-stories">
            <div className="testimonials-heading">
              <span className="eyebrow">CUSTOMER STORIES</span>
              <h2>Thoughtful delivery, from pickup to doorstep.</h2>
              <p>Illustrative stories about the experience we’re working toward.</p>
            </div>
            <div
              className="testimonial-stage"
              aria-live={isTestimonialPaused ? "polite" : "off"}
              aria-atomic="true"
            >
              {testimonials.map((item, index) => {
                const position = getTestimonialPosition(index);
                if (Math.abs(position) > 1) return null;

                const positionClass = position === 0
                  ? "testimonial-card-active"
                  : position < 0
                    ? "testimonial-card-previous"
                    : "testimonial-card-next";

                return (
                  <article
                    key={item.name}
                    className={`testimonial-card surface-card ${positionClass}`}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`Slide ${index + 1} of ${testimonials.length}`}
                  >
                    <div className="testimonial-profile">
                      <span className="testimonial-avatar" aria-hidden="true">
                        {item.initials}
                      </span>
                      <div className="testimonial-author">
                        <strong>{item.name}</strong>
                        <span>{item.detail}</span>
                      </div>
                      <span className="testimonial-service">{item.service}</span>
                    </div>
                    <div className="testimonial-review">
                      <span className="testimonial-quote-mark" aria-hidden="true">“</span>
                      <blockquote>{item.quote}</blockquote>
                      <span className="testimonial-sample-label">Illustrative sample</span>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="testimonial-controls">
              <button
                className="carousel-arrow"
                type="button"
                aria-label="Previous testimonial"
                onClick={() => showTestimonial(activeTestimonialIndex - 1)}
              >
                <span aria-hidden="true">←</span>
              </button>
              <div className="testimonial-dots" role="group" aria-label="Choose a testimonial">
                {testimonials.map((item, index) => (
                  <button
                    key={item.name}
                    className={`testimonial-dot${index === activeTestimonialIndex ? " testimonial-dot-active" : ""}`}
                    type="button"
                    aria-label={`Go to testimonial ${index + 1}`}
                    aria-pressed={index === activeTestimonialIndex}
                    onClick={() => showTestimonial(index)}
                  />
                ))}
              </div>
              <button
                className="carousel-arrow"
                type="button"
                aria-label="Next testimonial"
                onClick={() => showTestimonial(activeTestimonialIndex + 1)}
              >
                <span aria-hidden="true">→</span>
              </button>
              {prefersReducedMotion !== true ? (
                <button
                  className="carousel-autoplay"
                  type="button"
                  aria-label={
                    testimonialAutoplayEnabled
                      ? "Pause testimonial autoplay"
                      : "Resume testimonial autoplay"
                  }
                  onClick={() => setTestimonialAutoplayEnabled((enabled) => !enabled)}
                >
                  {testimonialAutoplayEnabled ? "Pause" : "Play"}
                </button>
              ) : (
                <span className="carousel-motion-note">Auto-play off for reduced motion</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="home-tracking surface-card" aria-labelledby="tracking-title">
        <div>
          <span className="eyebrow">ALREADY HAVE A PARCEL?</span>
          <h2 id="tracking-title">Track a delivery</h2>
          <p>Enter a tracking code to check whether public tracking is available.</p>
        </div>
        <TrackLookupForm compact />
      </section>

      <section className="home-section" aria-labelledby="how-title">
        <div className="section-heading">
          <span className="eyebrow">DELIVERY, STEP BY STEP</span>
          <h2 id="how-title">From booking to doorstep.</h2>
          <p>This is the delivery journey we’re building toward; not every step is live yet.</p>
        </div>
        <ol className="feature-grid delivery-steps" aria-label="Delivery process">
          <li className="feature-card surface-card">
            <div className="delivery-step-meta">
              <span className="delivery-step-icon" aria-hidden="true"><FiEdit3 /></span>
              <span className="feature-number">01</span>
            </div>
            <h3>Book your delivery</h3>
            <p>Enter pickup, destination, and parcel details, then review the service terms.</p>
          </li>
          <li className="feature-card surface-card">
            <div className="delivery-step-meta">
              <span className="delivery-step-icon" aria-hidden="true"><FiClipboard /></span>
              <span className="feature-number">02</span>
            </div>
            <h3>Get booking details</h3>
            <p>Review your booking summary and keep the tracking reference for later.</p>
          </li>
          <li className="feature-card surface-card">
            <div className="delivery-step-meta">
              <span className="delivery-step-icon" aria-hidden="true"><FiTruck /></span>
              <span className="feature-number">03</span>
            </div>
            <h3>Hand over your parcel</h3>
            <p>Prepare the parcel for pickup and follow its status as it moves through delivery.</p>
          </li>
          <li className="feature-card surface-card">
            <div className="delivery-step-meta">
              <span className="delivery-step-icon" aria-hidden="true"><FiCheckCircle /></span>
              <span className="feature-number">04</span>
            </div>
            <h3>Confirm delivery</h3>
            <p>Check for a delivery confirmation or the next step if an attempt is unsuccessful.</p>
          </li>
        </ol>
      </section>

      <section className="home-service-callout">
        <div>
          <span className="eyebrow">SERVICE AVAILABILITY</span>
          <h2>Coverage and rates are still being configured.</h2>
          <p>We won’t show estimated prices or promise a delivery window until the service rules are in place.</p>
        </div>
        <Link className="btn btn-outline" to="/pricing">View pricing status</Link>
      </section>
    </div>
  );
}

function FeatureCard({ number, title, children }) {
  return (
    <article className="feature-card surface-card">
      <span className="feature-number">{number}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}
