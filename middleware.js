// F45 Wanaka — password-protect the team-only pages.
// Guess the Weight (iPad kiosk) and the Bike Challenge tracker require a login;
// everything else on the site stays public. Runs server-side on Vercel's edge,
// so the pages genuinely won't load without the password.
//
// Change USER / PASS below to whatever you want the team to type.
// (They live server-side and are never sent to the browser.)

export const config = {
  matcher: [
    '/twilightfair/guesstheweight',
    '/twilightfair/guesstheweight/:path*',
    '/twilightfair/tracker',
    '/twilightfair/tracker/:path*',
  ],
};

const USER = 'f45team';
const PASS = '4545'; // team login password

export default function middleware(req) {
  const header = req.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    try {
      const decoded = atob(encoded);
      const i = decoded.indexOf(':');
      const u = decoded.slice(0, i);
      const p = decoded.slice(i + 1);
      if (u === USER && p === PASS) return; // correct login -> let the page load
    } catch (e) { /* fall through to prompt */ }
  }
  return new Response('F45 Wanaka team access only.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="F45 Wanaka team", charset="UTF-8"' },
  });
}
