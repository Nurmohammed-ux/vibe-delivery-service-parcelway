import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiGet, apiRequest } from "../api.js";
import { firebaseConfigured, getFirebaseRuntime } from "./firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const sessionGeneration = useRef(0);
  const [authSetup, setAuthSetup] = useState({
    status: firebaseConfigured ? "loading" : "not_configured",
    database: "not_configured",
    firebaseAuthentication: "not_configured",
    firebaseProjectIdConfigured: false,
    error: null,
  });
  const [session, setSession] = useState({
    status: "loading",
    user: null,
    authMode: "unknown",
    error: null,
  });

  const refreshAuthSetup = useCallback(async () => {
    if (!firebaseConfigured) {
      setAuthSetup({
        status: "not_configured",
        database: "not_configured",
        firebaseAuthentication: "not_configured",
        firebaseProjectIdConfigured: false,
        error: null,
      });
      return;
    }

    try {
      const health = await apiGet("/api/health");
      const ready =
        health.database === "connected" &&
        health.firebaseAuthentication === "configured";
      setAuthSetup({
        status: health.developmentAuthMock
          ? "development-mock"
          : ready
            ? "ready"
            : "incomplete",
        database: health.database,
        firebaseAuthentication: health.firebaseAuthentication,
        firebaseProjectIdConfigured: health.firebaseProjectIdConfigured,
        error: null,
      });
    } catch (error) {
      setAuthSetup({
        status: "error",
        database: "unknown",
        firebaseAuthentication: "unknown",
        firebaseProjectIdConfigured: false,
        error,
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    const generation = ++sessionGeneration.current;
    const updateSession = (nextSession) => {
      if (sessionGeneration.current === generation) {
        setSession(nextSession);
      }
    };

    if (!firebaseConfigured || authSetup.status === "development-mock") {
      try {
        const result = await apiGet("/api/auth/session");
        updateSession({
          status: "ready",
          user: result.user,
          authMode: result.authMode,
          error: null,
        });
      } catch (error) {
        updateSession({
          status: "error",
          user: null,
          authMode: "unknown",
          error,
        });
      }
      return;
    }

    if (sessionGeneration.current === generation) {
      setSession((current) => ({
        ...current,
        status: "loading",
        authMode: "firebase",
        error: null,
      }));
    }

    try {
      const runtime = await getFirebaseRuntime();
      const firebaseUser = runtime.auth.currentUser;
      if (!firebaseUser || authSetup.status !== "ready") {
        updateSession({
          status: "ready",
          user: null,
          authMode: "firebase",
          error: null,
        });
        return;
      }

      const idToken = await firebaseUser.getIdToken();
      const displayName = firebaseUser.displayName?.trim();
      const result = await apiRequest("/api/auth/profile", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(displayName ? { displayName } : {}),
      });
      updateSession({
        status: "ready",
        user: result.user,
        authMode: "firebase",
        error: null,
      });
    } catch (error) {
      updateSession({
        status: "error",
        user: null,
        authMode: "firebase",
        error,
      });
    }
  }, [authSetup.status]);

  useEffect(() => {
    refreshAuthSetup();
  }, [refreshAuthSetup]);

  useEffect(() => {
    if (!firebaseConfigured) {
      refresh();
      return undefined;
    }

    let active = true;
    let unsubscribe;
    getFirebaseRuntime()
      .then((runtime) => {
        if (active) {
          unsubscribe = runtime.authSdk.onIdTokenChanged(runtime.auth, refresh);
        }
      })
      .catch((error) => {
        if (active) {
          setSession({
            status: "error",
            user: null,
            authMode: "firebase",
            error,
          });
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [refresh]);

  const register = useCallback(async ({ displayName, email, password }) => {
    if (!firebaseConfigured) {
      throw new Error("Firebase sign-up is not configured.");
    }
    if (authSetup.status !== "ready") {
      throw new Error("Complete Firebase Admin and MongoDB setup before signing up.");
    }

    const runtime = await getFirebaseRuntime();
    const credential = await runtime.authSdk.createUserWithEmailAndPassword(
      runtime.auth,
      email,
      password,
    );
    await runtime.authSdk.updateProfile(credential.user, { displayName });
    await refresh();
  }, [authSetup.status, refresh]);

  const signIn = useCallback(async ({ email, password }) => {
    if (authSetup.status === "development-mock") {
      await refresh();
      return;
    }

    if (!firebaseConfigured) {
      throw new Error("Firebase sign-in is not configured.");
    }
    if (authSetup.status !== "ready") {
      throw new Error("Complete Firebase Admin and MongoDB setup before signing in.");
    }

    const runtime = await getFirebaseRuntime();
    await runtime.authSdk.signInWithEmailAndPassword(
      runtime.auth,
      email,
      password,
    );
    await refresh();
  }, [authSetup.status, refresh]);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseConfigured) {
      throw new Error("Firebase sign-in is not configured.");
    }
    if (authSetup.status !== "ready") {
      throw new Error("Complete Firebase Admin and MongoDB setup before signing in.");
    }

    const runtime = await getFirebaseRuntime();
    await runtime.authSdk.signInWithPopup(runtime.auth, runtime.googleProvider);
    await refresh();
  }, [authSetup.status, refresh]);

  const signOut = useCallback(async () => {
    if (session.authMode === "development-mock") {
      sessionGeneration.current += 1;
      setSession({
        status: "ready",
        user: null,
        authMode: "development-mock",
        error: null,
      });
      return;
    }

    if (!firebaseConfigured) {
      throw new Error("Firebase sign-out is not configured.");
    }

    const runtime = await getFirebaseRuntime();
    await runtime.authSdk.signOut(runtime.auth);
    sessionGeneration.current += 1;
    setSession({
      status: "ready",
      user: null,
      authMode: "firebase",
      error: null,
    });
  }, [session.authMode]);

  const getAccessToken = useCallback(async () => {
    if (!firebaseConfigured) return null;
    const runtime = await getFirebaseRuntime();
    const firebaseUser = runtime.auth.currentUser;
    return firebaseUser ? firebaseUser.getIdToken() : null;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...session,
        authSetup,
        refresh,
        refreshAuthSetup,
        register,
        signIn,
        signInWithGoogle,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
