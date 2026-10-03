import { handler, json, readBody } from '../../lib/http.mjs';
import { rest, rpc } from '../../lib/db.mjs';
import { buildAreas, STATE_CODES } from '../../lib/areas.mjs';

export default handler(async (req) => {
  if (req.method === 'GET') {
    const { data } = await rest('jobs?select=*&order=created_at.desc&limit=100');
    return json(data);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const b = await readBody(req);
  const queries = [...new Set((b.queries || []).map((q) => String(q).trim().toLowerCase()).filter((q) => q.length >= 2 && q.length <= 60))];
  const states = [...new Set((b.states || []).filter((s) => STATE_CODES.includes(s)))];
  if (!queries.length) return json({ error: 'Pick at least one niche.' }, 400);
  if (queries.length > 8) return json({ error: 'Pick at most 8 niches per run.' }, 400);
  if (!states.length) return json({ error: 'Pick at least one state.' }, 400);

  const leadCap = Number(b.leadCap) > 0 ? Math.round(Number(b.leadCap)) : null;
  const costCap = Number(b.costCap) > 0 ? Number(b.costCap) : null;

  const job = await rpc('create_job', {
    p_niche: queries.join(', '),
    p_queries: queries,
    p_states: states,
    p_areas: buildAreas(states),
    p_lead_cap: leadCap,
    p_cost_cap: costCap,
    p_skip_covered: b.skipCovered !== false,
  });
  return json(job);
});
export const config = { path: '/api/jobs' };
