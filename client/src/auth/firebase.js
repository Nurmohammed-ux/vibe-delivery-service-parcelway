const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const missingFirebaseEnv = Object.entries({
  VITE_FIREBASE_API_KEY: config.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
  VITE_FIREBASE_PROJECT_ID: config.projectId,
  VITE_FIREBASE_APP_ID: config.appId,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

export const firebaseConfigured = missingFirebaseEnv.length === 0;

let runtimePromise;

export function getFirebaseRuntime() {
  if (!firebaseConfigured) {
    return Promise.resolve(null);
  }

  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]).then(([appSdk, authSdk]) => {
      const appName = "parcelway-client";
      const app = appSdk.getApps().find((existing) => existing.name === appName) ||
        appSdk.initializeApp(config, appName);
      const auth = authSdk.getAuth(app);
      const googleProvider = new authSdk.GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: "select_account" });
      return { app, auth, authSdk, googleProvider };
    });
  }

  return runtimePromise;
}
