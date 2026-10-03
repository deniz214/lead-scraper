-- Lead Scraper — migration 002 (run once, after 001)
-- Supabase → SQL Editor → New query → paste → Run

-- Searches run per city ("Cranston, RI"), not per ZIP, so rename the column.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='job_tasks' and column_name='zip') then
    alter table job_tasks rename column zip to area;
  end if;
  if exists (select 1 from information_schema.columns where table_name='coverage' and column_name='zip') then
    alter table coverage rename column zip to area;
  end if;
end $$;

alter table job_tasks add column if not exists claimed_at timestamptz;
create index if not exists job_tasks_status_idx on job_tasks (status, id);
create index if not exists leads_email_queue_idx on leads (created_at) where email_crawled = false and website is not null;
create index if not exists leads_lookup_queue_idx on leads (created_at) where line_type = 'unchecked' and phone_e164 is not null;

-- Create a run and all of its search tasks in one go.
create or replace function create_job(
  p_niche text, p_queries text[], p_states text[], p_areas jsonb,
  p_lead_cap int, p_cost_cap numeric, p_skip_covered boolean
) returns jobs language plpgsql as $$
declare j jobs; n int;
begin
  insert into jobs (niche, states, lead_cap, cost_cap_usd, status)
  values (p_niche, p_states, p_lead_cap, p_cost_cap, 'queued')
  returning * into j;

  insert into job_tasks (job_id, query, area, state, page)
  select j.id, q.query, a.value->>'area', a.value->>'state', 1
  from jsonb_array_elements(p_areas) with ordinality as a(value, ord)
  cross join unnest(p_queries) with ordinality as q(query, qord)
  where not (p_skip_covered and exists (
    select 1 from coverage c
    where c.query = q.query and c.area = a.value->>'area'
      and c.last_run_at > now() - interval '90 days'))
  order by a.ord, q.qord
  on conflict do nothing;
  get diagnostics n = row_count;

  if n = 0 then
    update jobs set status = 'done', updated_at = now(),
      error = 'Every selected area was already scraped for this niche in the last 90 days. Untick "Skip cities already searched" to run them again.'
    where id = j.id returning * into j;
  end if;
  return j;
end $$;

-- Hand out the next search tasks to a worker (safe with several workers at once).
create or replace function claim_tasks(p_limit int) returns setof job_tasks language plpgsql as $$
begin
  return query
  with picked as (
    select t.id from job_tasks t join jobs j on j.id = t.job_id
    where j.status in ('queued','running')
      and (t.status = 'pending'
           or (t.status = 'running' and t.claimed_at < now() - interval '3 minutes' and t.attempts < 3))
    order by t.id
    limit p_limit
    for update of t skip locked
  )
  update job_tasks t set status = 'running', attempts = t.attempts + 1, claimed_at = now()
  from picked where t.id = picked.id
  returning t.*;

  update jobs set status = 'running', updated_at = now()
  where status = 'queued'
    and exists (select 1 from job_tasks t where t.job_id = jobs.id and t.status = 'running');
end $$;

-- Insert leads, silently skipping any duplicate business or phone number.
create or replace function insert_leads(p_rows jsonb) returns int language plpgsql as $$
declare n int;
begin
  insert into leads (place_cid, company_name, phone, phone_e164, website, address, city, state, zip,
                     category, rating, review_count, maps_url, niche, job_id)
  select place_cid, company_name, phone, phone_e164, website, address, city, state, zip,
         category, rating, review_count, maps_url, niche, job_id
  from jsonb_to_recordset(p_rows) as x(
    place_cid text, company_name text, phone text, phone_e164 text, website text, address text,
    city text, state text, zip text, category text, rating numeric, review_count int,
    maps_url text, niche text, job_id uuid)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Add progress to a run and stop it when the lead cap or cost ceiling is hit.
create or replace function bump_job(p_job uuid, p_leads int, p_queries int, p_cost numeric)
returns void language plpgsql as $$
declare j jobs;
begin
  update jobs set leads_found = leads_found + p_leads, queries_used = queries_used + p_queries,
                  est_cost_usd = est_cost_usd + p_cost, updated_at = now()
  where id = p_job returning * into j;

  if j.status in ('queued','running') and (
       (j.lead_cap is not null and j.leads_found >= j.lead_cap) or
       (j.cost_cap_usd is not null and j.est_cost_usd >= j.cost_cap_usd)) then
    update jobs set status = 'done',
      error = case when j.lead_cap is not null and j.leads_found >= j.lead_cap
                   then 'Lead cap reached.' else 'Cost ceiling reached.' end
    where id = p_job;
    update job_tasks set status = 'skipped' where job_id = p_job and status = 'pending';
  end if;
end $$;

create or replace function stop_job(p_job uuid, p_reason text default null) returns void language sql as $$
  update jobs set status = 'stopped', error = coalesce(p_reason, 'Stopped by you.'), updated_at = now()
  where id = p_job and status in ('queued','running');
  update job_tasks set status = 'skipped' where job_id = p_job and status = 'pending';
$$;

-- Mark runs done once nothing is left to search.
create or replace function finish_jobs() returns void language sql as $$
  update job_tasks set status = 'failed'
  where status = 'running' and claimed_at < now() - interval '3 minutes' and attempts >= 3;
  update jobs j set status = 'done', updated_at = now()
  where j.status in ('queued','running')
    and not exists (select 1 from job_tasks t where t.job_id = j.id and t.status in ('pending','running'));
$$;

-- Hand out leads whose website still needs an email crawl.
create or replace function claim_email_leads(p_limit int) returns table(lead_id uuid, site text) language sql as $$
  update leads l set email_crawled = true
  where l.id in (select id from leads where email_crawled = false and website is not null
                 order by created_at limit p_limit for update skip locked)
  returning l.id, l.website;
$$;

-- Hand out leads for the mobile check (only used once the Twilio toggle is on).
create or replace function claim_lookup_leads(p_limit int) returns table(lead_id uuid, e164 text) language sql as $$
  update leads l set line_type = 'checking'
  where l.id in (select id from leads where line_type = 'unchecked' and phone_e164 is not null
                 order by created_at limit p_limit for update skip locked)
  returning l.id, l.phone_e164;
$$;

create or replace function dashboard_stats() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total',          (select count(*) from leads),
    'with_email',     (select count(*) from leads where email is not null),
    'this_month',     (select count(*) from leads where created_at >= date_trunc('month', now())),
    'spend_month',    (select coalesce(sum(est_cost_usd), 0) from jobs where created_at >= date_trunc('month', now())),
    'running',        (select count(*) from jobs where status in ('queued','running')),
    'emails_pending', (select count(*) from leads where email_crawled = false and website is not null),
    'niches',         (select coalesce(jsonb_agg(distinct niche), '[]'::jsonb) from leads where niche is not null),
    'states',         (select coalesce(jsonb_agg(distinct state), '[]'::jsonb) from leads where state is not null),
    'twilio_enabled', coalesce((select value from settings where key = 'twilio_lookup_enabled'), 'false'::jsonb)
  );
$$;

-- Only the server-side secret key may call these.
do $$
declare f text;
begin
  foreach f in array array[
    'create_job(text,text[],text[],jsonb,int,numeric,boolean)',
    'claim_tasks(int)', 'insert_leads(jsonb)', 'bump_job(uuid,int,int,numeric)',
    'stop_job(uuid,text)', 'finish_jobs()', 'claim_email_leads(int)',
    'claim_lookup_leads(int)', 'dashboard_stats()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
