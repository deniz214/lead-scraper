import CITIES from './cities.json';

export const STATE_CODES = Object.keys(CITIES);

// One search area per city. Interleaves states by city size so a capped run
// covers the biggest cities in every selected state first.
export function buildAreas(states) {
  const lists = states.filter((s) => CITIES[s]).map((s) => CITIES[s].map((city) => ({ area: `${city}, ${s}`, state: s })));
  const out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}
