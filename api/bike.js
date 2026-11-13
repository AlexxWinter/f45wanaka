// F45 Wanaka — Twilight Fair Bike Challenge adult lead sync.
// The tracker calls this when an adult rider gives an email AND ticks consent,
// adding them to the MailerCloud Bike list. Fire-and-forget from the tracker:
// the ride itself (and the adult's contact) is already stored in the rides
// Sheet, so this is purely the marketing-list sync.
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   MAILERCLOUD_API_KEY       (already set, shared with the other forms)
//   MAILERCLOUD_LIST_TF26_BIKE (the "LEADS | TF26 | Bike Challenge" list id)

const SOURCE = 'Twilight Fair 2026 Bike Challenge';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';

    if (!consent || !email) return res.status(200).json({ ok: true, skipped: 'no consent or email' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(200).json({ ok: true, skipped: 'bad email' });

    const mcKey = process.env.MAILERCLOUD_API_KEY;
    const mcList = process.env.MAILERCLOUD_LIST_TF26_BIKE;
    if (!mcKey || !mcList) return res.status(200).json({ ok: true, skipped: 'not configured' });

    const core = { email, first_name: firstName, last_name: lastName, phone, list_id: mcList, contact_type: 'active' };
    const post = (payload) => fetch('https://cloudapi.mailercloud.com/v1/contacts/upsert', {
        method: 'POST',
        headers: { Authorization: mcKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      try {
        const mc = await post(core); // core = first name, last name, email, phone only
        if (!mc.ok) console.error('MailerCloud upsert', mc.status, await mc.text());
      } catch (e) { console.error('MailerCloud error', e); }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ ok: true, error: 'logged' });
  }
}
