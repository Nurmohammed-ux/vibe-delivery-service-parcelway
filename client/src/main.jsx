import React from "react";
import { createRoot } from "react-dom/client";
import { App, AppErrorBoundary } from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </AuthProvider>
  </React.StrictMode>,
);
