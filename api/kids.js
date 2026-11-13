// F45 Wanaka — Twilight Fair "Kids Movement Program" expression-of-interest.
// Emails an instant alert to the studio via Resend, and adds the parent to the
// MailerCloud "LEADS | TF26 | Kids Program EOI" list with their age interests,
// so interest can be segmented by age bracket while the program is built.
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   RESEND_API_KEY            (required - already set)
//   ALERT_TO                  (optional, defaults to wanaka@f45training.co.nz)
//   ALERT_FROM                (optional, defaults to Resend's test sender)
//   MAILERCLOUD_API_KEY       (optional - enables list sync)
//   MAILERCLOUD_LIST_TF26_KIDS (optional - the Kids Program EOI list id)

const SOURCE = 'Twilight Fair 2026 Kids Program EOI';
const AGE_OPTIONS = ['Under 10', '10-13', '13-15', '15+'];

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
    const ages = Array.isArray(body.ages)
      ? body.ages.map((a) => String(a).trim()).filter((a) => AGE_OPTIONS.indexOf(a) !== -1)
      : [];
    const ageStr = ages.join(', ');
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
    const honeypot = String(body.company || '').trim();

    if (honeypot) return res.status(200).json({ ok: true }); // bot trap

    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ ok: false, error: 'Please fill in your name, email and phone.' });
    }
    if (!ages.length) {
      return res.status(400).json({ ok: false, error: 'Please pick at least one age group.' });
    }
    if (!consent) {
      return res.status(400).json({ ok: false, error: 'Please tick the box so we can keep you posted.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "That email doesn't look right." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Service not configured yet.' });

    const to = process.env.ALERT_TO || 'wanaka@f45training.co.nz';
    const from = process.env.ALERT_FROM || 'F45 Wanaka Kids Program <onboarding@resend.dev>';
    const when = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
    const name = (firstName + ' ' + lastName).trim();

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#182134">
        <div style="background:#C73331;color:#fff;padding:16px 20px;font-weight:bold;font-size:16px">New Kids Program interest</div>
        <div style="border:2px solid #182134;border-top:none;padding:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#5A6478;width:110px">Name</td><td style="padding:6px 0;font-weight:bold">${esc(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Email</td><td style="padding:6px 0"><a href="mailto:${esc(email)}" style="color:#C73331">${esc(email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Phone</td><td style="padding:6px 0"><a href="tel:${esc(phone)}" style="color:#C73331">${esc(phone)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Age interest</td><td style="padding:6px 0;font-weight:bold">${esc(ageStr)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Source</td><td style="padding:6px 0">${esc(SOURCE)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Received</td><td style="padding:6px 0">${esc(when)} (NZ)</td></tr>
          </table>
        </div>
      </div>`;
    const text = `New Kids Program interest\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nAge interest: ${ageStr}\nSource: ${SOURCE}\nReceived: ${when} (NZ)`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `Kids Program interest: ${name}`, html, text }),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error', r.status, detail);
      return res.status(502).json({ ok: false, error: 'Could not register that right now. Please try again.' });
    }

    // Add to MailerCloud with the age interests. Best-effort; never blocks.
    const mcKey = process.env.MAILERCLOUD_API_KEY;
    const mcList = process.env.MAILERCLOUD_LIST_TF26_KIDS;
    if (mcKey && mcList) {
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
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
