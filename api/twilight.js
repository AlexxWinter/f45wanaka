// F45 Wanaka — Twilight Fair "free 3 class pass" lead handler
// Emails an instant alert to the studio via Resend, and (optionally) adds the
// contact to the MailerCloud "WPS Twilight Fair 2026" list if its id is set.
// Every lead is captured by the alert email regardless of MailerCloud status.
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   RESEND_API_KEY             (required - already set for the other forms)
//   ALERT_TO                   (optional, defaults to wanaka@f45training.co.nz)
//   ALERT_FROM                 (optional, defaults to Resend's test sender)
//   MAILERCLOUD_API_KEY        (optional - enables list sync)
//   MAILERCLOUD_LIST_TF26_PASS (optional - the "LEADS | TF26 | 3 Class Pass" list id)

const SOURCE = 'Twilight Fair 2026 QR';
const COMMENCE_BY = '2027-01-31';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const name = (firstName + ' ' + lastName).trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
    const honeypot = String(body.company || '').trim();

    if (honeypot) return res.status(200).json({ ok: true }); // bot trap

    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ ok: false, error: 'Please fill in your name, email and phone.' });
    }
    if (!consent) {
      return res.status(400).json({ ok: false, error: 'Please tick the box so we can send your pass.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "That email doesn't look right." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Email service not configured yet.' });

    const to = process.env.ALERT_TO || 'wanaka@f45training.co.nz';
    const from = process.env.ALERT_FROM || 'F45 Wanaka Twilight Fair <onboarding@resend.dev>';
    const when = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1B2A46">
        <div style="background:#C33A2E;color:#fff;padding:16px 20px;font-weight:bold;font-size:16px">New 3 class pass &mdash; Twilight Fair</div>
        <div style="border:2px solid #1B2A46;border-top:none;padding:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#5A6478;width:90px">Name</td><td style="padding:6px 0;font-weight:bold">${esc(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Email</td><td style="padding:6px 0"><a href="mailto:${esc(email)}" style="color:#C33A2E">${esc(email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Phone</td><td style="padding:6px 0"><a href="tel:${esc(phone)}" style="color:#C33A2E">${esc(phone)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Source</td><td style="padding:6px 0">${esc(SOURCE)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Consent</td><td style="padding:6px 0">Yes</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Commence by</td><td style="padding:6px 0">31 Jan 2027</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Received</td><td style="padding:6px 0">${esc(when)} (NZ)</td></tr>
          </table>
        </div>
      </div>`;
    const text = `New 3 class pass - Twilight Fair\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nSource: ${SOURCE}\nConsent: Yes\nCommence by: 31 Jan 2027\nReceived: ${when} (NZ)`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `New 3 class pass: ${name}`, html, text }),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error', r.status, detail);
      return res.status(502).json({ ok: false, error: 'Could not send right now. Please try again.' });
    }

    // Optional: add to MailerCloud. Best-effort, never blocks the form.
    // Tries with custom fields first; if that insert is rejected, retries with
    // the core fields only so the contact always lands in the list.
    const mcKey = process.env.MAILERCLOUD_API_KEY;
    const mcList = process.env.MAILERCLOUD_LIST_TF26_PASS;
    if (mcKey && mcList) {
      const core = { email, name: firstName, last_name: lastName, phone, list_id: mcList, contact_type: 'active' };
      const withFields = Object.assign({}, core, {
        source: SOURCE,
        consent: 'Yes',
        commence_by: COMMENCE_BY,
      });
      const post = (payload) => fetch('https://cloudapi.mailercloud.com/v1/contacts', {
        method: 'POST',
        headers: { Authorization: mcKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      try {
        let mc = await post(withFields);
        if (!mc.ok) {
          console.error('MailerCloud sync (with fields)', mc.status, await mc.text());
          mc = await post(core); // fallback: guarantee the contact is added
          if (!mc.ok) console.error('MailerCloud sync (core)', mc.status, await mc.text());
        }
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
