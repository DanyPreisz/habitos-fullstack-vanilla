import { MongoClient, ObjectId } from "mongodb";
const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "habitos";
let db;
export function isReady() { return Boolean(db); }
export async function connect() {
  if (!uri) throw new Error("Falta MONGODB_URI");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(dbName);
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("habits").createIndex({ userId: 1, name: 1 });
  await db.collection("checks").createIndex({ userId: 1, habitId: 1, day: 1 }, { unique: true });
  console.log(`MongoDB conectado (${dbName})`);
  return db;
}
export const users = () => db.collection("users");
export const habits = () => db.collection("habits");
export const checks = () => db.collection("checks");
export function toId(value) { return ObjectId.isValid(value) ? new ObjectId(String(value)) : null; }
