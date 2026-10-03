export function toE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

// "123 Main St, Cranston, RI 02910" -> { city, state, zip }
export function parseAddress(address) {
  const m = /,\s*([^,]+?),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*(?:,|$)/.exec(address || '');
  return m ? { city: m[1].trim(), state: m[2], zip: m[3] } : {};
}

function cleanUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => url.searchParams.delete(k));
    return url.toString();
  } catch { return null; }
}

// Serper place -> leads row. Drops places with no phone or in another state.
export function placeToLead(p, task) {
  const phone = p.phoneNumber || p.phone || null;
  const e164 = toE164(phone);
  if (!e164 || !p.title) return null;
  const addr = parseAddress(p.address);
  if (addr.state && addr.state !== task.state) return null;
  const cid = p.cid ? String(p.cid) : null;
  return {
    place_cid: cid,
    company_name: p.title,
    phone,
    phone_e164: e164,
    website: cleanUrl(p.website),
    address: p.address || null,
    city: addr.city || task.area.split(',')[0],
    state: addr.state || task.state,
    zip: addr.zip || null,
    category: p.category || null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    review_count: Number.isFinite(Number(p.ratingCount)) ? Number(p.ratingCount) : null,
    maps_url: cid ? `https://maps.google.com/?cid=${cid}` : null,
    niche: task.query,
    job_id: task.job_id,
  };
}
