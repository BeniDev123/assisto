import { getStore } from '@netlify/blobs';
import { sql } from './lib/db.mjs';
import { requireUser, requireAdmin } from './lib/auth.mjs';

// Metadata (who/when/case) lives in Postgres for querying; the actual image
// bytes live in Blobs, which is a genuine fit here - one write, one read per
// photo, no concurrent read-modify-write like the old cases-as-JSON storage
// had.
function photoStore() {
  return getStore('case-photos');
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 4 * 1024 * 1024; // after client-side downscaling, 4MB is generous
const MAX_PHOTOS_PER_CASE = 4;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function requireAdminOrCaseOwner(req, caseId) {
  const admin = await requireAdmin(req);
  if (admin) return admin;

  const user = await requireUser(req);
  if (!user) return null;

  const rows = await sql()`SELECT technician FROM cases WHERE id = ${caseId}`;
  if (rows.length === 0 || rows[0].technician !== user.username) return null;
  return user;
}

// Public - photos are part of a case's public detail, same as cause/remedy.
async function handleList(url) {
  const caseId = (url.searchParams.get('caseId') || '').trim();
  if (!caseId) return jsonResponse({ success: false, message: 'caseId is required' }, 400);

  const rows = await sql()`
    SELECT id, uploaded_by, uploaded_at FROM case_photos
    WHERE case_id = ${caseId}
    ORDER BY uploaded_at ASC
  `;
  return jsonResponse({
    photos: rows.map((r) => ({ id: r.id, uploadedBy: r.uploaded_by, uploadedAt: r.uploaded_at })),
  });
}

// Public - streams the raw image bytes.
async function handleGetImage(url) {
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return new Response('id is required', { status: 400 });

  const rows = await sql()`SELECT content_type FROM case_photos WHERE id = ${id}`;
  if (rows.length === 0) return new Response('Not found', { status: 404 });

  const bytes = await photoStore().get(id, { type: 'arrayBuffer' });
  if (!bytes) return new Response('Not found', { status: 404 });

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': rows[0].content_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

async function handlePost(req) {
  let body;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ success: false, message: `Invalid JSON: ${err.message}` }, 400);
  }

  const caseId = (body.caseId || '').trim();
  const contentType = (body.contentType || '').trim();
  const dataBase64 = body.dataBase64 || '';
  if (!caseId || !contentType || !dataBase64) {
    return jsonResponse({ success: false, message: 'caseId, contentType and dataBase64 are required' }, 400);
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return jsonResponse({ success: false, message: 'Only JPEG, PNG or WebP images are allowed' }, 400);
  }

  const actor = await requireAdminOrCaseOwner(req, caseId);
  if (!actor) return jsonResponse({ success: false, message: 'Not authorized to add a photo to this case' }, 403);

  const countRows = await sql()`SELECT COUNT(*)::int AS count FROM case_photos WHERE case_id = ${caseId}`;
  if (countRows[0].count >= MAX_PHOTOS_PER_CASE) {
    return jsonResponse({ success: false, message: `Maximum ${MAX_PHOTOS_PER_CASE} photos per case` }, 400);
  }

  let bytes;
  try {
    bytes = Buffer.from(dataBase64, 'base64');
  } catch {
    return jsonResponse({ success: false, message: 'Invalid base64 image data' }, 400);
  }
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return jsonResponse({ success: false, message: `Image must be under ${Math.floor(MAX_BYTES / 1024 / 1024)}MB` }, 400);
  }

  const id = crypto.randomUUID();
  await photoStore().set(id, bytes);
  await sql()`
    INSERT INTO case_photos (id, case_id, content_type, uploaded_by)
    VALUES (${id}, ${caseId}, ${contentType}, ${actor.username})
  `;

  return jsonResponse({ success: true, photo: { id, uploadedBy: actor.username, uploadedAt: new Date().toISOString() } });
}

async function handleDelete(req, url) {
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return jsonResponse({ success: false, message: 'id is required' }, 400);

  const rows = await sql()`SELECT case_id FROM case_photos WHERE id = ${id}`;
  if (rows.length === 0) return jsonResponse({ success: false, message: 'Photo not found' }, 404);

  const actor = await requireAdminOrCaseOwner(req, rows[0].case_id);
  if (!actor) return jsonResponse({ success: false, message: 'Not authorized to delete this photo' }, 403);

  await sql()`DELETE FROM case_photos WHERE id = ${id}`;
  await photoStore().delete(id);

  return jsonResponse({ success: true });
}

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (url.searchParams.get('id')) return handleGetImage(url);
    return handleList(url);
  }
  if (req.method === 'POST') return handlePost(req);
  if (req.method === 'DELETE') return handleDelete(req, url);

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/case-photo',
};
