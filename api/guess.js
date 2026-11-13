// F45 Wanaka — Twilight Fair "Guess the weight" entry handler (iPad kiosk).
// Primary capture: appends every guess as a row to a Google Sheet (via a
// Google Apps Script web app). If the person ticks permission to contact, they
// are also added to a MailerCloud marketing list. If the Sheet write fails for
// any reason, the entry is emailed to the studio as a fallback so no guess is
// ever lost. Entries are captured regardless of marketing consent.
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   GUESS_SHEET_URL         (required for DB capture - the Apps Script /exec URL)
//   GUESS_SHEET_SECRET      (optional - shared secret checked by the script)
//   RESEND_API_KEY          (required - used for the fallback alert)
//   ALERT_TO                (optional, defaults to wanaka@f45training.co.nz)
//   ALERT_FROM              (optional, defaults to Resend's test sender)
//   MAILERCLOUD_API_KEY        (optional - enables list sync)
//   MAILERCLOUD_LIST_TF26_GUESS (optional - the guess-the-weight marketing list id)

const SOURCE = 'Twilight Fair 2026 Guess the Weight';

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
    const guessRaw = String(body.guess || '').trim();
    const guess = parseInt(guessRaw.replace(/[^0-9]/g, ''), 10);
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
    const entrant = String(body.entrant || '').trim() === 'Child' ? 'Child' : (String(body.entrant || '').trim() === 'Adult' ? 'Adult' : '');
    const honeypot = String(body.company || '').trim();

    if (honeypot) return res.status(200).json({ ok: true }); // bot trap

    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ ok: false, error: 'Please fill in name, phone and email.' });
    }
    if (!Number.isFinite(guess) || guess <= 0) {
      return res.status(400).json({ ok: false, error: 'Please enter a guess in grams (numbers only).' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "That email doesn't look right." });
    }
    if (!entrant) {
      return res.status(400).json({ ok: false, error: 'Please choose adult or child.' });
    }

    const when = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });

    // ---- Primary capture: append a row to the Google Sheet ----
    let sheetOk = false;
    const sheetUrl = process.env.GUESS_SHEET_URL;
    if (sheetUrl) {
      try {
        const sr = await fetch(sheetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: process.env.GUESS_SHEET_SECRET || '',
            received: when, firstName, lastName, phone, email,
            guess, entrant, consent: consent ? 'Yes' : 'No', source: SOURCE,
          }),
        });
        const sj = await sr.json().catch(() => ({}));
        sheetOk = sr.ok && sj && sj.ok === true;
        if (!sheetOk) console.error('Sheet write failed', sr.status, JSON.stringify(sj));
      } catch (e) { console.error('Sheet error', e); }
    }

    // ---- Marketing sync (adults only, and only with permission to contact) ----
    // Children's entries are never added to the marketing list, even if the box
    // is ticked. Their guess is still captured in the Sheet above for the draw.
    const mcKey = process.env.MAILERCLOUD_API_KEY;
    const mcList = process.env.MAILERCLOUD_LIST_TF26_GUESS;
    if (consent && entrant === 'Adult' && mcKey && mcList) {
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

    // ---- Fallback: only email the studio if the Sheet capture didn't work ----
    let fallbackOk = false;
    if (!sheetOk) {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const to = process.env.ALERT_TO || 'wanaka@f45training.co.nz';
        const from = process.env.ALERT_FROM || 'F45 Wanaka Guess the Weight <onboarding@resend.dev>';
        const guessG = guess.toLocaleString('en-NZ');
        const text = `GUESS (sheet capture failed - saved by email instead)\n\nGuess: ${guessG} g\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nEntering as: ${entrant}\nContact OK: ${consent ? 'Yes' : 'No'}\nSource: ${SOURCE}\nReceived: ${when} (NZ)`;
        // name above is firstName + lastName combined
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: [to], reply_to: email, subject: `Guess (backup): ${guessG}g - ${name}`, text }),
          });
          fallbackOk = r.ok;
          if (!r.ok) console.error('Fallback email failed', r.status, await r.text());
        } catch (e) { console.error('Fallback email error', e); }
      }
    }

    if (sheetOk || fallbackOk) return res.status(200).json({ ok: true });
    return res.status(502).json({ ok: false, error: 'Could not save that entry. Please try again.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
