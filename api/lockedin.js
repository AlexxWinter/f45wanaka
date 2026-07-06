// F45 Wanaka — Locked In registration handler
// Receives the landing page form, emails an instant alert via Resend.
// Env vars (set in Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  (required)
//   ALERT_TO        (optional, defaults to wanaka@f45training.co.nz)
//   ALERT_FROM      (optional, defaults to Resend's test sender until your domain is verified)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const pathway = String(body.pathway || '').trim();
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
    const honeypot = String(body.company || '').trim();

    // Bot trap: silently accept without emailing.
    if (honeypot) return res.status(200).json({ ok: true });

    if (!name || !email || !phone || !consent) {
      return res.status(400).json({ ok: false, error: 'Please add your name, email and phone, and tick the box.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "That email doesn't look right." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Email service not configured yet.' });

    const to = process.env.ALERT_TO || 'wanaka@f45training.co.nz';
    const from = process.env.ALERT_FROM || 'F45 Wanaka Locked In <onboarding@resend.dev>';

    const pathwayLabel =
      pathway === 'member' ? 'Existing member — $50 add-on' :
      pathway === 'new' ? 'New or returning — $399 / weekly' :
      'Not specified';
    const when = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#141414">
        <div style="background:#DE2027;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:bold;font-size:16px">New Locked In registration</div>
        <div style="border:1px solid #E4E0D7;border-top:none;border-radius:0 0 8px 8px;padding:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#6E6A62;width:90px">Name</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#6E6A62">Email</td><td style="padding:6px 0"><a href="mailto:${escapeHtml(email)}" style="color:#DE2027">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6E6A62">Phone</td><td style="padding:6px 0"><a href="tel:${escapeHtml(phone)}" style="color:#DE2027">${escapeHtml(phone)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6E6A62">Pathway</td><td style="padding:6px 0">${escapeHtml(pathwayLabel)}</td></tr>
            <tr><td style="padding:6px 0;color:#6E6A62">Consent</td><td style="padding:6px 0">Yes</td></tr>
            <tr><td style="padding:6px 0;color:#6E6A62">Received</td><td style="padding:6px 0">${escapeHtml(when)} (NZ)</td></tr>
          </table>
          <p style="font-size:13px;color:#6E6A62;margin:18px 0 0">Reply to this email to reach ${escapeHtml(name.split(' ')[0])} directly.</p>
        </div>
      </div>`;

    const text =
      `New Locked In registration\n\n` +
      `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n` +
      `Pathway: ${pathwayLabel}\nConsent: Yes\nReceived: ${when} (NZ)`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `New Locked In registration: ${name}`,
        html,
        text,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error', r.status, detail);
      return res.status(502).json({ ok: false, error: 'Could not send right now. Please try again.' });
    }

    // Secondary, best-effort: add the contact to MailerCloud so nurture fires.
    // Never blocks the form — the email alert above is the source of truth.
    const mcKey = process.env.MAILERCLOUD_API_KEY;
    if (mcKey) {
      try {
        // Route to the right list based on how they came in.
        // New/returning defaults to the existing "F45 Locked In Leads" list (gvJhCs).
        // Members go to MAILERCLOUD_LIST_MEMBER; if that isn't set yet, they
        // safely fall back to the new/returning list so no lead is ever lost.
        const listNew = process.env.MAILERCLOUD_LIST_NEW || process.env.MAILERCLOUD_LIST_ID || 'gvJhCs';
        const listMember = process.env.MAILERCLOUD_LIST_MEMBER || listNew;
        const listId = pathway === 'member' ? listMember : listNew;
        const mcRes = await fetch('https://cloudapi.mailercloud.com/v1/contacts', {
          method: 'POST',
          headers: { Authorization: mcKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            name: name,
            phone: phone,
            list_id: listId,
            contact_type: 'active',
          }),
        });
        if (!mcRes.ok) {
          const detail = await mcRes.text();
          // "already exists" is fine — they're already on the list.
          console.error('MailerCloud sync response', mcRes.status, detail);
        }
      } catch (mcErr) {
        console.error('MailerCloud sync error', mcErr);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
