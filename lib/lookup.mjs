// Twilio mobile check. Only runs when the settings switch is on AND Twilio keys exist.
import { rest } from './db.mjs';

export async function lookupEnabled() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return false;
  const { data } = await rest('settings?key=eq.twilio_lookup_enabled&select=value');
  return data?.[0]?.value === true;
}

const MAP = { mobile: 'mobile', landline: 'landline', fixedVoip: 'voip', nonFixedVoip: 'voip' };

export async function lineType(e164) {
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}`);
  const body = await res.json();
  if (body.valid === false) return 'invalid';
  const type = body.line_type_intelligence?.type;
  return MAP[type] || (type ? 'other' : 'unknown');
}
