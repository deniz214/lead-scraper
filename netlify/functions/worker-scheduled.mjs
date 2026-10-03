// Runs every minute on Netlify, so runs keep going after you close the tab.
import { runWorker } from '../../lib/worker.mjs';

export default async () => {
  try {
    const stats = await runWorker(24000);
    console.log('worker', JSON.stringify(stats));
  } catch (e) {
    console.error('worker failed', e);
  }
};
export const config = { schedule: '* * * * *' };
