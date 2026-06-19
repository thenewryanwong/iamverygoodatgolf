import { openDB, type IDBPDatabase } from "idb";
import type { AnalysisResult } from "./pose/analyze";

export interface SessionRecord {
  id: string;
  createdAt: number;
  videoBlob: Blob;
  thumbnail: string; // dataURL
  videoWidth: number;
  videoHeight: number;
  duration: number;
  analysis: AnalysisResult;
  feedback?: "up" | "down";
}

const DB_NAME = "swingsense";
const STORE = "sessions";

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: "id" });
          s.createIndex("createdAt", "createdAt");
        }
      },
    });
  }
  return dbp;
}

export async function saveSession(s: SessionRecord) {
  const d = await db();
  await d.put(STORE, s);
}
export async function getSession(id: string): Promise<SessionRecord | undefined> {
  const d = await db();
  return d.get(STORE, id);
}
export async function listSessions(): Promise<SessionRecord[]> {
  const d = await db();
  const all = await d.getAll(STORE);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteSession(id: string) {
  const d = await db();
  await d.delete(STORE, id);
}
export async function updateFeedback(id: string, feedback: "up" | "down") {
  const d = await db();
  const s = await d.get(STORE, id);
  if (s) { s.feedback = feedback; await d.put(STORE, s); }
}
