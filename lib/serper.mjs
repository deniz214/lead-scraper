export const costPerSearch = () => (Number(process.env.SERPER_COST_PER_1K) || 1) / 1000;

export async function searchPlaces(q, page, timeoutMs) {
  const key = process.env.SERPER_API_KEY;
  if (!key) { const e = new Error('SERPER_API_KEY is not set in Netlify environment variables.'); e.status = 401; throw e; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1500, timeoutMs));
  try {
    const res = await fetch('https://google.serper.dev/places', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'us', hl: 'en', page }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) { const e = new Error(`Serper ${res.status}: ${text.slice(0, 200)}`); e.status = res.status; throw e; }
    return JSON.parse(text).places || [];
  } finally {
    clearTimeout(timer);
  }
}
