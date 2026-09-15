import { getStore } from '@netlify/blobs';
import { requireUser, requireAdmin } from './lib/auth.mjs';

// Same matching approach as ControlCenter's local logs.html: a fingerprint
// is an unordered set of Ids. "Exact" = same set. "Partial" = a previously
// documented combination that's a strict subset of what's being asked about
// now (e.g. a case was logged for "A|B", and this query is for "A|B|C" -
// still relevant, just not the whole current picture).
const STORE_NAME = 'assisto';
const BLOB_KEY = 'known-cases.json';

function fingerprintToSet(fp) {
  return (fp || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((x) => bSet.has(x));
}

function isProperSubset(small, big) {
  if (small.length === 0 || small.length >= big.length) return false;
  const bigSet = new Set(big);
  return small.every((x) => bigSet.has(x));
}

async function loadCases(store) {
  const data = await store.get(BLOB_KEY, { type: 'json' });
  return Array.isArray(data) ? data : [];
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGetAll(req, store) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);
  const cases = await loadCases(store);
  return jsonResponse({ cases: cases.slice().reverse() });
}

async function handleGet(store, url) {
  const fp = url.searchParams.get('fp') || '';
  const type = url.searchParams.get('type') || '';
  const querySet = fingerprintToSet(fp);

  const cases = await loadCases(store);
  const exact = [];
  const partial = [];

  for (const c of cases) {
    const savedSet = fingerprintToSet(c.fingerprint);
    if (setsEqual(savedSet, querySet)) {
      exact.push(c);
    } else if (isProperSubset(savedSet, querySet)) {
      partial.push(c);
    }
  }

  const sameType = (c) => !!type && c.machineType === type;

  return jsonResponse({
    exactSameType: exact.filter(sameType),
    exactOtherType: exact.filter((c) => !sameType(c)),
    partialSameType: partial.filter(sameType),
    partialOtherType: partial.filter((c) => !sameType(c)),
  });
}

async function handlePost(store, req) {
  const user = await requireUser(req);
  if (!user) return jsonResponse({ success: false, message: 'Login required to share a fix' }, 401);

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const fingerprint = (body.fingerprint || '').trim();
  const cause = (body.cause || '').trim();
  const remedy = (body.remedy || '').trim();
  const machineType = (body.machineType || '').trim();
  const messages = Array.isArray(body.messages) ? body.messages.map((m) => String(m).trim()).filter(Boolean) : [];

  if (!fingerprint || !cause || !remedy) {
    return jsonResponse({ success: false, message: 'fingerprint, cause and remedy are required' }, 400);
  }

  const cases = await loadCases(store);
  const entry = {
    id: crypto.randomUUID(),
    fingerprint,
    machineType: machineType || '---',
    timestamp: new Date().toISOString(),
    technician: user.username,
    messages,
    cause,
    remedy,
  };

  cases.push(entry);
  await store.setJSON(BLOB_KEY, cases);

  return jsonResponse({ success: true, entry });
}

async function handlePut(store, req) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const id = (body.id || '').trim();
  const cause = (body.cause || '').trim();
  const remedy = (body.remedy || '').trim();
  if (!id || !cause || !remedy) {
    return jsonResponse({ success: false, message: 'id, cause and remedy are required' }, 400);
  }

  const cases = await loadCases(store);
  const entry = cases.find((c) => c.id === id);
  if (!entry) return jsonResponse({ success: false, message: 'Case not found' }, 404);

  entry.cause = cause;
  entry.remedy = remedy;
  entry.editedAt = new Date().toISOString();
  entry.editedBy = admin.username;

  await store.setJSON(BLOB_KEY, cases);
  return jsonResponse({ success: true, entry });
}

// Any logged-in user can like/unlike a case ("this helped me") - toggles
// their username in and out of the case's likedBy list.
async function handleToggleLike(store, req) {
  const user = await requireUser(req);
  if (!user) return jsonResponse({ success: false, message: 'Login required to like a case' }, 401);

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const id = (body.id || '').trim();
  if (!id) return jsonResponse({ success: false, message: 'id is required' }, 400);

  const cases = await loadCases(store);
  const entry = cases.find((c) => c.id === id);
  if (!entry) return jsonResponse({ success: false, message: 'Case not found' }, 404);

  if (!Array.isArray(entry.likedBy)) entry.likedBy = [];
  const idx = entry.likedBy.indexOf(user.username);
  const liked = idx === -1;
  if (liked) entry.likedBy.push(user.username);
  else entry.likedBy.splice(idx, 1);

  await store.setJSON(BLOB_KEY, cases);
  return jsonResponse({ success: true, liked, likes: entry.likedBy.length });
}

async function handleDelete(store, req, url) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);

  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return jsonResponse({ success: false, message: 'id query param is required' }, 400);

  const cases = await loadCases(store);
  const remaining = cases.filter((c) => c.id !== id);
  if (remaining.length === cases.length) {
    return jsonResponse({ success: false, message: 'Case not found' }, 404);
  }

  await store.setJSON(BLOB_KEY, remaining);
  return jsonResponse({ success: true });
}

export default async (req) => {
  // Strong consistency: a technician who just submitted a case immediately
  // re-fetches the list to see it reflected - the default "eventual"
  // consistency briefly returned stale (empty) results in testing.
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    return url.searchParams.get('all') === '1' ? handleGetAll(req, store) : handleGet(store, url);
  }
  if (req.method === 'POST') return handlePost(store, req);
  if (req.method === 'PUT') return handlePut(store, req);
  if (req.method === 'PATCH') return handleToggleLike(store, req);
  if (req.method === 'DELETE') return handleDelete(store, req, url);

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/case',
};
