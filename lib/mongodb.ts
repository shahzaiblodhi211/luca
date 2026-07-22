import { MongoClient, Db, Collection } from "mongodb";
import type { ChatDoc } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getUri() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is not set");
  return uri;
}

function getClientPromise() {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(getUri(), {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    });
    global._mongoClientPromise = client.connect();
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db("luca_ai");
}

export async function getChatsCollection(): Promise<Collection<ChatDoc>> {
  const db = await getDb();
  const col = db.collection<ChatDoc>("chats");
  await col.createIndex({ updatedAt: -1 });
  return col;
}
