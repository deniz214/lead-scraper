import { handler, json } from '../../lib/http.mjs';
import { rpc } from '../../lib/db.mjs';

export default handler(async () => json(await rpc('dashboard_stats')));
export const config = { path: '/api/stats' };
