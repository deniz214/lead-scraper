import { rest, rpc } from './db.mjs';
import { searchPlaces, costPerSearch } from './serper.mjs';
import { placeToLead } from './normalize.mjs';
import { findEmail } from './crawl.mjs';
import { lookupEnabled, lineType } from './lookup.mjs';

const MAX_PAGES = 3;      // up to ~30 businesses per niche per city
const SEARCH_BATCH = 4;   // parallel searches per round
const EMAIL_BATCH = 6;    // parallel website crawls per round

async function runTask(t, left, stats) {
  let places;
  try {
    places = await searchPlaces(`${t.query} in ${t.area}`, t.page, left() - 500);
  } catch (e) {
    if ([401, 402, 403].includes(e.status)) {
      await rpc('stop_job', { p_job: t.job_id, p_reason: `Serper refused the search (${e.status}). Check SERPER_API_KEY and your Serper credit balance.` });
    } else {
      await rest(`job_tasks?id=eq.${t.id}`, { method: 'PATCH', body: { status: t.attempts >= 3 ? 'failed' : 'pending' }, prefer: 'return=minimal' });
    }
    return;
  }
  stats.searches++;

  const rows = places.map((p) => placeToLead(p, t)).filter(Boolean);
  const inserted = rows.length ? Number(await rpc('insert_leads', { p_rows: rows })) || 0 : 0;
  stats.leads += inserted;
  await rpc('bump_job', { p_job: t.job_id, p_leads: inserted, p_queries: 1, p_cost: costPerSearch() });

  if (places.length >= 10 && t.page < MAX_PAGES) {
    await rest('job_tasks?on_conflict=job_id,query,area,page', {
      method: 'POST',
      body: { job_id: t.job_id, query: t.query, area: t.area, state: t.state, page: t.page + 1 },
      prefer: 'resolution=ignore-duplicates,return=minimal',
    });
  }
  await rest(`job_tasks?id=eq.${t.id}`, { method: 'PATCH', body: { status: 'done' }, prefer: 'return=minimal' });
  if (t.page === 1) {
    await rest('coverage?on_conflict=query,area', {
      method: 'POST',
      body: { query: t.query, area: t.area, results: places.length, last_run_at: new Date().toISOString() },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }
}

async function searchRound(left, stats) {
  if (left() < 5000) return 0;
  const tasks = (await rpc('claim_tasks', { p_limit: SEARCH_BATCH })) || [];
  await Promise.all(tasks.map((t) => runTask(t, left, stats).catch((e) => console.error('task', t.id, e.message))));
  return tasks.length;
}

async function emailRound(left, stats) {
  if (left() < 6000) return 0;
  const rows = (await rpc('claim_email_leads', { p_limit: EMAIL_BATCH })) || [];
  await Promise.all(rows.map(async (r) => {
    try {
      const email = await findEmail(r.site, () => left() - 1500);
      if (email) {
        await rest(`leads?id=eq.${r.lead_id}`, { method: 'PATCH', body: { email }, prefer: 'return=minimal' });
        stats.emails++;
      }
    } catch (e) { console.error('crawl', r.site, e.message); }
  }));
  return rows.length;
}

async function lookupRound(left, stats) {
  if (left() < 4000) return 0;
  const rows = (await rpc('claim_lookup_leads', { p_limit: 10 })) || [];
  await Promise.all(rows.map(async (r) => {
    let type = 'unchecked';
    try { type = await lineType(r.e164); stats.lookups++; } catch (e) { console.error('lookup', e.message); }
    await rest(`leads?id=eq.${r.lead_id}`, {
      method: 'PATCH',
      body: { line_type: type, line_type_checked_at: type === 'unchecked' ? null : new Date().toISOString() },
      prefer: 'return=minimal',
    });
  }));
  return rows.length;
}

// Works through searches, email crawls and (if switched on) mobile checks until time runs out.
export async function runWorker(budgetMs) {
  const deadline = Date.now() + budgetMs;
  const left = () => deadline - Date.now();
  const stats = { searches: 0, leads: 0, emails: 0, lookups: 0 };
  const lookups = await lookupEnabled().catch(() => false);

  while (left() > 4000) {
    const [s, e, l] = await Promise.all([
      searchRound(left, stats),
      emailRound(left, stats),
      lookups ? lookupRound(left, stats) : 0,
    ]);
    if (!s && !e && !l) break;
  }
  await rpc('finish_jobs');
  return stats;
}
