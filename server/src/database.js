import { MongoClient } from "mongodb";

export async function connectToDatabase(uri) {
  if (!uri) {
    return {
      database: null,
      status: "not_configured",
      close: async () => {},
    };
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();

  return {
    database: client.db(),
    status: "connected",
    close: () => client.close(),
  };
}
