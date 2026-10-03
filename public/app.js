/* Lead Scraper front end — no build step. */
const AREA_COUNTS = {"AK":60,"AL":60,"AR":60,"AZ":60,"CA":140,"CO":60,"CT":60,"DC":6,"DE":60,"FL":89,"GA":60,"HI":60,"IA":64,"ID":60,"IL":91,"IN":60,"KS":60,"KY":60,"LA":60,"MA":60,"MD":60,"ME":60,"MI":65,"MN":60,"MO":69,"MS":60,"MT":60,"NC":60,"ND":60,"NE":60,"NH":60,"NJ":60,"NM":60,"NV":60,"NY":111,"OH":79,"OK":60,"OR":60,"PA":118,"RI":52,"SC":60,"SD":60,"TN":60,"TX":129,"UT":60,"VA":61,"VT":60,"WA":60,"WI":60,"WV":60,"WY":60};
const STATE_NAMES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
const PRESET_NICHES = ['kitchen remodeler', 'bathroom remodeler', 'basement remodeler', 'basement finishing', 'home remodeling contractor', 'home addition contractor'];
const COST_PER_SEARCH = 0.001; // matches SERPER_COST_PER_1K default ($1 per 1,000)
const MAX_PAGES = 3;

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const money = (n) => '$' + Number(n || 0).toFixed(2);
const when = (iso) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

let password = null;
try { password = localStorage.getItem('ls_pw'); } catch {}
let activeRuns = 0;
let ticking = false;

/* ---------- API ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-app-password': password || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401) { signOut(); throw new Error('Wrong password.'); }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
  return data;
}

function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), bad ? 7000 : 3500);
}

/* ---------- Auth ---------- */
function signOut() {
  password = null;
  try { localStorage.removeItem('ls_pw'); } catch {}
  $('#app').hidden = true;
  $('#login').hidden = false;
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  password = $('#pw').value;
  $('#loginError').hidden = true;
  try {
    await api('/api/login', { method: 'POST' });
    try { localStorage.setItem('ls_pw', password); } catch {}
    start();
  } catch (err) {
    $('#loginError').textContent = err.message;
    $('#loginError').hidden = false;
    $('#login').hidden = false;
  }
});

/* ---------- Router ---------- */
function route() {
  const [path, query] = (location.hash.slice(2) || 'overview').split('?');
  const params = new URLSearchParams(query || '');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === path));
  const views = { overview: viewOverview, new: viewNew, runs: viewRuns, leads: viewLeads, settings: viewSettings };
  (views[path] || viewOverview)(params);
}
window.addEventListener('hashchange', route);

function start() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  route();
  refreshBadge();
}

/* ---------- Background ticking while a run is active ---------- */
async function refreshBadge() {
  try {
    const jobs = await api('/api/jobs');
    activeRuns = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
    $('#runBadge').hidden = !activeRuns;
    $('#runBadge').textContent = activeRuns;
    return jobs;
  } catch { return null; }
}

setInterval(async () => {
  if (!password || ticking || document.hidden) return;
  if (!activeRuns) return;
  ticking = true;
  try {
    await api('/api/tick', { method: 'POST' });
  } catch (e) { console.warn(e); }
  finally { ticking = false; }
  await refreshBadge();
  const page = (location.hash.slice(2) || 'overview').split('?')[0];
  if (page === 'runs') renderRunsTable();
  if (page === 'overview') viewOverview();
}, 4000);

/* ---------- Overview ---------- */
async function viewOverview() {
  const v = $('#view');
  if (!v.dataset.page || v.dataset.page !== 'overview') {
    v.dataset.page = 'overview';
    v.innerHTML = `<div class="page-head"><div><h1>Overview</h1><p>Everything scraped so far, and what is running right now.</p></div>
      <a class="btn primary" href="#/new">New scrape</a></div>
      <div class="stats" id="stats"></div><h2 style="margin-bottom:12px">Recent runs</h2><div id="recent"></div>`;
  }
  try {
    const [s, jobs] = await Promise.all([api('/api/stats'), api('/api/jobs')]);
    $('#stats').innerHTML = [
      [fmt(s.total), 'Leads in total'],
      [fmt(s.this_month), 'Added this month'],
      [fmt(s.with_email), 'With an email'],
      [money(s.spend_month), 'Search spend this month'],
      [fmt(s.emails_pending), 'Websites waiting for email check'],
    ].map(([v, k]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
    $('#recent').innerHTML = runsTable(jobs.slice(0, 5));
    bindStopButtons();
  } catch (e) { toast(e.message, true); }
}

/* ---------- New scrape ---------- */
const form = { niches: new Set(['kitchen remodeler']), custom: [], states: new Set(), leadCap: 2000, costCap: '', skipCovered: true };

function viewNew() {
  const v = $('#view');
  v.dataset.page = 'new';
  v.innerHTML = `
  <div class="page-head"><div><h1>New scrape</h1><p>Pick niches and states. The scraper searches Google Maps city by city, keeps businesses with a phone number, then checks each website for an email.</p></div></div>
  <div class="grid-2">
    <div>
      <section class="panel">
        <h2>Niches</h2>
        <p class="hint">Each niche is its own Google search. Overlapping businesses are only stored once.</p>
        <div class="chips" id="nicheChips"></div>
        <div class="row" style="margin-top:14px">
          <input type="text" id="customNiche" placeholder="Add another niche, e.g. deck builder" style="flex:1;min-width:200px" maxlength="60">
          <button class="btn" id="addNiche" type="button">Add niche</button>
        </div>
      </section>
      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <div><h2>States</h2><p class="hint" style="margin:0" id="stateCount"></p></div>
          <div class="row"><button class="btn small" id="selAll" type="button">Select all</button><button class="btn small" id="selNone" type="button">Clear</button></div>
        </div>
        <input type="search" id="stateSearch" placeholder="Filter states" style="margin-top:14px" aria-label="Filter states">
        <div class="states" id="stateGrid"></div>
      </section>
    </div>
    <aside class="panel sticky">
      <h2>Limits</h2>
      <p class="hint">The run stops at whichever limit it reaches first.</p>
      <label>Stop after this many new leads</label>
      <div class="seg" id="capSeg">${[1000, 2000, 5000, 0].map((n) => `<button type="button" data-cap="${n}">${n ? fmt(n / 1000) + 'k' : 'No cap'}</button>`).join('')}</div>
      <input type="number" id="leadCap" min="1" step="100" style="margin-top:8px" aria-label="Lead cap">
      <label for="costCap" style="margin-top:16px">Stop if search cost passes ($)</label>
      <input type="number" id="costCap" min="0" step="1" placeholder="No ceiling">
      <label class="check" style="margin-top:16px"><input type="checkbox" id="skipCovered"> <span>Skip cities already searched for this niche in the last 90 days</span></label>
      <div class="est" id="estimate"></div>
      <button class="btn primary big" id="startBtn" type="button" style="margin-top:18px">Start scrape</button>
    </aside>
  </div>`;

  const renderNiches = () => {
    const all = [...PRESET_NICHES, ...form.custom];
    $('#nicheChips').innerHTML = all.map((n) => `<button type="button" class="chip" data-niche="${esc(n)}" aria-pressed="${form.niches.has(n)}">${esc(n)}${form.custom.includes(n) ? '<span class="x" data-remove="' + esc(n) + '" aria-label="Remove">×</span>' : ''}</button>`).join('');
    renderEstimate();
  };
  const renderStates = () => {
    const q = $('#stateSearch').value.trim().toLowerCase();
    $('#stateGrid').innerHTML = Object.keys(STATE_NAMES)
      .filter((c) => !q || c.toLowerCase().includes(q) || STATE_NAMES[c].toLowerCase().includes(q))
      .map((c) => `<button type="button" class="state" data-state="${c}" aria-pressed="${form.states.has(c)}"><b>${c}</b>${STATE_NAMES[c]}</button>`).join('');
    const areas = [...form.states].reduce((s, c) => s + (AREA_COUNTS[c] || 0), 0);
    $('#stateCount').textContent = form.states.size ? `${form.states.size} selected, ${fmt(areas)} cities to search` : 'None selected yet';
    renderEstimate();
  };
  const renderCap = () => {
    document.querySelectorAll('#capSeg button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.cap) === (form.leadCap || 0))));
    $('#leadCap').value = form.leadCap || '';
    $('#leadCap').placeholder = 'No cap';
    renderEstimate();
  };

  $('#nicheChips').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { const n = rm.dataset.remove; form.custom = form.custom.filter((x) => x !== n); form.niches.delete(n); return renderNiches(); }
    const b = e.target.closest('[data-niche]');
    if (!b) return;
    const n = b.dataset.niche;
    form.niches.has(n) ? form.niches.delete(n) : form.niches.add(n);
    renderNiches();
  });
  const addNiche = () => {
    const n = $('#customNiche').value.trim().toLowerCase();
    if (n.length < 2) return;
    if (!PRESET_NICHES.includes(n) && !form.custom.includes(n)) form.custom.push(n);
    form.niches.add(n);
    $('#customNiche').value = '';
    renderNiches();
  };
  $('#addNiche').addEventListener('click', addNiche);
  $('#customNiche').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNiche(); } });

  $('#stateGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-state]');
    if (!b) return;
    const c = b.dataset.state;
    form.states.has(c) ? form.states.delete(c) : form.states.add(c);
    renderStates();
  });
  $('#stateSearch').addEventListener('input', renderStates);
  $('#selAll').addEventListener('click', () => { Object.keys(STATE_NAMES).forEach((c) => form.states.add(c)); renderStates(); });
  $('#selNone').addEventListener('click', () => { form.states.clear(); renderStates(); });

  $('#capSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-cap]'); if (!b) return; form.leadCap = Number(b.dataset.cap) || 0; renderCap(); });
  $('#leadCap').addEventListener('input', (e) => { form.leadCap = Number(e.target.value) || 0; renderCap(); });
  $('#costCap').value = form.costCap;
  $('#costCap').addEventListener('input', (e) => { form.costCap = e.target.value; renderEstimate(); });
  $('#skipCovered').checked = form.skipCovered;
  $('#skipCovered').addEventListener('change', (e) => (form.skipCovered = e.target.checked));
  $('#startBtn').addEventListener('click', startScrape);

  renderNiches(); renderStates(); renderCap();
}

function renderEstimate() {
  const el = $('#estimate');
  if (!el) return;
  const areas = [...form.states].reduce((s, c) => s + (AREA_COUNTS[c] || 0), 0);
  const searches = areas * form.niches.size;
  const typical = searches * 1.6 * COST_PER_SEARCH;
  const worst = searches * MAX_PAGES * COST_PER_SEARCH;
  let capped = '';
  if (form.leadCap) capped = `<div><span>Rough cost to reach ${fmt(form.leadCap)} leads</span><strong>${money(form.leadCap / 6 * COST_PER_SEARCH)}</strong></div>`;
  el.innerHTML = `
    <div><span>City searches</span><strong>${fmt(searches)}</strong></div>
    <div><span>Typical cost if it runs to the end</span><strong>${money(typical)}</strong></div>
    <div><span>Most it can cost</span><strong>${money(worst)}</strong></div>${capped}
    <p class="muted" style="font-size:13px">Estimates assume $1 per 1,000 Serper searches. Website email checks are free.</p>`;
  $('#startBtn').disabled = !form.niches.size || !form.states.size;
}

async function startScrape() {
  const btn = $('#startBtn');
  btn.disabled = true;
  btn.textContent = 'Starting…';
  try {
    const job = await api('/api/jobs', {
      method: 'POST',
      body: { queries: [...form.niches], states: [...form.states], leadCap: form.leadCap || null, costCap: Number(form.costCap) || null, skipCovered: form.skipCovered },
    });
    if (job.status === 'done' && job.error) toast(job.error, true);
    else toast('Scrape started. Leads appear as each city is searched.');
    activeRuns = 1;
    location.hash = '#/runs';
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = 'Start scrape';
  }
}

/* ---------- Runs ---------- */
function runsTable(jobs) {
  if (!jobs.length) return `<div class="table-wrap"><div class="empty">No runs yet.<br><a class="btn primary" href="#/new">Start your first scrape</a></div></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Started</th><th>Niches</th><th>States</th><th>Status</th><th>Leads found</th><th>Searches</th><th>Cost</th><th></th></tr></thead><tbody>
  ${jobs.map((j) => {
    const live = j.status === 'queued' || j.status === 'running';
    const pct = j.lead_cap ? Math.min(100, (j.leads_found / j.lead_cap) * 100) : null;
    const states = j.states.length > 6 ? j.states.slice(0, 6).join(', ') + ` +${j.states.length - 6}` : j.states.join(', ');
    return `<tr>
      <td class="num">${when(j.created_at)}</td>
      <td class="wrap" title="${esc(j.niche)}">${esc(j.niche)}</td>
      <td class="wrap" title="${esc(j.states.join(', '))}">${esc(states)}</td>
      <td><span class="status ${j.status}">${j.status === 'queued' ? 'starting' : j.status}</span>${j.error ? `<div class="note">${esc(j.error)}</div>` : ''}</td>
      <td style="min-width:170px"><div class="num">${fmt(j.leads_found)}${j.lead_cap ? ' of ' + fmt(j.lead_cap) : ''}</div>${pct !== null ? `<div class="tape" style="margin-top:4px"><span style="width:${pct}%"></span></div>` : ''}</td>
      <td class="num">${fmt(j.queries_used)}</td>
      <td class="num">${money(j.est_cost_usd)}</td>
      <td><div class="row" style="flex-wrap:nowrap">
        <a class="btn small" href="#/leads?job=${j.id}">View leads</a>
        ${live ? `<button class="btn small danger" data-stop="${j.id}">Stop</button>` : ''}
      </div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function bindStopButtons() {
  document.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Stop this run? Leads found so far are kept.')) return;
    b.disabled = true;
    try { await api('/api/jobs/stop', { method: 'POST', body: { id: b.dataset.stop } }); toast('Run stopped.'); }
    catch (e) { toast(e.message, true); }
    await refreshBadge();
    route();
  }));
}

async function renderRunsTable() {
  const jobs = await refreshBadge();
  if (!jobs || !$('#runsTable')) return;
  $('#runsTable').innerHTML = runsTable(jobs);
  bindStopButtons();
}

function viewRuns() {
  const v = $('#view');
  v.dataset.page = 'runs';
  v.innerHTML = `<div class="page-head"><div><h1>Runs</h1><p>Runs keep going in the background, about one minute of searching per minute, and faster while this page is open.</p></div>
    <a class="btn primary" href="#/new">New scrape</a></div><div id="runsTable"><div class="empty">Loading runs…</div></div>`;
  renderRunsTable();
}

/* ---------- Leads ---------- */
const leadState = { offset: 0, limit: 50 };

async function viewLeads(params) {
  const v = $('#view');
  v.dataset.page = 'leads';
  const job = params.get('job') || '';
  leadState.offset = 0;
  let stats = { niches: [], states: [] };
  try { stats = await api('/api/stats'); } catch {}
  v.innerHTML = `
  <div class="page-head"><div><h1>Leads</h1><p>${job ? 'Showing leads from one run. <a href="#/leads">Show all leads</a>' : 'Every business scraped, newest first.'}</p></div>
    <button class="btn primary" id="exportBtn">Export CSV</button></div>
  <div class="filters">
    <div><label for="fq">Company</label><input type="search" id="fq" placeholder="Search by name"></div>
    <div><label for="fstate">State</label><select id="fstate"><option value="">All states</option>${(stats.states || []).sort().map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
    <div><label for="fniche">Niche</label><select id="fniche"><option value="">All niches</option>${(stats.niches || []).sort().map((n) => `<option>${esc(n)}</option>`).join('')}</select></div>
    <div><label for="femail">Email</label><select id="femail"><option value="">Any</option><option value="yes">Has email</option><option value="no">No email</option></select></div>
    <div><label for="fline">Line type</label><select id="fline"><option value="">Any</option><option value="unchecked">Unchecked</option><option value="mobile">Mobile</option><option value="landline">Landline</option><option value="voip">VoIP</option></select></div>
    <button class="btn" id="fclear">Clear</button>
  </div>
  <div id="leadTable"><div class="table-wrap"><div class="empty">Loading leads…</div></div></div>
  <div class="pager"><span id="pageInfo"></span><div class="row"><button class="btn small" id="prev">Previous</button><button class="btn small" id="next">Next</button></div></div>`;

  const filters = () => {
    const p = new URLSearchParams();
    if (job) p.set('job', job);
    [['q', '#fq'], ['state', '#fstate'], ['niche', '#fniche'], ['email', '#femail'], ['line', '#fline']].forEach(([k, s]) => { const val = $(s).value.trim(); if (val) p.set(k, val); });
    return p;
  };
  let timer;
  const reload = () => { leadState.offset = 0; loadLeads(filters()); };
  ['#fstate', '#fniche', '#femail', '#fline'].forEach((s) => $(s).addEventListener('change', reload));
  $('#fq').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 300); });
  $('#fclear').addEventListener('click', () => { ['#fq', '#fstate', '#fniche', '#femail', '#fline'].forEach((s) => ($(s).value = '')); reload(); });
  $('#prev').addEventListener('click', () => { leadState.offset = Math.max(0, leadState.offset - leadState.limit); loadLeads(filters()); });
  $('#next').addEventListener('click', () => { leadState.offset += leadState.limit; loadLeads(filters()); });
  $('#exportBtn').addEventListener('click', () => exportCsv(filters()));
  loadLeads(filters());
}

async function loadLeads(p) {
  p.set('limit', leadState.limit);
  p.set('offset', leadState.offset);
  try {
    const { rows, total } = await api('/api/leads?' + p);
    $('#leadTable').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Company</th><th>Phone</th><th>Email</th><th>Website</th><th>City</th><th>State</th><th>Rating</th><th>Reviews</th><th>Niche</th><th>Line</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td class="wrap" title="${esc(r.company_name)}">${r.maps_url ? `<a href="${esc(r.maps_url)}" target="_blank" rel="noopener">${esc(r.company_name)}</a>` : esc(r.company_name)}</td>
        <td class="num" style="white-space:nowrap">${esc(r.phone)}</td>
        <td class="wrap">${r.email ? esc(r.email) : '<span class="muted">–</span>'}</td>
        <td class="wrap">${r.website ? `<a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(r.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : '<span class="muted">–</span>'}</td>
        <td>${esc(r.city)}</td><td>${esc(r.state)}</td>
        <td class="num">${r.rating ?? '–'}</td><td class="num">${r.review_count ?? '–'}</td>
        <td class="wrap">${esc(r.niche)}</td><td>${esc(r.line_type)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="table-wrap"><div class="empty">No leads match these filters.</div></div>`;
    const from = total ? leadState.offset + 1 : 0;
    $('#pageInfo').textContent = `${fmt(from)}–${fmt(leadState.offset + rows.length)} of ${fmt(total)}`;
    $('#prev').disabled = leadState.offset === 0;
    $('#next').disabled = leadState.offset + rows.length >= total;
    leadState.total = total;
  } catch (e) { toast(e.message, true); }
}

async function exportCsv(p) {
  const btn = $('#exportBtn');
  btn.disabled = true;
  const cols = ['company_name', 'phone', 'phone_e164', 'email', 'website', 'address', 'city', 'state', 'zip', 'category', 'rating', 'review_count', 'maps_url', 'niche', 'line_type', 'created_at'];
  const head = ['Company Name', 'Phone', 'Phone (E.164)', 'Email', 'Website', 'Address', 'City', 'State', 'Zip Code', 'Category', 'Rating', 'Review Count', 'Google Maps Link', 'Niche', 'Line Type', 'Scraped At'];
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [head.join(',')];
  try {
    let offset = 0, total = Infinity;
    while (offset < total) {
      btn.textContent = `Exporting ${fmt(offset)}…`;
      p.set('limit', 1000); p.set('offset', offset);
      const res = await api('/api/leads?' + p);
      total = res.total;
      res.rows.forEach((r) => lines.push(cols.map((c) => cell(r[c])).join(',')));
      if (!res.rows.length) break;
      offset += res.rows.length;
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Exported ${fmt(lines.length - 1)} leads.`);
  } catch (e) { toast(e.message, true); }
  btn.disabled = false;
  btn.textContent = 'Export CSV';
}

/* ---------- Settings ---------- */
async function viewSettings() {
  const v = $('#view');
  v.dataset.page = 'settings';
  v.innerHTML = `<div class="page-head"><div><h1>Settings</h1></div></div>
  <section class="panel">
    <div class="toggle-row">
      <div><h2>Mobile check with Twilio</h2>
      <p class="hint" style="margin:6px 0 0">When on, every phone number is checked as mobile, landline or VoIP for about a cent each, so texts only go to mobiles. It is switched off. Leads stay marked "unchecked" until it is turned on, and existing leads get checked then too.</p></div>
      <button class="switch" role="switch" aria-checked="false" aria-label="Mobile check with Twilio" disabled></button>
    </div>
    <p class="lock" style="margin-top:10px">Locked off. Turning it on needs Twilio keys in Netlify and a change in the database.</p>
  </section>
  <section class="panel">
    <h2>Search cost</h2>
    <p class="hint" style="margin:6px 0 0">Cost figures assume $1 per 1,000 Serper searches. If you buy a bigger Serper pack, set SERPER_COST_PER_1K in Netlify to your real rate so run costs stay accurate.</p>
  </section>
  <section class="panel"><div class="toggle-row"><div><h2>Sign out</h2><p class="hint" style="margin:6px 0 0">Removes the saved password from this browser.</p></div><button class="btn" id="signOut">Sign out</button></div></section>`;
  $('#signOut').addEventListener('click', signOut);
}

/* ---------- Boot ---------- */
if (password) {
  api('/api/login', { method: 'POST' }).then(start).catch(() => { $('#login').hidden = false; });
} else {
  $('#login').hidden = false;
}
