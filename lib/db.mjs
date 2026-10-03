// Minimal Supabase REST client (no dependencies). Uses the server-side secret key.
function config() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SECRET_KEY is not set in Netlify environment variables.');
  return { url, key };
}

function headers(key, prefer) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`; // legacy service_role JWT
  if (prefer) h.Prefer = prefer;
  return h;
}

export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = config();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: headers(key, prefer),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Database error ${res.status}: ${text.slice(0, 300)}`);
  const range = res.headers.get('content-range');
  const total = range && range.includes('/') && range.split('/')[1] !== '*' ? Number(range.split('/')[1]) : null;
  return { data: text ? JSON.parse(text) : null, total };
}

export async function rpc(name, args = {}) {
  const { data } = await rest(`rpc/${name}`, { method: 'POST', body: args });
  return data;
}
