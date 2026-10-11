# JarFriends shop (jarfriends.com)

Backup of the source that runs https://jarfriends.com (Vercel project `collectors-page`).

- `api/` server functions (orders, offers, back office, emails). Base files; the `patch*.js` scripts in the root change them at build time, in the order given in `vercel.json`.
- `public/` checkout, back office and other pages. `public/index.html` (the home page) is not here: `build.js` fetches the published design at build time and `patchhome.js` applies `home-changes*.json` to it.
- `design/` the home page and chat design sources.
- Secrets (Stripe, Resend, Shippo, Square, Discord webhook, admin passcode) are NOT in this repo. They live in the Vercel project's environment variables.

This repo is a backup. The live site is deployed straight to Vercel, not from this repo.
