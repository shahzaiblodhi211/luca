import { MongoClient, Db, Collection } from "mongodb";
import type { ChatDoc } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoChatsIndexPromise: Promise<void> | undefined;
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
  // Index once per process — createIndex on every request added ~500ms+ latency
  if (!global._mongoChatsIndexPromise) {
    global._mongoChatsIndexPromise = Promise.all([
      col.createIndex({ updatedAt: -1 }),
      col.createIndex({ userId: 1, updatedAt: -1 }),
    ])
      .then(() => undefined)
      .catch((err) => {
        global._mongoChatsIndexPromise = undefined;
        console.warn("[mongodb] chats index ensure failed:", err);
      });
  }
  return col;
}
