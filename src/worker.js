// Price Moves – Cloudflare Worker
// Serves the static site in /public. Prices live in /data/prices.json, which GitHub Actions
// builds from Airtable before each deploy, so visitors never cause Airtable requests.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/prices") return Response.redirect(new URL("/data/prices.json", url), 301);
    return env.ASSETS.fetch(request);
  },
};
