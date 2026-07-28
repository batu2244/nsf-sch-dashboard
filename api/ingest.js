// POST /api/ingest
//
// Receives status.json from status_poller.py on the USC server and stores it in
// a PRIVATE Vercel Blob. Authenticated with a shared bearer secret so only the
// server can write.
//
// Required env var on Vercel:  INGEST_SECRET
// The private Blob store must be connected to this project (that injects the
// OIDC credentials the @vercel/blob SDK uses automatically).
//
// NOTE ON THE SIGNATURE: this is exported as `POST`, not as a bare `export
// default function handler(...)`. On Vercel a bare default export is treated as
// the Node.js (req, res) handler, so `request.headers.get()` would not exist and
// the function crashes with FUNCTION_INVOCATION_FAILED. Named method exports get
// the Web-standard Request/Response.

import { put } from '@vercel/blob';

const STATUS_PATH = 'status.json';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Constant-time string compare so the secret can't be guessed by timing.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return json({ error: 'server_misconfigured', hint: 'INGEST_SECRET is not set.' }, 503);

  if (!safeEqual(request.headers.get('authorization') || '', `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // Minimal shape check so a broken poller run can't wipe a good status.
  if (!body?.generated_at || !Array.isArray(body.participants)) {
    return json({ error: 'bad_payload: expected generated_at + participants[]' }, 400);
  }

  try {
    await put(STATUS_PATH, JSON.stringify(body), {
      access: 'private',
      contentType: 'application/json',
      allowOverwrite: true,      // same pathname every time
      addRandomSuffix: false,
      cacheControlMaxAge: 0,     // we always want the newest
    });
  } catch (err) {
    return json({ error: 'blob_write_failed', detail: String(err) }, 500);
  }

  return json({ ok: true, participants: body.participants.length, generated_at: body.generated_at });
}
