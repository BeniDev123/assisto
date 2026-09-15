// Shared auth helpers: password hashing (PBKDF2) and signed session tokens
// (HMAC-SHA256, JWT-shaped but hand-rolled to avoid a dependency).
//
// Two ways to reach admin-only endpoints:
// 1. A user record with role "admin" logs in normally via /api/auth and
//    sends the resulting token as a Bearer header.
// 2. The ASSISTO_ADMIN_SECRET env var, sent as an X-Admin-Secret header -
//    a master key so the very first admin account can be created without
//    already having an admin user to log in as.

const TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days - technicians stay logged in on their phone

function base64UrlEncode(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url');
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function authSecret() {
  const secret = process.env.ASSISTO_AUTH_SECRET;
  if (!secret) throw new Error('ASSISTO_AUTH_SECRET is not configured');
  return secret;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { salt: base64UrlEncode(salt), hash: base64UrlEncode(bits) };
}

export async function verifyPassword(password, salt, expectedHash) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64UrlDecode(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const actualHash = base64UrlEncode(bits);
  // Constant-time-ish compare (lengths are fixed/equal in practice here).
  if (actualHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

export async function signToken({ username, role }) {
  const payload = {
    u: username,
    r: role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(authSecret());
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(sig)}`;
}

async function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.');
  try {
    const key = await hmacKey(authSecret());
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: payload.u, role: payload.r };
  } catch {
    return null;
  }
}

function bearerToken(req) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// Any logged-in user (technician or admin), or null.
export async function requireUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  return verifyToken(token);
}

// Admin via a role:"admin" session token, or via the master X-Admin-Secret
// header. Returns { username, role } - username is "master" for the
// secret-header path, since there's no user record behind it.
export async function requireAdmin(req) {
  const adminSecret = process.env.ASSISTO_ADMIN_SECRET;
  const headerSecret = req.headers.get('x-admin-secret');
  if (adminSecret && headerSecret && headerSecret === adminSecret) {
    return { username: 'master', role: 'admin' };
  }
  const user = await requireUser(req);
  if (user && user.role === 'admin') return user;
  return null;
}
