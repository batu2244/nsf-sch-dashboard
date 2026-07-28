// GET /api/status
//
// Reads the private Blob and returns it to the dashboard page.
//
// ACCESS CONTROL lives here, not in Vercel Deployment Protection. This route is
// the only thing that ever emits participant data — public/index.html is an
// empty shell with no data baked in — so gating this one route is enough, and
// it keeps /api/ingest reachable by the USC server without needing a
// team-scoped automation bypass token.
//
// Required env var on Vercel:  DASHBOARD_PASSWORD
//
// NOTE ON THE SIGNATURE: exported as `GET`, not as a bare default export. On
// Vercel a bare default export is treated as the Node.js (req, res) handler, so
// `request.headers.get()` would not exist and the function crashes with
// FUNCTION_INVOCATION_FAILED. Named method exports get Web-standard
// Request/Response.

import { get } from '@vercel/blob';

const STATUS_PATH = 'status.json';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function GET(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    // Fail CLOSED. With no password configured there is nothing to verify
    // against, so deny everyone rather than letting everyone through. 503 is
    // distinct from 401 so the page can say "not configured" instead of
    // "wrong password" — but either way the gate stays shut.
    return json({
      error: 'not_configured',
      hint: 'DASHBOARD_PASSWORD is not set on this deployment. Add it in Vercel → Settings → Environment Variables, then redeploy.',
    }, 503);
  }

  if (!safeEqual(request.headers.get('authorization') || '', `Bearer ${password}`)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let result;
  try {
    // useCache:false — we overwrite the same pathname every 30 min, and the CDN
    // cache can otherwise serve a stale copy for up to 60 seconds.
    result = await get(STATUS_PATH, { access: 'private', useCache: false });
  } catch (err) {
    return json({ error: 'blob_read_failed', detail: String(err) }, 500);
  }

  if (!result || result.statusCode !== 200) {
    return json({ error: 'no_status_yet', hint: 'status_poller.py has not pushed anything yet.' }, 404);
  }

  return new Response(result.stream, {
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
