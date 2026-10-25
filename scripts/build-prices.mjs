// Reads published prices from Airtable and writes public/data/prices.json.
// Runs in GitHub Actions before each deploy (daily, on push, or on demand). Needs AIRTABLE_TOKEN.
import { writeFileSync } from "node:fs";

const BASE = "appGyEcbEm92sKM9l";
const T_PRODUCTS = "tblMPVLZawN93UcRu";
const T_OBS = "tblgzksmh5T8aBjce";
const P = {
  id: "fld4XROSOaEiVv26o", item: "fldkxbgyAX4GrW5g7", cat: "fldhyLvvYWYW0GY4Q", sub: "fldxeLWcMwCI13a13",
  spec: "fldmJNaYSFZ73g6yt", unit: "fldJYp3wEXk0MmOZV", tier: "fldk8DjIA8ZqY17qR", prov: "fldujJBtbCxvx3Aax",
  method: "fldcd8CkHdN1KLtbh",
};
const O = {
  product: "fldh9M3Sd3U0MeqHK", price: "fldc6WJgzS87b2zwP", date: "fldteZgh5gkenQnBm", source: "fldQdtGJhGzk7fHvk",
  province: "fldFEZ97skGmKri9i", city: "fldtISsfo6vJ0UkEq", pack: "fldFVLSQgW45qngyA", vat: "fldLjqGf7Cjx45tgp",
  promo: "fld6RBJO9YLr92A7N",
};
const token = process.env.AIRTABLE_TOKEN;
if (!token) { console.error("AIRTABLE_TOKEN is not set"); process.exit(1); }

let calls = 0;
async function list(table, fields, formula) {
  const out = []; let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${table}`);
    u.searchParams.set("returnFieldsByFieldId", "true");
    u.searchParams.set("pageSize", "100");
    for (const f of fields) u.searchParams.append("fields[]", f);
    if (formula) u.searchParams.set("filterByFormula", formula);
    if (offset) u.searchParams.set("offset", offset);
    calls++;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
    const j = await r.json(); out.push(...j.records); offset = j.offset;
    await new Promise((s) => setTimeout(s, 250)); // stay well under 5 requests a second
  } while (offset);
  return out;
}
const sel = (v) => (v && typeof v === "object" ? v.name : v) ?? "";

const products = await list(T_PRODUCTS, Object.values(P), "{Include}");
const obs = await list(T_OBS, Object.values(O), "{Publish} = 1");
const byRec = new Map(products.map((r) => { const f = r.fields; return [r.id, {
  id: f[P.id], name: f[P.item], cat: sel(f[P.cat]), sub: f[P.sub] || "", spec: f[P.spec] || "",
  unit: f[P.unit] || "", tier: sel(f[P.tier]), prov: !!f[P.prov], method: sel(f[P.method]), obs: [] }]; }));
let latest = "";
for (const r of obs) {
  const f = r.fields, prod = byRec.get((f[O.product] || [])[0]);
  if (!prod || typeof f[O.price] !== "number" || !f[O.date]) continue;
  prod.obs.push([f[O.date], f[O.price], f[O.source] || "", sel(f[O.province]) || "National", f[O.city] || "",
                 f[O.pack] || "", sel(f[O.vat]), !!f[O.promo]]);
  if (f[O.date] > latest) latest = f[O.date];
}
const items = [...byRec.values()].filter((p) => p.obs.length).map((p) => { p.obs.sort((a, b) => (a[0] < b[0] ? -1 : 1)); return p; });
if (!items.length) { console.error("No published prices found; keeping the previous file."); process.exit(1); }
writeFileSync("public/data/prices.json", JSON.stringify({
  generated: new Date().toISOString(), latest,
  fields: ["date", "price", "source", "province", "city", "packSeen", "vat", "promotion"], items }));
console.log(`Wrote ${items.length} items, ${obs.length} published prices, using ${calls} Airtable requests.`);
