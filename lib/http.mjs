export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function authError(req) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return json({ error: 'APP_PASSWORD is not set in Netlify environment variables.' }, 500);
  if (req.headers.get('x-app-password') !== pw) return json({ error: 'Wrong password.' }, 401);
  return null;
}

// Wrap an API function: checks the app password and turns thrown errors into JSON.
export function handler(fn) {
  return async (req, ctx) => {
    const bad = authError(req);
    if (bad) return bad;
    try {
      return await fn(req, ctx);
    } catch (e) {
      console.error(e);
      return json({ error: e.message || String(e) }, 500);
    }
  };
}

export async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}
