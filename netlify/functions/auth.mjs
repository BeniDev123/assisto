import { verifyPassword, signToken } from './lib/auth.mjs';
import { loadUsers } from './lib/users-store.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const username = (body.username || '').trim().toLowerCase();
  const password = body.password || '';
  if (!username || !password) {
    return jsonResponse({ success: false, message: 'username and password are required' }, 400);
  }

  const users = await loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user || !(await verifyPassword(password, user.salt, user.hash))) {
    return jsonResponse({ success: false, message: 'Invalid username or password' }, 401);
  }

  const token = await signToken({ username: user.username, role: user.role });
  return jsonResponse({ success: true, token, username: user.username, role: user.role });
};

export const config = {
  path: '/api/auth',
};
