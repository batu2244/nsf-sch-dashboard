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

import { get } from '@vercel/blob';

const STATUS_PATH = 'status.json';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default async function handler(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return json({ error: 'server_misconfigured', hint: 'DASHBOARD_PASSWORD is not set.' }, 500);
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
    return new Response(JSON.stringify({ error: 'blob_read_failed', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
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
