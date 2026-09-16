import { sql } from './lib/db.mjs';
import { requireUser, requireAdmin } from './lib/auth.mjs';

// Same matching approach as ControlCenter's local logs.html: a fingerprint
// is an unordered set of Ids. "Exact" = same set. "Partial" = a previously
// documented combination that's a strict subset of what's being asked about
// now (e.g. a case was logged for "A|B", and this query is for "A|B|C" -
// still relevant, just not the whole current picture).

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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toIso(value) {
  if (!value) return value;
  return value instanceof Date ? value.toISOString() : value;
}

function rowToCase(row, likedBy) {
  const out = {
    id: row.id,
    fingerprint: row.fingerprint,
    machineType: row.machine_type,
    timestamp: toIso(row.timestamp),
    technician: row.technician,
    messages: Array.isArray(row.messages) ? row.messages : [],
    cause: row.cause,
    remedy: row.remedy,
    likedBy: likedBy || [],
    verified: !!row.verified,
  };
  if (row.verified_by) out.verifiedBy = row.verified_by;
  if (row.verified_at) out.verifiedAt = toIso(row.verified_at);
  if (row.edited_at) out.editedAt = toIso(row.edited_at);
  if (row.edited_by) out.editedBy = row.edited_by;
  return out;
}

async function getLikedBy(caseId) {
  const rows = await sql()`SELECT username FROM case_likes WHERE case_id = ${caseId}`;
  return rows.map((r) => r.username);
}

async function attachLikes(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const likeRows = await sql()`SELECT case_id, username FROM case_likes WHERE case_id = ANY(${ids})`;
  const byCase = {};
  for (const lr of likeRows) {
    (byCase[lr.case_id] = byCase[lr.case_id] || []).push(lr.username);
  }
  return rows.map((r) => rowToCase(r, byCase[r.id] || []));
}

async function handleGetAll(req) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);
  const rows = await sql()`SELECT * FROM cases ORDER BY timestamp DESC`;
  return jsonResponse({ cases: await attachLikes(rows) });
}

// A technician's own submissions, for the "Mein Konto" page - so they can
// edit or remove a case without needing admin access.
async function handleGetMine(req) {
  const user = await requireUser(req);
  if (!user) return jsonResponse({ success: false, message: 'Login required' }, 401);
  const rows = await sql()`SELECT * FROM cases WHERE technician = ${user.username} ORDER BY timestamp DESC`;
  return jsonResponse({ cases: await attachLikes(rows) });
}

// Admins can act on any case; a technician may only act on their own.
async function requireAdminOrOwner(req, entry) {
  const admin = await requireAdmin(req);
  if (admin) return admin;
  const user = await requireUser(req);
  if (user && entry && user.username === entry.technician) return user;
  return null;
}

async function handleGet(url) {
  const fp = url.searchParams.get('fp') || '';
  const type = url.searchParams.get('type') || '';
  const querySet = fingerprintToSet(fp);

  const rows = await sql()`SELECT * FROM cases`;
  const exactRows = [];
  const partialRows = [];

  for (const row of rows) {
    const savedSet = fingerprintToSet(row.fingerprint);
    if (setsEqual(savedSet, querySet)) {
      exactRows.push(row);
    } else if (isProperSubset(savedSet, querySet)) {
      partialRows.push(row);
    }
  }

  const exact = await attachLikes(exactRows);
  const partial = await attachLikes(partialRows);
  const sameType = (c) => !!type && c.machineType === type;

  return jsonResponse({
    exactSameType: exact.filter(sameType),
    exactOtherType: exact.filter((c) => !sameType(c)),
    partialSameType: partial.filter(sameType),
    partialOtherType: partial.filter((c) => !sameType(c)),
  });
}

// Distinct machine types seen across all cases - powers the type picker on
// the search page, so a technician chooses from types that actually have
// documented cases instead of typing one from memory.
async function handleTypes() {
  const rows = await sql()`
    SELECT DISTINCT machine_type FROM cases
    WHERE machine_type IS NOT NULL AND machine_type != '---'
    ORDER BY machine_type
  `;
  return jsonResponse({ types: rows.map((r) => r.machine_type) });
}

// Free-text search, scoped to one machine type - a fingerprint match only
// finds a fault you already have the exact Id combination for, which isn't
// useful if you're trying to recall "was there something about a clogged
// fan on a WT190" without one. Scoped to a type because the same words
// ("fan", "sensor") show up across unrelated machine types often enough
// that an unscoped search would mostly return noise.
async function handleSearch(url) {
  const type = (url.searchParams.get('type') || '').trim();
  const q = (url.searchParams.get('q') || '').trim();

  if (!type) return jsonResponse({ success: false, message: 'type is required' }, 400);
  if (!q) return jsonResponse({ cases: [] });

  const like = `%${q}%`;
  const rows = await sql()`
    SELECT * FROM cases
    WHERE machine_type = ${type}
      AND (cause ILIKE ${like} OR remedy ILIKE ${like} OR messages::text ILIKE ${like})
    ORDER BY timestamp DESC
  `;
  return jsonResponse({ cases: await attachLikes(rows) });
}

async function handlePost(req) {
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
  const machineType = (body.machineType || '').trim() || '---';
  const messages = Array.isArray(body.messages) ? body.messages.map((m) => String(m).trim()).filter(Boolean) : [];

  if (!fingerprint || !cause || !remedy) {
    return jsonResponse({ success: false, message: 'fingerprint, cause and remedy are required' }, 400);
  }

  const id = crypto.randomUUID();
  const rows = await sql()`
    INSERT INTO cases (id, fingerprint, machine_type, technician, messages, cause, remedy)
    VALUES (${id}, ${fingerprint}, ${machineType}, ${user.username}, ${JSON.stringify(messages)}, ${cause}, ${remedy})
    RETURNING *
  `;

  return jsonResponse({ success: true, entry: rowToCase(rows[0], []) });
}

async function handlePut(req) {
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

  const existingRows = await sql()`SELECT * FROM cases WHERE id = ${id}`;
  const entry = existingRows[0];
  if (!entry) return jsonResponse({ success: false, message: 'Case not found' }, 404);

  const actor = await requireAdminOrOwner(req, entry);
  if (!actor) return jsonResponse({ success: false, message: 'Not authorized to edit this case' }, 403);

  const rows = await sql()`
    UPDATE cases SET cause = ${cause}, remedy = ${remedy}, edited_at = now(), edited_by = ${actor.username}
    WHERE id = ${id}
    RETURNING *
  `;

  return jsonResponse({ success: true, entry: rowToCase(rows[0], await getLikedBy(id)) });
}

// Any logged-in user can like/unlike a case ("this helped me") - toggles
// their username in and out of the case_likes join table. The insert side
// is a single atomic statement (ON CONFLICT DO NOTHING), so two concurrent
// likes from different users can never clobber each other the way a
// read-modify-write over one JSON blob used to.
async function handleToggleLike(req, id) {
  const user = await requireUser(req);
  if (!user) return jsonResponse({ success: false, message: 'Login required to like a case' }, 401);

  const existing = await sql()`SELECT 1 FROM cases WHERE id = ${id}`;
  if (existing.length === 0) return jsonResponse({ success: false, message: 'Case not found' }, 404);

  const inserted = await sql()`
    INSERT INTO case_likes (case_id, username) VALUES (${id}, ${user.username})
    ON CONFLICT (case_id, username) DO NOTHING
    RETURNING username
  `;

  let liked;
  if (inserted.length > 0) {
    liked = true;
  } else {
    await sql()`DELETE FROM case_likes WHERE case_id = ${id} AND username = ${user.username}`;
    liked = false;
  }

  const countRows = await sql()`SELECT COUNT(*)::int AS count FROM case_likes WHERE case_id = ${id}`;
  return jsonResponse({ success: true, liked, likes: countRows[0].count });
}

// Admins mark a case as verified ("checked and confirmed correct") - a
// stronger trust signal than likes, shown as a badge to everyone.
async function handleSetVerified(req, id, verified) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);

  const rows = await sql()`
    UPDATE cases SET
      verified = ${verified},
      verified_by = ${verified ? admin.username : null},
      verified_at = ${verified ? new Date().toISOString() : null}
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return jsonResponse({ success: false, message: 'Case not found' }, 404);

  return jsonResponse({ success: true, verified: rows[0].verified });
}

async function handlePatch(req) {
  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const id = (body.id || '').trim();
  if (!id) return jsonResponse({ success: false, message: 'id is required' }, 400);

  if (typeof body.verified === 'boolean') {
    return handleSetVerified(req, id, body.verified);
  }
  return handleToggleLike(req, id);
}

// Admin-only export shaped for ControlCenter's local KnownCases.json, so a
// technician can merge documented fixes back onto a machine that has no
// internet access itself. Defaults to verified cases only - a submission
// nobody has checked yet is fine to surface online (with a "not verified"
// note) but shouldn't get silently baked into a machine's offline file.
//
// Two fields can't be reconstructed faithfully:
// - machineNumber: Assisto's knowledge base is intentionally shared across
//   machines, so it never collected a specific machine's serial number.
// - packetSnapshot: locally this holds the *raw* log lines for the packet.
//   Assisto never sees those (the phone that submits a case only ever had
//   the Ids/messages baked into the QR code, not the machine's live log) -
//   so this is synthesized as "<Id> - <message>" lines, good enough for the
//   local history view but not a byte-identical original log line.
async function handleExport(req, onlyVerified) {
  const admin = await requireAdmin(req);
  if (!admin) return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);

  const rows = onlyVerified
    ? await sql()`SELECT * FROM cases WHERE verified = true`
    : await sql()`SELECT * FROM cases`;

  const exported = rows.map((row) => {
    const ids = fingerprintToSet(row.fingerprint);
    const messages = Array.isArray(row.messages) ? row.messages : [];
    const packetSnapshot = ids.map((id, i) => (messages[i] ? `${id} - ${messages[i]}` : id));
    const ts = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
    const timestamp = ts.toISOString().replace('T', ' ').replace(/\.\d+Z?$/, '');

    return {
      id: row.id,
      fingerprint: row.fingerprint,
      machineType: row.machine_type || '---',
      machineNumber: '---',
      timestamp,
      technician: row.technician || '',
      cause: row.cause,
      remedy: row.remedy,
      packetSnapshot,
    };
  });

  return new Response(JSON.stringify(exported, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="assisto-known-cases-export.json"',
    },
  });
}

async function handleDelete(req, url) {
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return jsonResponse({ success: false, message: 'id query param is required' }, 400);

  const rows = await sql()`SELECT * FROM cases WHERE id = ${id}`;
  const entry = rows[0];
  if (!entry) return jsonResponse({ success: false, message: 'Case not found' }, 404);

  const actor = await requireAdminOrOwner(req, entry);
  if (!actor) return jsonResponse({ success: false, message: 'Not authorized to delete this case' }, 403);

  await sql()`DELETE FROM cases WHERE id = ${id}`;
  return jsonResponse({ success: true });
}

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (url.searchParams.get('export') === '1') {
      return handleExport(req, url.searchParams.get('onlyVerified') !== '0');
    }
    if (url.searchParams.get('all') === '1') return handleGetAll(req);
    if (url.searchParams.get('mine') === '1') return handleGetMine(req);
    if (url.searchParams.get('types') === '1') return handleTypes();
    if (url.searchParams.get('search') === '1') return handleSearch(url);
    return handleGet(url);
  }
  if (req.method === 'POST') return handlePost(req);
  if (req.method === 'PUT') return handlePut(req);
  if (req.method === 'PATCH') return handlePatch(req);
  if (req.method === 'DELETE') return handleDelete(req, url);

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/case',
};
