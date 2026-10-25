// Price Moves – Cloudflare Worker
// Serves the static site from /public and one JSON endpoint, /api/prices,
// built from Airtable and cached at the edge so Airtable is only asked a few times a day.
// The Airtable token lives in the AIRTABLE_TOKEN secret (never in the browser or in git).

const BASE = "appGyEcbEm92sKM9l";
const T_PRODUCTS = "tblMPVLZawN93UcRu";
const T_OBS = "tblgzksmh5T8aBjce";

// Products fields
const P = {
  id: "fld4XROSOaEiVv26o", item: "fldkxbgyAX4GrW5g7", cat: "fldhyLvvYWYW0GY4Q", sub: "fldxeLWcMwCI13a13",
  spec: "fldmJNaYSFZ73g6yt", unit: "fldJYp3wEXk0MmOZV", tier: "fldk8DjIA8ZqY17qR", prov: "fldujJBtbCxvx3Aax",
  include: "fld4SvJ0Pwr9x388s", method: "fldcd8CkHdN1KLtbh",
};
// Price Observations fields
const O = {
  product: "fldh9M3Sd3U0MeqHK", price: "fldc6WJgzS87b2zwP", date: "fldteZgh5gkenQnBm", source: "fldQdtGJhGzk7fHvk",
  province: "fldFEZ97skGmKri9i", city: "fldtISsfo6vJ0UkEq", pack: "fldFVLSQgW45qngyA", vat: "fldLjqGf7Cjx45tgp",
  promo: "fld6RBJO9YLr92A7N", confidence: "fldtItLDOEHgRh9M0", publish: "fld0NvwNlwYGSr6i1",
};

const CACHE_SECONDS = 6 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/prices") return prices(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};

async function prices(request, env, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/prices", request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const data = await build(env);
    const res = new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Prices are temporarily unavailable." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

async function list(env, table, fields, formula) {
  const records = [];
  let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${table}`);
    u.searchParams.set("returnFieldsByFieldId", "true");
    u.searchParams.set("pageSize", "100");
    for (const f of fields) u.searchParams.append("fields[]", f);
    if (formula) u.searchParams.set("filterByFormula", formula);
    if (offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const j = await r.json();
    records.push(...j.records);
    offset = j.offset;
  } while (offset);
  return records;
}

const sel = (v) => (v && typeof v === "object" ? v.name : v) ?? "";

async function build(env) {
  const [products, obs] = await Promise.all([
    list(env, T_PRODUCTS, Object.values(P), "{Include}"),
    list(env, T_OBS, Object.values(O), "{Publish} = 1"),
  ]);
  const byRec = new Map();
  for (const r of products) {
    const f = r.fields;
    byRec.set(r.id, {
      id: f[P.id], name: f[P.item], cat: sel(f[P.cat]), sub: f[P.sub] || "", spec: f[P.spec] || "",
      unit: f[P.unit] || "", tier: sel(f[P.tier]), prov: !!f[P.prov], method: sel(f[P.method]), obs: [],
    });
  }
  let latest = "";
  for (const r of obs) {
    const f = r.fields;
    const prod = byRec.get((f[O.product] || [])[0]);
    if (!prod || typeof f[O.price] !== "number" || !f[O.date]) continue;
    prod.obs.push([f[O.date], f[O.price], f[O.source] || "", sel(f[O.province]) || "National", f[O.city] || "",
                   f[O.pack] || "", sel(f[O.vat]), !!f[O.promo]]);
    if (f[O.date] > latest) latest = f[O.date];
  }
  const items = [...byRec.values()].filter((p) => p.obs.length).map((p) => {
    p.obs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return p;
  });
  return {
    generated: new Date().toISOString(),
    latest,
    fields: ["date", "price", "source", "province", "city", "packSeen", "vat", "promotion"],
    items,
  };
}
