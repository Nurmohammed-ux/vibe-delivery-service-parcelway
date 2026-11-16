import { Component, lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { FiArrowRight, FiLogOut, FiMoon, FiSun } from "react-icons/fi";
import { useAuth } from "./auth/AuthContext.jsx";
import { ErrorState, LoadingState, Notice } from "./components/Feedback.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import {
  BookingInfoPage,
  HelpPage,
  PolicyPage,
  PricingPage,
  ServicesPage,
} from "./pages/PublicPages.jsx";
import { TrackingPage } from "./pages/TrackingPage.jsx";
import { StatusPage } from "./pages/StatusPage.jsx";
import { WelcomePage } from "./pages/WelcomePage.jsx";
import { WorkspacePage } from "./pages/WorkspacePage.jsx";
import {
  CustomerDashboardPage,
  ShipmentBookingPage,
  ShipmentDetailPage,
} from "./pages/CustomerPages.jsx";

const roleHomePaths = {
  customer: "/app",
  recipient: "/recipient",
  courier: "/courier",
  dispatcher: "/ops",
  admin: "/admin",
};

const roleLabels = {
  customer: "Customer",
  recipient: "Recipient",
  courier: "Courier",
  dispatcher: "Dispatcher",
  admin: "Administrator",
};
const themeStorageKey = "parcelway-theme";

const workspaceRoutes = [
  { path: "/app", role: "customer" },
  { path: "/recipient", role: "recipient" },
  { path: "/courier", role: "courier" },
  { path: "/ops", role: "dispatcher", allowedRoles: ["dispatcher", "admin"] },
  { path: "/admin", role: "admin" },
];

const LocationsPage = lazy(() =>
  import("./pages/LocationsPage.jsx").then(({ LocationsPage: page }) => ({
    default: page,
  })),
);

export function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

function AppLayout() {
  const { user, authMode, signOut } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
    setSignOutError(null);
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(themeStorageKey, nextTheme);
    setTheme(nextTheme);
  }

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(error.message);
    } finally {
      setSigningOut(false);
    }
  }

  function handleNewsletterSubmit(event) {
    event.preventDefault();
    setNewsletterMessage("Newsletter signup isn’t connected yet. No email was sent or saved.");
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Parcelway home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>parcelway</span>
        </Link>
        <nav
          id="primary-navigation"
          className={`site-nav${navOpen ? " site-nav-open" : ""}`}
          aria-label="Main navigation"
        >
          <NavLink end to="/" className={navClass}>Home</NavLink>
          <NavLink to="/services" className={navClass}>Services</NavLink>
          <NavLink to="/locations" className={navClass}>Locations</NavLink>
          <NavLink to="/pricing" className={navClass}>Pricing</NavLink>
          <NavLink to="/track" className={navClass}>Track</NavLink>
          <NavLink to="/help" className={navClass}>Help</NavLink>
          {user ? (
            <NavLink to={roleHomePaths[user.role]} className={navClass}>
              {roleLabels[user.role]} workspace
            </NavLink>
          ) : null}
          <NavLink className="btn btn-primary nav-action" to="/book">
            Book a delivery
          </NavLink>
          {!user ? <NavLink className="nav-link" to="/login">Sign in</NavLink> : null}
          {user && (authMode === "firebase" || authMode === "development-mock") ? (
            <button
              className="btn nav-signout"
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-busy={signingOut}
            >
              <FiLogOut aria-hidden="true" focusable="false" />
              <span>{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          ) : null}
        </nav>
        <div className="header-actions">
          <button
            className="menu-toggle btn btn-ghost"
            type="button"
            aria-expanded={navOpen}
            aria-controls="primary-navigation"
            aria-label={navOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className="menu-icon" aria-hidden="true" />
          </button>
          <button
            className="theme-toggle btn btn-ghost"
            type="button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-pressed={theme === "dark"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <FiSun aria-hidden="true" focusable="false" />
            ) : (
              <FiMoon aria-hidden="true" focusable="false" />
            )}
          </button>
        </div>
      </header>

      {signOutError ? (
        <div className="content-page" role="alert">
          Could not sign out: {signOutError}
        </div>
      ) : null}

      {user && authMode === "development-mock" ? (
        <div className="dev-banner">
          Development-only mock role: {roleLabels[user.role]}. Not real authentication.
        </div>
      ) : null}

      <main id="main-content" className="main-content">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/book" element={<BookingInfoPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route
            path="/locations"
            element={
              <Suspense fallback={<LoadingState label="Loading location map" />}>
                <LocationsPage />
              </Suspense>
            }
          />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/track" element={<TrackingPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/privacy" element={<PolicyPage type="privacy" />} />
          <Route path="/terms" element={<PolicyPage type="terms" />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/status" element={<StatusPage />} />
          {workspaceRoutes.map(({ path, role, allowedRoles }) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireRole roles={allowedRoles || [role]}>
                  {role === "customer" ? (
                    <CustomerDashboardPage />
                  ) : (
                    <WorkspacePage role={role} />
                  )}
                </RequireRole>
              }
            />
          ))}
          <Route
            path="/app/booking"
            element={
              <RequireRole role="customer">
                <ShipmentBookingPage />
              </RequireRole>
            }
          />
          <Route
            path="/app/book"
            element={
              <RequireRole role="customer">
                <Navigate to="/app/booking" replace />
              </RequireRole>
            }
          />
          <Route
            path="/app/shipments/:reference"
            element={
              <RequireRole role="customer">
                <ShipmentDetailPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand-block">
              <Link className="footer-brand" to="/" aria-label="Parcelway home">
                <span className="brand-mark" aria-hidden="true"><span /></span>
                <span>parcelway</span>
              </Link>
              <p>Thoughtful delivery, from the first mile to the last.</p>
            </div>
            <section className="footer-newsletter" aria-labelledby="newsletter-title">
              <span className="footer-eyebrow">THE PARCELWAY POST</span>
              <h2 id="newsletter-title">Good things, delivered.</h2>
              <p>Get occasional delivery tips and Parcelway updates.</p>
              <form
                className="newsletter-form"
                aria-label="Newsletter signup"
                onSubmit={handleNewsletterSubmit}
              >
                <label className="sr-only" htmlFor="newsletter-email">Email address</label>
                <input
                  autoComplete="email"
                  id="newsletter-email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  type="email"
                />
                <button type="submit">
                  Subscribe
                  <FiArrowRight aria-hidden="true" focusable="false" />
                </button>
              </form>
              <p className="newsletter-disclosure">
                Preview only — signup isn’t connected. Your address won’t be sent or saved.
              </p>
              <p className="newsletter-feedback" role="status" aria-live="polite">
                {newsletterMessage}
              </p>
            </section>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link to="/">Home</Link>
            <Link to="/book">Book a delivery</Link>
            <Link to="/services">Services</Link>
            <Link to="/locations">Locations</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/help">Help</Link>
          </nav>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Parcelway · Public preview</span>
            <nav className="footer-legal" aria-label="Legal and status">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/status">System status</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

function getInitialTheme() {
  const savedTheme = window.localStorage.getItem(themeStorageKey);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function RequireRole({ role, roles = [role], children }) {
  const { status, user, error, refresh } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <LoadingState label="Checking access" />;
  }

  if (status === "error") {
    return (
      <ErrorState
        title="Could not verify access"
        message={error.message}
        onRetry={refresh}
      />
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        }}
      />
    );
  }

  if (!roles.includes(user.role)) {
    return (
      <section className="content-page narrow-page">
        <Notice tone="warning">
          This account does not have access to the requested role workspace.
        </Notice>
        <Link className="text-link back-link" to={roleHomePaths[user.role]}>
          Open your assigned workspace
        </Link>
      </section>
    );
  }

  return children;
}

function NotFoundPage() {
  return (
    <section className="content-page narrow-page">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>That route doesn’t exist.</h1>
      <p className="page-intro">The address may be outdated or mistyped.</p>
      <Link className="btn btn-primary" to="/">Return to home</Link>
    </section>
  );
}

function navClass({ isActive }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

export class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled application render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fatal-error">
          <ErrorState
            title="The application encountered an error"
            message="Reload the page to try again. If the problem continues, check the development server logs."
          />
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
            Reload application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
