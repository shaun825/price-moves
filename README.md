# Price Moves

Public site for pricemoves.co.za. A Cloudflare Worker serves the static site in `public/` and one endpoint, `/api/prices`, which reads published prices from Airtable and caches them at the edge for 6 hours.

## How it fits together

- **Airtable** (base `appGyEcbEm92sKM9l`) holds Products and Price Observations. An observation shows on the site when its **Publish** formula is 1: it has a price, is not ticked **Rejected**, and is either ticked **Valid** or has **High** confidence.
- **Make** runs the monthly fuel import and the monthly research run, which write new observations.
- **GitHub Actions** runs `scripts/build-prices.mjs` before every deploy: it reads Products where Include is ticked plus published observations from Airtable (about 6 requests) and writes `public/data/prices.json`. Deploys run on every push, daily at 05:00 SAST, and on demand. Visitors never cause Airtable requests.
- **The Worker** (`src/worker.js`) just serves the static site.
- **Fuel history** (`public/data/fuel-history.json`) is a static file: official monthly prices from 2012 (Fuels Industry Association of South Africa) and inland 93 petrol data points back to 1976 (Stats SA). It is kept out of Airtable to save records.
- `public/data/prices.json` in the repo is only a local-preview copy; the deployed one is rebuilt each run.

## One-time setup

Deploys run from GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`.

1. **Cloudflare API token**: Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**. Note your **Account ID** (Workers & Pages overview, right-hand side).
2. **Airtable token**: airtable.com/create/tokens → scope `data.records:read` only, access to the Price Catalogue base only.
3. **GitHub secrets**: repo → Settings → Secrets and variables → Actions → New repository secret. Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `AIRTABLE_TOKEN`.
4. **Deploy**: Actions tab → Deploy to Cloudflare → Run workflow (or push any change). The site appears at `price-moves.<your-subdomain>.workers.dev`.
5. **Domain**: once pricemoves.co.za uses Cloudflare nameservers, uncomment the `routes` line in `wrangler.jsonc` and push.

## After each monthly run

Review new observations in Airtable. Tick **Valid** on Medium or Low confidence prices that look right, or **Rejected** on ones that don't. The site picks up changes at the next daily run (05:00), or straight away via Actions → Deploy to Cloudflare → Run workflow.

## Local preview

`AIRTABLE_TOKEN=… node scripts/build-prices.mjs` then `npx wrangler dev`. Never commit tokens.
