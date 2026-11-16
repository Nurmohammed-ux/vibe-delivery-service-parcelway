import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connectToDatabase } from "./database.js";
import { createFirebaseAuthProvider } from "./firebase-auth.js";

const serverDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(serverDirectory, "../../.env") });

async function startServer() {
  const config = loadConfig();
  const database = await connectToDatabase(config.mongoUri);
  const firebaseAuth = createFirebaseAuthProvider(config, database.database);
  const app = createApp(config, database.status, firebaseAuth, database.database);
  const server = app.listen(config.port, "127.0.0.1", () => {
    console.info(`Parcel API listening at http://127.0.0.1:${config.port}`);
    console.info(`MongoDB status: ${database.status}`);
    console.info(
      `Firebase authentication: ${firebaseAuth ? "configured" : "not_configured"}`,
    );
    if (config.devAuthMock) {
      console.warn(
        `Development-only mock identity enabled for role "${config.devAuthRole}".`,
      );
    }
  });

  const shutdown = (signal) => {
    console.info(`${signal} received; shutting down.`);
    server.close(async (error) => {
      if (error) {
        logSafeError("Failed to close the HTTP server cleanly.", error);
        process.exitCode = 1;
      }

      try {
        await database.close();
      } catch (closeError) {
        logSafeError("Failed to close the MongoDB connection cleanly.", closeError);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
  logSafeError("Parcel API startup failed.", error);
  process.exitCode = 1;
});

function logSafeError(message, error) {
  console.error(message, {
    name: typeof error?.name === "string" ? error.name : "Error",
  });
}
