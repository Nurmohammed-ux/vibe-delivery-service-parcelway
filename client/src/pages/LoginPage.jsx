import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { missingFirebaseEnv } from "../auth/firebase.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { ErrorState, LoadingState, Notice } from "../components/Feedback.jsx";

export function LoginPage() {
  const location = useLocation();
  const {
    status,
    user,
    authMode,
    authSetup,
    error,
    refresh,
    refreshAuthSetup,
    register: registerAccount,
    signIn,
    signInWithGoogle,
  } = useAuth();
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    register: registerField,
    handleSubmit: submitForm,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: { displayName: "", email: "", password: "" },
  });

  async function handleCredentials(values) {
    setFormError("");
    setBusy(true);

    try {
      if (mode === "register") {
        await registerAccount({
          displayName: values.displayName.trim(),
          email: values.email.trim(),
          password: values.password,
        });
      } else {
        await signIn({ email: values.email.trim(), password: values.password });
      }
    } catch (authError) {
      setFormError(getAuthErrorMessage(authError));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setFormError("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (authError) {
      setFormError(getAuthErrorMessage(authError));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <section className="content-page narrow-page">
        <LoadingState label="Checking your account" />
      </section>
    );
  }

  if (authMode === "firebase" && authSetup?.status === "loading") {
    return (
      <section className="content-page narrow-page">
        <LoadingState label="Checking Firebase and profile storage setup" />
      </section>
    );
  }

  if (authMode === "firebase" && authSetup?.status === "error") {
    return (
      <section className="content-page narrow-page">
        <span className="eyebrow">ACCOUNT ACCESS</span>
        <h1>Authentication service unavailable</h1>
        <ErrorState
          title="Could not check server setup"
          message={authSetup.error.message}
          onRetry={refreshAuthSetup}
        />
      </section>
    );
  }

  if (authMode === "firebase" && authSetup?.status === "incomplete") {
    const missingServerSettings = [];
    if (authSetup.firebaseAuthentication !== "configured") {
      if (!authSetup.firebaseProjectIdConfigured) {
        missingServerSettings.push("FIREBASE_PROJECT_ID");
      }
      missingServerSettings.push("GOOGLE_APPLICATION_CREDENTIALS");
    }
    if (authSetup.database !== "connected") {
      missingServerSettings.push("MONGODB_URI");
    }

    return (
      <section className="content-page narrow-page">
        <span className="eyebrow">ACCOUNT ACCESS</span>
        <h1>Finish server setup first</h1>
        <p className="page-intro">
          Registration is paused until the server can verify Firebase accounts
          and save user profiles. This prevents accounts being created without
          their required profile.
        </p>
        <div className="surface-card">
          <h2>Root .env settings to complete</h2>
          <ul>
            {missingServerSettings.map((name) => <li key={name}><code>{name}</code></li>)}
          </ul>
          <p className="muted-copy">
            Restart the API after updating configuration. Keep the Firebase
            service-account file outside the repository.
          </p>
        </div>
        <Link className="text-link back-link" to="/">Back to home</Link>
      </section>
    );
  }

  if (status === "ready" && authMode === "development-mock") {
    return (
      <section className="content-page narrow-page">
        <span className="eyebrow">ACCOUNT ACCESS</span>
        <h1>Development preview</h1>
        <Notice tone="warning">
          This local mock role is not a real account and cannot sign in to
          Firebase.
        </Notice>
        <div className="surface-card">
          <h2>{user.displayName}</h2>
          <p>Role: <strong>{user.role}</strong></p>
          <Link className="btn btn-primary" to={user.homePath}>
            Open role workspace
          </Link>
        </div>
        <Link className="text-link back-link" to="/">Back to home</Link>
      </section>
    );
  }

  if (status === "ready" && authMode === "not-configured") {
    return (
      <section className="content-page narrow-page">
        <span className="eyebrow">ACCOUNT ACCESS</span>
        <h1>Configure Firebase to continue</h1>
        <p className="page-intro">
          Add the Firebase web app settings to the root <code>.env</code> file,
          then restart the development server.
        </p>
        <p className="muted-copy">
          Account profiles also require <code>FIREBASE_PROJECT_ID</code>, a
          private Admin service-account file referenced by{" "}
          <code>GOOGLE_APPLICATION_CREDENTIALS</code>, and a configured{" "}
          <code>MONGODB_URI</code>. Keep the service-account file outside the
          repository.
        </p>
        <div className="surface-card">
          <h2>Required environment variables</h2>
          <ul>
            {missingFirebaseEnv.map((name) => <li key={name}><code>{name}</code></li>)}
          </ul>
        </div>
        <Link className="text-link back-link" to="/">Back to home</Link>
      </section>
    );
  }

  if (status === "ready" && user) {
    return (
      <Navigate
        to={getLoginDestination(location.state?.from, user)}
        replace
      />
    );
  }

  return (
    <section className="content-page auth-page">
      <aside className="auth-promo">
        <div className="auth-promo-copy">
          <span className="eyebrow">DELIVERY WITH CARE</span>
          <h2>Good things are on their way.</h2>
          <p>
            Send a little care across town or across the country. We’ll help
            every parcel find its way home.
          </p>
        </div>
        <div className="auth-promo-art">
          <img src="/images/courier-bike.svg" alt="" />
          <span className="auth-promo-caption">Thoughtfully delivered</span>
        </div>
        <p className="auth-promo-footnote">Closer connections, one delivery at a time.</p>
      </aside>

      <div className="auth-main">
        <h1>{mode === "register" ? "Create your account" : "Welcome back"}</h1>
        <p className="page-intro">
          {mode === "register"
            ? "Sign up to get started. New accounts receive the customer role."
            : "Sign in with your email and password or Google account."}
        </p>

        {status === "error" ? (
          <ErrorState
            title="Could not verify your account"
            message={error.message}
            onRetry={refresh}
          />
        ) : null}

        <div className="surface-card auth-card">
          <form className="auth-form" noValidate onSubmit={submitForm(handleCredentials)}>
            {mode === "register" ? (
              <div className="auth-field">
                <label htmlFor="account-name">Name</label>
                <input
                  autoComplete="name"
                  className="input input-bordered"
                  aria-describedby={errors.displayName ? "account-name-error" : undefined}
                  aria-invalid={Boolean(errors.displayName)}
                  id="account-name"
                  maxLength={100}
                  placeholder="Your full name"
                  {...registerField("displayName", {
                    required: "Enter your name.",
                    maxLength: {
                      value: 100,
                      message: "Your name must be 100 characters or fewer.",
                    },
                  })}
                />
                {errors.displayName ? (
                  <p className="auth-error" id="account-name-error" role="alert">
                    {errors.displayName.message}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="auth-field">
              <label htmlFor="account-email">Email</label>
              <input
                autoComplete="email"
                className="input input-bordered"
                aria-describedby={errors.email ? "account-email-error" : undefined}
                aria-invalid={Boolean(errors.email)}
                id="account-email"
                placeholder="you@example.com"
                type="email"
                {...registerField("email", {
                  required: "Enter your email address.",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Enter a valid email address.",
                  },
                })}
              />
              {errors.email ? (
                <p className="auth-error" id="account-email-error" role="alert">
                  {errors.email.message}
                </p>
              ) : null}
            </div>
            <div className="auth-field">
              <label htmlFor="account-password">Password</label>
              <div className="auth-password-row">
                <input
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className="input input-bordered"
                  aria-describedby={errors.password ? "account-password-error" : undefined}
                  aria-invalid={Boolean(errors.password)}
                  id="account-password"
                  placeholder={mode === "register" ? "At least 6 characters" : "Enter your password"}
                  type={showPassword ? "text" : "password"}
                  {...registerField("password", {
                    required: "Enter your password.",
                    ...(mode === "register"
                      ? {
                          minLength: {
                            value: 6,
                            message: "Use at least 6 characters.",
                          },
                        }
                      : {}),
                  })}
                />
                <button
                  aria-controls="account-password"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword
                    ? <FiEyeOff aria-hidden="true" focusable="false" size={20} />
                    : <FiEye aria-hidden="true" focusable="false" size={20} />}
                </button>
              </div>
              {errors.password ? (
                <p className="auth-error" id="account-password-error" role="alert">
                  {errors.password.message}
                </p>
              ) : null}
            </div>
            {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>
          <button
            className="btn btn-outline auth-google"
            disabled={busy}
            onClick={handleGoogleSignIn}
            type="button"
          >
            Continue with Google
          </button>
          <p className="auth-switch">
            {mode === "register" ? "Already have an account?" : "New to Parcelway?"}{" "}
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                setFormError("");
                clearErrors();
                reset();
                setShowPassword(false);
                setMode((current) => current === "register" ? "login" : "register");
              }}
              type="button"
            >
              {mode === "register" ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}

function getAuthErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "An account already uses this email. Try signing in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/weak-password": "Choose a stronger password with at least six characters.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before completion.",
    "auth/operation-not-allowed": "Enable this sign-in method in Firebase Authentication settings.",
    "auth/network-request-failed": "Could not reach Firebase. Check your connection and try again.",
  };
  return messages[error.code] || error.message || "Authentication failed. Try again.";
}

function getLoginDestination(from, user) {
  const fallbackPath = user.homePath || "/";
  const destination = typeof from === "string" ? { pathname: from } : from;
  const pathname = destination?.pathname;

  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.startsWith("/\\") ||
    pathname === "/login"
  ) {
    return fallbackPath;
  }

  return {
    pathname,
    search: typeof destination.search === "string" && destination.search.startsWith("?")
      ? destination.search
      : "",
    hash: typeof destination.hash === "string" && destination.hash.startsWith("#")
      ? destination.hash
      : "",
  };
}
