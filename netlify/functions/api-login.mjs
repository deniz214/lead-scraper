import { handler, json } from '../../lib/http.mjs';

export default handler(async () => json({ ok: true }));
export const config = { path: '/api/login' };
