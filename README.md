# F45 Wanaka — Locked In landing page

Static site. The landing page lives at `/lockedin/`, so once your domain is
connected it is served at **f45wanaka.co.nz/lockedin/**. The bare domain
redirects there automatically.

Works as-is on Vercel, Netlify, or Cloudflare Pages. No build step, no framework.

## Put it live via GitHub + Vercel (no command line)

1. **Make a GitHub repo.** At github.com, sign up (free), click **New repository**,
   name it `f45wanaka-lockedin`, create it.
2. **Upload these files.** On the new repo page, click **uploading an existing file**
   and drag in everything from this folder (the `lockedin` folder, `vercel.json`,
   `_redirects`, this README). Commit.
3. **Import to Vercel.** At vercel.com, sign up with your GitHub account,
   click **Add New… > Project**, pick this repo, click **Deploy**. It goes live
   at a temporary `.vercel.app` address in seconds, with the page at `/lockedin/`.
4. **Add your domain.** In the Vercel project: **Settings > Domains**, add
   `f45wanaka.co.nz`. Vercel shows the exact DNS records to add.
5. **Point DNS.** At your domain registrar, add the records Vercel gives you.
   The parking page disappears once DNS points at Vercel, and HTTPS turns on by
   itself. Live at **f45wanaka.co.nz/lockedin/** within minutes to an hour or two.

To update later: edit the file on GitHub (or push a change) and Vercel redeploys
automatically. Every change gets a preview link first.

## Or the fast way (Netlify, no git)

Drag this whole folder onto app.netlify.com/drop, claim it, add the domain in
Domain settings. The included `_redirects` handles the root redirect.
