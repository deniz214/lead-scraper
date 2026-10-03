// Finds a contact email on a business website: homepage first, then its contact page.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]+\.[a-z]{2,24}/gi;
const BAD_EXT = /\.(png|jpe?g|gif|webp|svg|css|js|ico|bmp|tiff?)$/i;
const BAD_DOMAIN = /(example\.|sentry|wixpress|domain\.com|email\.com|yourdomain|yoursite|godaddy|squarespace|wordpress|schema\.org|w3\.org|mysite|company\.com|test\.com)/i;

async function fetchHtml(url, timeoutMs) {
  if (timeoutMs < 800) return '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, 5000));
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return '';
    return (await res.text()).slice(0, 800_000);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// Cloudflare hides emails as data-cfemail="hex"; decode them.
function decodeCf(hex) {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  } catch { return ''; }
}

function extractEmails(html) {
  const found = new Set();
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) found.add(decodeCf(m[1]));
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    try { found.add(decodeURIComponent(m[1])); } catch { found.add(m[1]); }
  }
  for (const m of html.matchAll(EMAIL_RE)) found.add(m[0]);
  return [...found]
    .map((e) => e.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,24}$/.test(e) && !BAD_EXT.test(e) && !BAD_DOMAIN.test(e.split('@')[1]));
}

function pick(emails, host) {
  if (!emails.length) return null;
  const site = host.replace(/^www\./, '');
  return emails.find((e) => e.endsWith(`@${site}`)) || emails[0];
}

export async function findEmail(website, remainingMs) {
  let base;
  try { base = new URL(website); } catch { return null; }
  const home = await fetchHtml(base.href, remainingMs());
  if (!home) return null;
  let email = pick(extractEmails(home), base.hostname);
  if (email) return email;

  const link = /href=["']([^"']*contact[^"']*)["']/i.exec(home)?.[1];
  const candidates = [];
  if (link) { try { candidates.push(new URL(link, base).href); } catch {} }
  candidates.push(`${base.origin}/contact`, `${base.origin}/contact-us`);
  for (const url of [...new Set(candidates)].slice(0, 2)) {
    const html = await fetchHtml(url, remainingMs());
    email = pick(extractEmails(html), base.hostname);
    if (email) return email;
  }
  return null;
}
