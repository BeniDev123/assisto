import { getDatabase } from '@netlify/database';

let db = null;

export function sql() {
  if (!db) db = getDatabase();
  return db.sql;
}
