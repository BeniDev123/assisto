import { getStore } from '@netlify/blobs';

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
  const technician = (body.technician || '').trim();

  if (!fingerprint || !cause || !remedy) {
    return jsonResponse({ success: false, message: 'fingerprint, cause and remedy are required' }, 400);
  }

  const cases = await loadCases(store);
  const entry = {
    id: crypto.randomUUID(),
    fingerprint,
    machineType: machineType || '---',
    timestamp: new Date().toISOString(),
    technician,
    cause,
    remedy,
  };

  cases.push(entry);
  await store.setJSON(BLOB_KEY, cases);

  return jsonResponse({ success: true, entry });
}

export default async (req) => {
  const store = getStore(STORE_NAME);
  const url = new URL(req.url);

  if (req.method === 'GET') return handleGet(store, url);
  if (req.method === 'POST') return handlePost(store, req);

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/case',
};
