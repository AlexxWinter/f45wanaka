// F45 Wanaka — Open Week waitlist handler
// Receives the /openweek/ landing page form, emails an instant alert via Resend,
// then best-effort syncs the contact to the MailerCloud Open Week waitlist list.
//
// Env vars (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY          (already set from Locked In — reused here)
//   ALERT_TO                (optional, defaults to wanaka@f45training.co.nz)
//   ALERT_FROM              (optional, defaults to Resend's test sender until domain verified)
//   MAILERCLOUD_API_KEY     (already set from Locked In — reused here)
//   MAILERCLOUD_LIST_OPENWEEK   (optional — defaults to 'HAwIiH', the F45 Open Week Waitlist list)

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
    const honeypot = String(body.company || '').trim();

    // Bot trap: silently accept without emailing or syncing.
    if (honeypot) return res.status(200).json({ ok: true });

    if (!name || !email || !phone) {
      return res.status(400).json({ ok: false, error: 'Please add your name, email and mobile.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "That email doesn't look right." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Email service not configured yet.' });

    const to = process.env.ALERT_TO || 'wanaka@f45training.co.nz';
    const from = process.env.ALERT_FROM || 'F45 Wanaka Open Week <onboarding@resend.dev>';

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: `Open Week waitlist: ${name}`,
        html: `
          <h2>New Open Week waitlist signup</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        `,
      }),
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text();
      console.error('Resend send failed', emailRes.status, detail);
      return res.status(502).json({ ok: false, error: 'Could not send alert email.' });
    }

    // Secondary, best-effort: add the contact to MailerCloud so nurture fires.
    // Never blocks the form — the email alert above is the source of truth.
    const mcKey = process.env.MAILERCLOUD_API_KEY;
    if (mcKey) {
      try {
        const listId = process.env.MAILERCLOUD_LIST_OPENWEEK || 'HAwIiH';
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
    console.error('Handler error', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
