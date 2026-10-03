# Lead Scraper

Google Maps lead scraper for contractor niches. Netlify (site + functions) and Supabase (data).

## How it works
1. You pick niches and states and start a run.
2. The run searches Google Maps through Serper, city by city (up to 3 result pages per city), and stores every business that has a phone number. Duplicates (same business or same phone) are skipped.
3. Each stored website is then checked for an email (homepage, then contact page).
4. A Netlify scheduled function works through runs every minute, so runs continue after the tab is closed. While the app is open it also works every few seconds.

## Netlify environment variables
| Name | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → secret key (or legacy service_role) |
| `SERPER_API_KEY` | serper.dev dashboard |
| `APP_PASSWORD` | any password you choose for logging in |
| `SERPER_COST_PER_1K` | optional, default `1` (dollars per 1,000 searches) |

## Database
Run `supabase/002-functions.sql` once in the Supabase SQL editor (after the first schema file).

## Turning on the Twilio mobile check later
1. Add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in Netlify and redeploy.
2. In the Supabase SQL editor run:
   `update settings set value = 'true'::jsonb where key = 'twilio_lookup_enabled';`
Existing "unchecked" leads are then checked too (about $0.008 each).
