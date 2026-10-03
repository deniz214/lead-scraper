import { handler, json } from '../../lib/http.mjs';
import { rest } from '../../lib/db.mjs';

const COLUMNS = 'id,company_name,phone,phone_e164,email,website,address,city,state,zip,category,rating,review_count,maps_url,niche,line_type,job_id,created_at';
const LINE_TYPES = ['unchecked', 'mobile', 'landline', 'voip', 'other', 'invalid', 'unknown'];

export default handler(async (req) => {
  const p = new URL(req.url).searchParams;
  const qs = new URLSearchParams();
  qs.set('select', COLUMNS);
  qs.set('order', 'created_at.desc,id.desc');
  qs.set('limit', String(Math.min(1000, Math.max(1, Number(p.get('limit')) || 50))));
  qs.set('offset', String(Math.max(0, Number(p.get('offset')) || 0)));

  const state = p.get('state');
  if (state && /^[A-Z]{2}$/.test(state)) qs.set('state', `eq.${state}`);
  const niche = p.get('niche');
  if (niche) qs.set('niche', `eq.${niche}`);
  const job = p.get('job');
  if (job && /^[0-9a-f-]{36}$/i.test(job)) qs.set('job_id', `eq.${job}`);
  const email = p.get('email');
  if (email === 'yes') qs.set('email', 'not.is.null');
  if (email === 'no') qs.set('email', 'is.null');
  const lt = p.get('line');
  if (LINE_TYPES.includes(lt)) qs.set('line_type', `eq.${lt}`);
  const search = (p.get('q') || '').replace(/[*,()%\\]/g, ' ').trim();
  if (search) qs.set('company_name', `ilike.*${search}*`);

  const { data, total } = await rest(`leads?${qs}`, { prefer: 'count=exact' });
  return json({ rows: data, total });
});
export const config = { path: '/api/leads' };
