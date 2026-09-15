import { getStore } from '@netlify/blobs';

const STORE_NAME = 'assisto';
const BLOB_KEY = 'users.json';

function store() {
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

export async function loadUsers() {
  const data = await store().get(BLOB_KEY, { type: 'json' });
  return Array.isArray(data) ? data : [];
}

export async function saveUsers(users) {
  await store().setJSON(BLOB_KEY, users);
}

export function publicUser(u) {
  return { username: u.username, role: u.role, createdAt: u.createdAt, createdBy: u.createdBy };
}
