import { sql } from './db.mjs';

export async function getUserByUsername(username) {
  const rows = await sql()`SELECT * FROM users WHERE username = ${username}`;
  return rows[0] || null;
}

export async function listUsers() {
  return sql()`SELECT * FROM users ORDER BY created_at ASC`;
}

export async function createUser({ username, salt, hash, role, createdBy }) {
  const rows = await sql()`
    INSERT INTO users (username, salt, hash, role, created_by)
    VALUES (${username}, ${salt}, ${hash}, ${role}, ${createdBy})
    RETURNING *
  `;
  return rows[0];
}

export async function updateUserPassword(username, { salt, hash }) {
  const rows = await sql()`
    UPDATE users SET salt = ${salt}, hash = ${hash} WHERE username = ${username}
    RETURNING username
  `;
  return rows.length > 0;
}

export async function deleteUser(username) {
  const rows = await sql()`DELETE FROM users WHERE username = ${username} RETURNING username`;
  return rows.length > 0;
}

export function publicUser(u) {
  return { username: u.username, role: u.role, createdAt: u.created_at, createdBy: u.created_by };
}
