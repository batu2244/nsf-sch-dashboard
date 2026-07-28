// GET /api/status
//
// Reads the private Blob and returns it to the dashboard page.
//
// Access control: this route is protected by Vercel Deployment Protection
// (Settings -> Deployment Protection -> Vercel Authentication). That is what
// keeps participant data behind a login — the Blob itself is private and can
// never be fetched directly by a browser.

import { get } from '@vercel/blob';

const STATUS_PATH = 'status.json';

export default async function handler() {
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
    return new Response(
      JSON.stringify({ error: 'no_status_yet', hint: 'status_poller.py has not pushed anything.' }),
      { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  }

  return new Response(result.stream, {
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
