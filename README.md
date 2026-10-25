# Price Moves

Public site for pricemoves.co.za. A Cloudflare Worker serves the static site in `public/` and one endpoint, `/api/prices`, which reads published prices from Airtable and caches them at the edge for 6 hours.

## How it fits together

- **Airtable** (base `appGyEcbEm92sKM9l`) holds Products and Price Observations. An observation shows on the site when its **Publish** formula is 1: it has a price, is not ticked **Rejected**, and is either ticked **Valid** or has **High** confidence.
- **Make** runs the monthly fuel import and the monthly research run, which write new observations.
- **The Worker** (`src/worker.js`) fetches Products where Include is ticked, plus published observations, and returns them as one JSON file. Visitors never talk to Airtable, and the Airtable token never reaches the browser.
- **Fuel history** (`public/data/fuel-history.json`) is a static file: official monthly prices from 2012 (Fuels Industry Association of South Africa) and inland 93 petrol data points back to 1976 (Stats SA). It is kept out of Airtable to save records.
- `public/data/prices.json` is a snapshot used only if `/api/prices` is down.

## One-time setup

Deploys run from GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`.

1. **Cloudflare API token**: Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**. Note your **Account ID** (Workers & Pages overview, right-hand side).
2. **Airtable token**: airtable.com/create/tokens → scope `data.records:read` only, access to the Price Catalogue base only.
3. **GitHub secrets**: repo → Settings → Secrets and variables → Actions → New repository secret. Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `AIRTABLE_TOKEN`.
4. **Deploy**: Actions tab → Deploy to Cloudflare → Run workflow (or push any change). The site appears at `price-moves.<your-subdomain>.workers.dev`.
5. **Domain**: once pricemoves.co.za uses Cloudflare nameservers, uncomment the `routes` line in `wrangler.jsonc` and push.

## After each monthly run

Review new observations in Airtable. Tick **Valid** on Medium or Low confidence prices that look right, or **Rejected** on ones that don't. The site picks up changes within 6 hours.

## Local preview

`npx wrangler dev` with a `.dev.vars` file (see `.dev.vars.example`). Never commit `.dev.vars`.
