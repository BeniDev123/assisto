import { sql } from './lib/db.mjs';
import { hashPassword, requireAdmin } from './lib/auth.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Readable random password - avoids visually ambiguous characters (0/O,
// 1/l/I) since an admin reads this off screen and relays it by voice/chat.
function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// A technician who's locked out can't authenticate to ask for a reset, so
// this has to be reachable without a login - just a username. Always
// responds success regardless of whether that username exists, so this
// can't be used to enumerate valid accounts.
async function handlePost(req) {
  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const username = (body.username || '').trim().toLowerCase();
  if (!username) return jsonResponse({ success: false, message: 'username is required' }, 400);

  const userRows = await sql()`SELECT 1 FROM users WHERE username = ${username}`;
  if (userRows.length > 0) {
    await sql()`
      INSERT INTO password_reset_requests (username) VALUES (${username})
      ON CONFLICT (username) DO UPDATE SET requested_at = now()
    `;
  }

  return jsonResponse({ success: true });
}

async function handleGet(req) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);

  const rows = await sql()`
    SELECT r.username, r.requested_at, u.role
    FROM password_reset_requests r
    JOIN users u ON u.username = r.username
    ORDER BY r.requested_at ASC
  `;
  return jsonResponse({
    requests: rows.map((r) => ({ username: r.username, requestedAt: r.requested_at, role: r.role })),
  });
}

// Generates a fresh password for the requesting user, sets it, and clears
// the request - the admin relays the returned password to the technician
// out of band (voice/chat), same as when creating an account.
async function handlePatch(req) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const username = (body.username || '').trim().toLowerCase();
  if (!username) return jsonResponse({ success: false, message: 'username is required' }, 400);

  const password = generatePassword();
  const { salt, hash } = await hashPassword(password);

  const rows = await sql()`UPDATE users SET salt = ${salt}, hash = ${hash} WHERE username = ${username} RETURNING username`;
  if (rows.length === 0) return jsonResponse({ success: false, message: 'User not found' }, 404);

  await sql()`DELETE FROM password_reset_requests WHERE username = ${username}`;

  return jsonResponse({ success: true, username, password });
}

async function handleDelete(req, url) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);

  const username = (url.searchParams.get('username') || '').trim().toLowerCase();
  if (!username) return jsonResponse({ success: false, message: 'username query param is required' }, 400);

  await sql()`DELETE FROM password_reset_requests WHERE username = ${username}`;
  return jsonResponse({ success: true });
}

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === 'POST') return handlePost(req);
  if (req.method === 'GET') return handleGet(req);
  if (req.method === 'PATCH') return handlePatch(req);
  if (req.method === 'DELETE') return handleDelete(req, url);

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/password-reset',
};
