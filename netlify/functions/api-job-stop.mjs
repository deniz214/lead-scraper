import { handler, json, readBody } from '../../lib/http.mjs';
import { rpc } from '../../lib/db.mjs';

export default handler(async (req) => {
  const { id } = await readBody(req);
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return json({ error: 'Missing run id.' }, 400);
  await rpc('stop_job', { p_job: id, p_reason: null });
  return json({ ok: true });
});
export const config = { path: '/api/jobs/stop' };
