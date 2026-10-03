// Called by the open app every few seconds while a run is active (speeds runs up).
import { handler, json } from '../../lib/http.mjs';
import { runWorker } from '../../lib/worker.mjs';

export default handler(async () => json(await runWorker(7500)));
export const config = { path: '/api/tick' };
