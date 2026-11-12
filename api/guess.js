// F45 Wanaka — Twilight Fair "Guess the weight" entry handler (iPad kiosk).
// Every entry emails an instant alert to the studio via Resend (operational
// record of the guess, used to run the game and notify the winner). If the
// person ticks permission to contact, they are also added to a MailerCloud
// marketing list. Entries are captured regardless of marketing consent.
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   RESEND_API_KEY          (required - already set)
//   ALERT_TO                (optional, defaults to wanaka@f45training.co.nz)
//   ALERT_FROM              (optional, defaults to Resend's test sender)
//   MAILERCLOUD_API_KEY     (optional - enables list sync)
//   MAILERCLOUD_LIST_GUESS  (optional - the guess-the-weight marketing list id)

const SOURCE = 'Twilight Fair 2026 Guess the Weight';

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
    const guessRaw = String(body.guess || '').trim();
    const guess = parseInt(guessRaw.replace(/[^0-9]/g, ''), 10);
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
    const honeypot = String(body.company || '').trim();

    if (honeypot) return res.status(200).json({ ok: true }); // bot trap

    if (!name || !email || !phone) {
      return res.status(400).json({ ok: false, error: 'Please fill in name, phone and email.' });
    }
    if (!Number.isFinite(guess) || guess <= 0) {
      return res.status(400).json({ ok: false, error: 'Please enter a guess in grams (numbers only).' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "That email doesn't look right." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Entry service not configured yet.' });

    const to = process.env.ALERT_TO || 'wanaka@f45training.co.nz';
    const from = process.env.ALERT_FROM || 'F45 Wanaka Guess the Weight <onboarding@resend.dev>';
    const when = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
    const guessG = guess.toLocaleString('en-NZ');
    const guessKg = (guess / 1000).toLocaleString('en-NZ', { maximumFractionDigits: 2 });

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#182134">
        <div style="background:#C73331;color:#fff;padding:16px 20px;font-weight:bold;font-size:16px">New guess &mdash; ${esc(guessG)} g</div>
        <div style="border:2px solid #182134;border-top:none;padding:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#5A6478;width:90px">Guess</td><td style="padding:6px 0;font-weight:bold;font-size:18px">${esc(guessG)} g <span style="font-weight:normal;color:#5A6478">(${esc(guessKg)} kg)</span></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Name</td><td style="padding:6px 0;font-weight:bold">${esc(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Email</td><td style="padding:6px 0"><a href="mailto:${esc(email)}" style="color:#C73331">${esc(email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Phone</td><td style="padding:6px 0"><a href="tel:${esc(phone)}" style="color:#C73331">${esc(phone)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Contact OK</td><td style="padding:6px 0">${consent ? 'Yes' : 'No'}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Source</td><td style="padding:6px 0">${esc(SOURCE)}</td></tr>
            <tr><td style="padding:6px 0;color:#5A6478">Received</td><td style="padding:6px 0">${esc(when)} (NZ)</td></tr>
          </table>
        </div>
      </div>`;
    const text = `New guess: ${guessG} g (${guessKg} kg)\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nContact OK: ${consent ? 'Yes' : 'No'}\nSource: ${SOURCE}\nReceived: ${when} (NZ)`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `Guess: ${guessG}g - ${name}`, html, text }),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error', r.status, detail);
      return res.status(502).json({ ok: false, error: 'Could not save that entry. Please try again.' });
    }

    // Marketing sync only when the person ticked permission to contact.
    const mcKey = process.env.MAILERCLOUD_API_KEY;
    const mcList = process.env.MAILERCLOUD_LIST_GUESS;
    if (consent && mcKey && mcList) {
      const core = { email, name, phone, list_id: mcList, contact_type: 'active' };
      const withFields = Object.assign({}, core, { source: SOURCE, guess_grams: String(guess) });
      const post = (payload) => fetch('https://cloudapi.mailercloud.com/v1/contacts', {
        method: 'POST',
        headers: { Authorization: mcKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      try {
        let mc = await post(withFields);
        if (!mc.ok) {
          console.error('MailerCloud sync (with fields)', mc.status, await mc.text());
          mc = await post(core);
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
