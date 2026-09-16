import { getStore } from '@netlify/blobs';
import { sql } from './lib/db.mjs';

// ONE-TIME migration: copies the existing Netlify Blobs data (users.json,
// known-cases.json) into the new Postgres tables. Admin-secret protected,
// POST-only, safe to re-run (ON CONFLICT DO NOTHING everywhere) in case a
// partial run needs retrying. Delete this file once the migration has run
// successfully against production and been verified - it has no reason to
// stay deployed afterwards.

const STORE_NAME = 'assisto';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const adminSecret = process.env.ASSISTO_ADMIN_SECRET;
  const headerSecret = req.headers.get('x-admin-secret');
  if (!adminSecret || !headerSecret || headerSecret !== adminSecret) {
    return jsonResponse({ success: false, message: 'Admin authorization required' }, 401);
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  const usersData = await store.get('users.json', { type: 'json' });
  const users = Array.isArray(usersData) ? usersData : [];
  let usersMigrated = 0;
  for (const u of users) {
    const rows = await sql()`
      INSERT INTO users (username, salt, hash, role, created_at, created_by)
      VALUES (${u.username}, ${u.salt}, ${u.hash}, ${u.role}, ${u.createdAt || new Date().toISOString()}, ${u.createdBy || null})
      ON CONFLICT (username) DO NOTHING
      RETURNING username
    `;
    if (rows.length > 0) usersMigrated++;
  }

  const casesData = await store.get('known-cases.json', { type: 'json' });
  const cases = Array.isArray(casesData) ? casesData : [];
  let casesMigrated = 0;
  let likesMigrated = 0;
  for (const c of cases) {
    const rows = await sql()`
      INSERT INTO cases (
        id, fingerprint, machine_type, timestamp, technician, messages, cause, remedy,
        verified, verified_by, verified_at, edited_at, edited_by
      )
      VALUES (
        ${c.id}, ${c.fingerprint}, ${c.machineType || '---'}, ${c.timestamp || new Date().toISOString()},
        ${c.technician || ''}, ${JSON.stringify(Array.isArray(c.messages) ? c.messages : [])},
        ${c.cause}, ${c.remedy},
        ${!!c.verified}, ${c.verifiedBy || null}, ${c.verifiedAt || null},
        ${c.editedAt || null}, ${c.editedBy || null}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) casesMigrated++;

    const likedBy = Array.isArray(c.likedBy) ? c.likedBy : [];
    for (const username of likedBy) {
      const likeRows = await sql()`
        INSERT INTO case_likes (case_id, username) VALUES (${c.id}, ${username})
        ON CONFLICT (case_id, username) DO NOTHING
        RETURNING username
      `;
      if (likeRows.length > 0) likesMigrated++;
    }
  }

  return jsonResponse({
    success: true,
    users: { found: users.length, migrated: usersMigrated },
    cases: { found: cases.length, migrated: casesMigrated },
    likes: { migrated: likesMigrated },
  });
};

export const config = {
  path: '/api/migrate',
};
