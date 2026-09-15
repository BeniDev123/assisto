import { hashPassword, requireAdmin, requireUser } from './lib/auth.mjs';
import { loadUsers, saveUsers, publicUser } from './lib/users-store.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validatePassword(password) {
  if (!password || password.length < 8) return 'password must be at least 8 characters';
  return null;
}

async function handleGet() {
  const users = await loadUsers();
  return jsonResponse({ users: users.map(publicUser) });
}

async function handlePost(req, admin) {
  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const username = (body.username || '').trim().toLowerCase();
  const password = body.password || '';
  const role = body.role === 'admin' ? 'admin' : 'technician';

  if (!username || !password) {
    return jsonResponse({ success: false, message: 'username and password are required' }, 400);
  }
  const passwordError = validatePassword(password);
  if (passwordError) return jsonResponse({ success: false, message: passwordError }, 400);
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return jsonResponse({ success: false, message: 'username may only contain lowercase letters, digits, dots, dashes and underscores' }, 400);
  }

  const users = await loadUsers();
  if (users.some((u) => u.username === username)) {
    return jsonResponse({ success: false, message: 'That username already exists' }, 409);
  }

  const { salt, hash } = await hashPassword(password);
  const user = {
    username,
    salt,
    hash,
    role,
    createdAt: new Date().toISOString(),
    createdBy: admin.username,
  };
  users.push(user);
  await saveUsers(users);

  return jsonResponse({ success: true, user: publicUser(user) });
}

// Admins can change any user's password; anyone else may only change their
// own (self-service, e.g. from the "Mein Konto" page).
async function handlePatch(req, admin) {
  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const username = (body.username || '').trim().toLowerCase();
  const password = body.password || '';
  if (!username) return jsonResponse({ success: false, message: 'username is required' }, 400);

  if (!admin) {
    const self = await requireUser(req);
    if (!self || self.username !== username) {
      return jsonResponse({ success: false, message: 'You can only change your own password' }, 403);
    }
  }

  const passwordError = validatePassword(password);
  if (passwordError) return jsonResponse({ success: false, message: passwordError }, 400);

  const users = await loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return jsonResponse({ success: false, message: 'User not found' }, 404);

  const { salt, hash } = await hashPassword(password);
  user.salt = salt;
  user.hash = hash;

  await saveUsers(users);
  return jsonResponse({ success: true, user: publicUser(user) });
}

async function handleDelete(req, admin) {
  const url = new URL(req.url);
  const username = (url.searchParams.get('username') || '').trim().toLowerCase();
  if (!username) return jsonResponse({ success: false, message: 'username query param is required' }, 400);
  if (username === admin.username) {
    return jsonResponse({ success: false, message: 'You cannot delete the account you are logged in as' }, 400);
  }

  const users = await loadUsers();
  const remaining = users.filter((u) => u.username !== username);
  if (remaining.length === users.length) {
    return jsonResponse({ success: false, message: 'User not found' }, 404);
  }

  await saveUsers(remaining);
  return jsonResponse({ success: true });
}

export default async (req) => {
  const admin = await requireAdmin(req);

  if (req.method === 'PATCH') return handlePatch(req, admin);

  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);

  if (req.method === 'GET') return handleGet();
  if (req.method === 'POST') return handlePost(req, admin);
  if (req.method === 'DELETE') return handleDelete(req, admin);

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/users',
};
