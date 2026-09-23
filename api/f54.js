// F45 Wanaka — F-54 expression-of-interest handler
// Emails an instant alert to the studio via Resend, and (optionally) adds the
// contact to a MailerCloud list if MAILERCLOUD_LIST_F54 is set.
// Env vars (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY        (required — already set for the Locked In form)
//   ALERT_TO              (optional, defaults to wanaka@f45training.co.nz)
//   ALERT_FROM            (optional, defaults to Resend's test sender)
//   MAILERCLOUD_API_KEY   (optional — enables list sync)
//   MAILERCLOUD_LIST_F54  (optional — the F-54 interest list id)

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
    const source = String(body.source || '').trim();
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
    const honeypot = String(body.company || '').trim();

    if (honeypot) return res.status(200).json({ ok: true }); // bot trap

    if (!firstName || !lastName || !email || !phone || !consent) {
      return res.status(400).json({ ok: false, error: 'Please fill in your name, email and phone, and tick the box.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "That email doesn't look right." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Email service not configured yet.' });

    const to = process.env.ALERT_TO || 'wanaka@f45training.co.nz';
    const from = process.env.ALERT_FROM || 'F45 Wanaka F-54 <onboarding@resend.dev>';
    const when = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
    const heard = source || 'Not specified';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1B2A46">
        <div style="background:#C33A2E;color:#fff;padding:16px 20px;font-weight:bold;font-size:16px">New F-54 interest</div>
        <div style="border:2px solid #1B2A46;border-top:none;padding:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#5A6478;width:90px">Name</td><td style="padding:6px 0;font-weight:bold">${esc(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Email</td><td style="padding:6px 0"><a href="mailto:${esc(email)}" style="color:#C33A2E">${esc(email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Phone</td><td style="padding:6px 0"><a href="tel:${esc(phone)}" style="color:#C33A2E">${esc(phone)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Heard via</td><td style="padding:6px 0">${esc(heard)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Consent</td><td style="padding:6px 0">Yes</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Received</td><td style="padding:6px 0">${esc(when)} (NZ)</td></tr>
          </table>
        </div>
      </div>`;
    const text = `New F-54 interest\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nHeard via: ${heard}\nConsent: Yes\nReceived: ${when} (NZ)`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `New F-54 interest: ${name}`, html, text }),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error', r.status, detail);
      return res.status(502).json({ ok: false, error: 'Could not send right now. Please try again.' });
    }

    // Optional: add to MailerCloud F-54 list (best-effort, never blocks the form).
    const mcKey = process.env.MAILERCLOUD_API_KEY;
    const mcList = process.env.MAILERCLOUD_LIST_F54;
    if (mcKey && mcList) {
      try {
        const mc = await fetch('https://cloudapi.mailercloud.com/v1/contacts', {
          method: 'POST',
          headers: { Authorization: mcKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, phone, list_id: mcList, contact_type: 'active' }),
        });
        if (!mc.ok) console.error('MailerCloud sync', mc.status, await mc.text());
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
