"use strict";
/* Price Moves front end. Loads published prices from /data/prices.json (built daily from Airtable)
   and the long fuel history from /data/fuel-history.json. All text from the data is escaped before display. */

const DAY = 864e5;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nf0 = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parseDate = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d || 1); };
const fmtDate = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const fmtMonth = (t) => { const d = new Date(t); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

let ITEMS = [], BYID = {}, CATS = [], LATEST = 0;
let period = 365, histYears = 5, selected = null, activeCat = null, query = "", density = "lab";

async function getJSON(url) { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }

async function load() {
  let data;
  data = await getJSON("/data/prices.json");
  // long-run history files: { short: [source label per index], series: { itemId: [[date, price, sourceIndex, label?]] } }
  // a point with a label is a sparse historical data point (drawn dashed); our own observations win for any month
  const HIST = [];
  for (const f of ["/data/fuel-history.json", "/data/statssa-history.json"]) {
    try { const h = await getJSON(f); h.short = h.short || ["Fuels Industry Association", "Stats SA"]; HIST.push(h); } catch { /* optional */ }
  }
  // Stats SA official averages: items that have them use that series for price, change and chart, so months
  // are always compared like with like; store checks are listed separately and drawn as dots
  const OFF = HIST.find((h) => h.items) || { series: {}, items: {}, prov: {} };
  const have = new Set(data.items.map((i) => i.id));
  for (const [id, m] of Object.entries(OFF.items)) if (!have.has(id)) data.items.push({ id, ...m, prov: false, method: "", obs: [] });
  const F = data.fields || ["date", "price", "source", "province", "city", "packSeen", "vat", "promotion"];
  const ix = Object.fromEntries(F.map((f, i) => [f, i]));

  ITEMS = data.items.map((it) => {
    const obs = it.obs.map((o) => ({
      t: parseDate(o[ix.date]), v: o[ix.price], src: o[ix.source] || "Unnamed source", prov: o[ix.province] || "National",
      city: o[ix.city] || "", pack: o[ix.packSeen] || "", vat: o[ix.vat] || "", promo: !!o[ix.promotion],
    })).filter((o) => isFinite(o.v) && o.v > 0);
    // one point per calendar month: the median of that month's checks, dated at the latest check
    const months = new Map();
    for (const o of obs) { const d = new Date(o.t), k = d.getUTCFullYear() * 12 + d.getUTCMonth(); (months.get(k) || months.set(k, []).get(k)).push(o); }
    const pts = new Map();
    for (const [k, list] of months) {
      const t = Math.max(...list.map((o) => o.t)), srcs = [...new Set(list.map((o) => o.src))];
      pts.set(k, { t, v: median(list.map((o) => o.v)), src: srcs.length === 1 ? srcs[0] : `median of ${srcs.length} sources`, n: list.length, anchor: false });
    }
    const official = !!OFF.series[it.id];
    const store = official ? [...pts.values()].sort((a, b) => a.t - b.t) : [];
    if (official) pts.clear();
    // long history (fuel); our own observation wins for any month both cover
    for (const hist of HIST) for (const [ds, v, si, label] of hist.series[it.id] || []) {
      const t = parseDate(ds), d = new Date(t), k = d.getUTCFullYear() * 12 + d.getUTCMonth();
      if (!pts.has(k)) pts.set(k, { t, v, src: hist.short[si] || hist.sources[si] || "", n: 1, anchor: !!label, label });
    }
    const series = [...pts.values()].sort((a, b) => a.t - b.t);
    const lastT = series.length ? series[series.length - 1].t : 0;
    if (lastT > LATEST) LATEST = lastT;
    return { ...it, obsList: obs.sort((a, b) => b.t - a.t), series, lastT, official, store, provData: OFF.prov[it.id] || null, statssa: OFF.items[it.id]?.statssa || "" };
  }).filter((it) => it.series.length);
  BYID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  CATS = [...new Set(ITEMS.map((i) => i.cat))];
  selected = BYID["ENG-002"] ? "ENG-002" : ITEMS[0]?.id;
  if (location.hash.length > 1 && BYID[decodeURIComponent(location.hash.slice(1))]) selected = decodeURIComponent(location.hash.slice(1));
  $("gen").textContent = data.generated ? "Data refreshed " + fmtDate(Date.parse(data.generated)) : "";
}

/* values and changes */
const cur = (it) => it.series[it.series.length - 1].v;
function change(it, days) {
  const s = it.series; if (s.length < 2) return null;
  const target = s[s.length - 1].t - days * DAY + 12 * DAY; // allow a check a few days late
  let j = -1; for (let k = s.length - 2; k >= 0; k--) if (s[k].t <= target) { j = k; break; }
  if (j < 0) return null;
  if (target - s[j].t > Math.max(45, days * 0.1) * DAY) return null; // no price close enough to the start of the period
  return s[s.length - 1].v / s[j].v - 1;
}
function money(it, v) {
  const u = it.unit || "";
  if (u === "% p.a." || u === "%") return v.toFixed(2) + "%";
  if (u.startsWith("USD")) return "$" + (v >= 1000 ? nf0.format(v) : v.toFixed(2));
  return "R" + (v >= 1000 ? nf0.format(v) : v.toFixed(2));
}
const pct = (x) => (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1) + "%";
const cls = (x) => (x == null ? "f" : x > 0.001 ? "u" : x < -0.001 ? "d" : "f");
const perLbl = () => period === 30 ? "1 month" : period === 365 ? "12 months" : `${Math.round(period / 365.25)} years`;

/* chips */
function renderChips() {
  $("chips").innerHTML = [`<button class="chip" data-cat="" aria-pressed="${!activeCat}">All<small>${ITEMS.length}</small></button>`]
    .concat(CATS.map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${activeCat === c}">${esc(c)}<small>${ITEMS.filter((i) => i.cat === c).length}</small></button>`)).join("");
}

/* heat map */
function tileVal(i) { return change(i, period); }
function labTint(x) {
  if (x == null || Math.abs(x) < 0.002) return ["color-mix(in oklab, var(--flat) 55%, var(--surface))", false];
  const t = Math.min(Math.abs(x) / 0.15, 1), p = Math.round(10 + 75 * t);
  return [`color-mix(in oklab, var(${x > 0 ? "--up" : "--down"}) ${p}%, var(--surface))`, p > 55];
}
function tint(x) {
  if (x == null || Math.abs(x) < 0.002) return "var(--flat)";
  const p = Math.round(25 + 75 * Math.min(Math.abs(x) / 0.15, 1));
  return `color-mix(in oklab, var(${x > 0 ? "--up" : "--down"}) ${p}%, var(--flat))`;
}
function tileInner(i) {
  const x = tileVal(i);
  return `<span class="tn">${esc(i.name)}</span><span class="ts">${esc(i.spec)}</span><span class="tr"><span>${money(i, cur(i))}</span><span class="tc">${x == null ? (i.series.length < 2 ? "new" : "–") : pct(x)}</span></span>`;
}
function matches(i) { if (!query) return true; const h = `${i.name} ${i.spec} ${i.cat} ${i.sub} ${i.id}`.toLowerCase(); return query.split(/\s+/).every((w) => h.includes(w)); }
function renderMap() {
  $("legendTxt").textContent = `· change over ${perLbl()}, capped at ±15%`;
  $("map").innerHTML = CATS.filter((c) => !activeCat || c === activeCat).map((c) => {
    const its = ITEMS.filter((i) => i.cat === c), ch = its.map(tileVal).filter((x) => x != null);
    const head = ch.length ? `<span class="${cls(median(ch))}">${its.length} ${its.length===1?"item":"items"} · median ${pct(median(ch))}</span>` : `<span>${its.length} ${its.length===1?"item":"items"} · first checks</span>`;
    let body;
    if (density === "lab") { let last = null;
      body = its.map((i) => { const h = i.sub !== last ? `<div class="subh">${esc(i.sub)}</div>` : ""; last = i.sub; return h + `<button class="tile lab" data-id="${esc(i.id)}">${tileInner(i)}</button>`; }).join("");
    } else body = its.map((i) => `<button class="tile" data-id="${esc(i.id)}" aria-label="${esc(i.name)}, ${esc(i.spec)}"></button>`).join("");
    return `<div class="mcat"><div class="mcat-h"><b>${esc(c)}</b>${head}</div><div class="tiles${density === "lab" ? " lab" : ""}">${body}</div></div>`;
  }).join("");
  paintTiles();
}
function paintTiles() {
  document.querySelectorAll(".tile").forEach((t) => {
    const i = BYID[t.dataset.id], x = tileVal(i);
    if (t.classList.contains("lab")) { const [bg, strong] = labTint(x); t.style.backgroundColor = bg; t.classList.toggle("strong", strong); }
    else { t.style.backgroundColor = tint(x); t.classList.toggle("new", i.series.length < 2); }
    t.classList.toggle("sel", i.id === selected); t.classList.toggle("dim", !matches(i));
  });
}

/* movers, summary, feed */
function renderMovers() {
  const pool = ITEMS.filter((i) => i.cat !== "Macro & markets").map((i) => [i, change(i, period)]).filter((x) => x[1] != null);
  const row = ([i, c], k) => `<li><button class="mrow" data-id="${esc(i.id)}"><span class="rk">${k + 1}</span><span class="nm"><span>${esc(i.name)}</span><small>${esc(i.spec)} · ${esc(i.cat)}</small></span><span class="pr">${money(i, cur(i))}</span><span class="pc ${cls(c)}">${pct(c)}</span></button></li>`;
  const none = (w) => `<li class="empty">${period > 731 ? `No prices on the site go back ${perLbl()} yet, apart from the ones shown.` : `No ${w} over ${perLbl()} yet. Moves appear once an item has prices from two different months.`}</li>`;
  const dn = pool.filter((x) => x[1] < -0.0005).sort((a, b) => a[1] - b[1]).slice(0, 10);
  const up = pool.filter((x) => x[1] > 0.0005).sort((a, b) => b[1] - a[1]).slice(0, 10);
  $("mv-down").innerHTML = dn.length ? dn.map(row).join("") : none("falls");
  $("mv-up").innerHTML = up.length ? up.map(row).join("") : none("rises");
  $("mv-per-d").textContent = $("mv-per-u").textContent = perLbl();
}
function renderSummary() {
  const f = BYID["ENG-002"];
  if (f) { const fc = change(f, 365); $("s-fuel").textContent = money(f, cur(f)); $("s-fuel-sub").innerHTML = (fc != null ? `<span class="${cls(fc)}">${pct(fc)}</span> on a year ago · ` : "") + esc(fmtMonth(f.lastT)); }
  const srcs = new Set(ITEMS.flatMap((i) => i.obsList.map((o) => o.src)));
  $("s-items").textContent = ITEMS.length; $("s-items-sub").textContent = `${CATS.length} categories · ${srcs.size} named sources`;
  const m = ITEMS.filter((i) => i.cat !== "Macro & markets").map((i) => change(i, period)).filter((x) => x != null);
  $("s-up-lbl").textContent = `Higher, ${perLbl()}`; $("s-down-lbl").textContent = `Lower, ${perLbl()}`;
  $("s-up").textContent = m.filter((x) => x > 0.01).length; $("s-down").textContent = m.filter((x) => x < -0.01).length;
  $("s-up-sub").textContent = `of ${m.length} with history, more than 1% higher`; $("s-down-sub").textContent = `of ${m.length} with history, more than 1% lower`;
  $("asof").textContent = LATEST ? "Prices to " + fmtDate(LATEST) : "No prices yet";
  $("countline").textContent = `${ITEMS.length} prices · checked monthly`;
}
function renderFeed() {
  const all = ITEMS.flatMap((i) => i.obsList.slice(0, 3).map((o) => [i, o])).sort((a, b) => b[1].t - a[1].t || a[0].id.localeCompare(b[0].id)).slice(0, 9);
  $("feed").innerHTML = all.length ? all.map(([i, o]) => `<li><span class="t">${esc(fmtDate(o.t).replace(/ \d{4}$/, ""))}</span><span class="w"><button data-id="${esc(i.id)}">${esc(i.name)}</button> <span class="src">· ${esc(o.src)}</span></span><span class="r">${money(i, o.v)}</span></li>`).join("") : `<li class="empty">No prices yet.</li>`;
}

/* detail */
function priceParts(it, v) {
  const s = money(it, v), m = s.match(/^([R$]?)([\d\s,]+)(?:\.(\d+))?(.*)$/);
  if (!m) return esc(s);
  return `${m[1] ? `<span class="cur">${m[1]}</span>` : ""}${esc(m[2])}${m[3] ? `<span class="c">${m[3]}</span>` : ""}${m[4] ? `<span class="cur" style="margin-left:4px">${esc(m[4].trim())}</span>` : ""}`;
}
function renderDetail() {
  const it = BYID[selected]; if (!it) return;
  const last = it.series[it.series.length - 1];
  $("d-crumb").textContent = `${it.id} · ${it.cat}${it.sub ? " › " + it.sub : ""}`;
  $("d-name").textContent = it.name;
  $("d-spec").textContent = it.spec + (it.tier ? ` · ${it.tier}` : "");
  $("d-price").innerHTML = priceParts(it, last.v);
  $("d-per").textContent = it.unit || it.spec;
  const latestObs = it.obsList.length ? it.obsList.filter((o) => o.t >= it.obsList[0].t - 31 * DAY) : [];
  const vatTxt = latestObs.length && /excl/i.test(latestObs[0].vat) ? " · excl. VAT" : "";
  $("d-credit").textContent = it.official ? `Stats SA average · ${fmtMonth(last.t)}` : (latestObs.length > 1 && new Set(latestObs.map((o) => o.src)).size > 1 ? `Median of ${new Set(latestObs.map((o) => o.src)).size} sources · ${fmtMonth(last.t)}` : `${last.src} · ${fmtDate(last.t)}`) + vatTxt;
  const c = change(it, period), dl = $("d-delta");
  dl.hidden = false; dl.className = "delta " + cls(c);
  dl.textContent = c == null ? (it.series.length < 2 ? "New · first check" : `No price ${perLbl()} earlier`) : `${c > 0 ? "▲" : c < 0 ? "▼" : "■"} ${pct(c)} over ${perLbl()}`;
  const win = visible(it), vals = win.map((p) => p.v);
  $("st-lo").textContent = money(it, Math.min(...vals)); $("st-hi").textContent = money(it, Math.max(...vals));
  $("st-n").textContent = it.series.length + (it.official ? " months" : ""); $("st-chk").textContent = it.official ? fmtMonth(it.lastT) : fmtDate(it.lastT);
  drawChart();
  // by source: most recent check per source within the latest month
  const bySrc = new Map(); for (const o of latestObs) if (!bySrc.has(o.src + o.prov)) bySrc.set(o.src + o.prov, o);
  const rows = [...bySrc.values()].sort((a, b) => a.v - b.v);
  if (rows.length > 1) {
    const mx = rows[rows.length - 1].v, mn = rows[0].v;
    $("sellers").innerHTML = `<h3>${it.official ? "Latest store prices" : "Latest check by source"}</h3>` + rows.map((o, k) => `<div class="srow${k === 0 && mx > mn ? " best" : ""}"><span class="nm" title="${esc(o.src)}">${esc(o.src)} <small>${esc(fmtDate(o.t).replace(/ \d{4}$/, ""))}${o.prov !== "National" ? " · " + esc(o.prov) : ""}${o.promo ? " · promo" : ""}</small></span><span class="bar" style="width:${(40 + 60 * (o.v - mn * 0.9) / ((mx - mn * 0.9) || 1)).toFixed(1)}%"></span><span class="v">${money(it, o.v)}</span></div>`).join("");
  } else if (rows.length === 1) {
    const o = rows[0];
    $("sellers").innerHTML = `<h3>${it.official ? "Latest store price" : "Source"}</h3><div style="font-size:13px">${it.official ? money(it, o.v) + " · " : ""}${esc(o.src)} · ${esc(fmtDate(o.t))}${o.city ? " · " + esc(o.city) : ""}${o.pack ? ` · pack seen: ${esc(o.pack)}` : ""}${o.promo ? " · on promotion" : ""}</div>`;
  } else $("sellers").innerHTML = it.official ? "" : `<h3>Source</h3><div style="font-size:13px">${esc(last.src)} · ${esc(fmtDate(last.t))}</div>`;
  renderProvinces(it);
  $("meta").innerHTML = `<div><small>Checked</small>Monthly${it.method ? " · " + esc(it.method) : ""}</div><div><small>Comparable unit</small>${esc(it.unit || "–")}</div>` +
    (it.official ? `<div style="grid-column:1/-1"><small>Price history</small>Stats SA average shelf price for “${esc(it.statssa)}”, all urban areas. The headline price, changes and chart use this average; dots on the chart are our own store checks.</div>` : "");
  paintTiles();
}
const PNAMES = { GP: "Gauteng", WC: "Western Cape", KZN: "KwaZulu-Natal", EC: "Eastern Cape", FS: "Free State", LP: "Limpopo", MP: "Mpumalanga", NW: "North West", NC: "Northern Cape" };
function renderProvinces(it) {
  const el = $("provs"); if (!el) return;
  if (!it.provData) { el.innerHTML = ""; return; }
  const rows = Object.entries(it.provData).map(([c, [v, a]]) => [c, v, a ? v / a - 1 : null]).sort((x, y) => x[1] - y[1]);
  const mx = Math.max(...rows.map((r) => r[1])), mn = Math.min(...rows.map((r) => r[1]));
  el.innerHTML = `<h3>By province · Stats SA, ${esc(fmtMonth(it.lastT))}</h3>` + rows.map(([c, v, ch], k) =>
    `<div class="srow${k === 0 && mx > mn ? " best" : ""}"><span class="nm">${esc(PNAMES[c] || c)} <small class="${cls(ch)}">${ch == null ? "" : pct(ch) + " y/y"}</small></span><span class="bar" style="width:${(40 + 60 * (v - mn * 0.9) / ((mx - mn * 0.9) || 1)).toFixed(1)}%"></span><span class="v">${money(it, v)}</span></div>`).join("") +
    `<div class="chartnote">Lowest to highest. Gap between the highest and lowest province: ${pct(mx / mn - 1).replace("+", "")}.</div>`;
}
function visible(it) {
  const s = it.series; if (!histYears) return s;
  const from = s[s.length - 1].t - histYears * 365.25 * DAY;
  const w = s.filter((p) => p.t >= from); const before = s.filter((p) => p.t < from);
  return before.length ? [before[before.length - 1], ...w] : w; // keep the price in force at the window start
}

let geom = null;
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
function drawChart() {
  const it = BYID[selected], svg = $("chart"), pts = visible(it);
  const W = svg.clientWidth || 600, H = 240, L = 58, R = 12, T = 14, B = 26;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const end = Math.max(it.lastT, LATEST);
  let t0 = histYears ? end - histYears * 365.25 * DAY : pts[0].t, t1 = end;
  if (pts.length === 1) { t0 = pts[0].t - 30 * DAY; t1 = pts[0].t + 30 * DAY; }
  const vals = pts.map((p) => p.v); let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < hi * 0.02) { lo *= 0.98; hi *= 1.02; }
  const step = niceStep((hi - lo) / 4); lo = Math.max(0, Math.floor(lo / step) * step); hi = Math.ceil(hi / step) * step;
  const x = (t) => L + (Math.max(t, t0) - t0) / (t1 - t0 || 1) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let g = "";
  for (let v = lo; v <= hi + step / 2; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" font-family="IBM Plex Mono, monospace" fill="var(--muted)">${money(it, v)}</text>`;
  // time ticks
  const spanY = (t1 - t0) / (365.25 * DAY), y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
  if (spanY > 2) { const every = Math.ceil((y1 - y0 + 1) / 8);
    for (let yr = y0; yr <= y1; yr++) { const t = Date.UTC(yr, 0, 1); if (t < t0 || (yr - y0) % every) continue; g += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle" font-size="11" font-family="IBM Plex Mono, monospace" fill="var(--muted)">${yr}</text>`; } }
  else { const d = new Date(t0); let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); const ms = []; while (m <= t1) { ms.push(m); const n = new Date(m); m = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1); }
    const every = Math.ceil(ms.length / 7) || 1; ms.forEach((t, j) => { if (j % every) return; const n = new Date(t); g += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle" font-size="11" font-family="IBM Plex Mono, monospace" fill="var(--muted)">${MON[n.getUTCMonth()]}${n.getUTCMonth() === 0 || j === 0 ? " " + String(n.getUTCFullYear()).slice(2) : ""}</text>`; }); }
  const c = change(it, period), col = c == null ? "var(--ink)" : c > 0.001 ? "var(--up)" : c < -0.001 ? "var(--down)" : "var(--muted)";
  // step line for monthly prices; dashed straight segments between sparse historical data points
  let solid = "", dashed = "";
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], X = x(p.t), Y = y(p.v);
    if (k === 0) { solid += `M${X.toFixed(1)},${Y.toFixed(1)}`; continue; }
    const q = pts[k - 1];
    if (q.anchor) { dashed += `M${x(q.t).toFixed(1)},${y(q.v).toFixed(1)}L${X.toFixed(1)},${Y.toFixed(1)}`; solid += `M${X.toFixed(1)},${Y.toFixed(1)}`; }
    else solid += `H${X.toFixed(1)}V${Y.toFixed(1)}`;
  }
  const lastP = pts[pts.length - 1];
  if (pts.length > 1) solid += `H${x(t1).toFixed(1)}`;
  g += `<path d="${dashed}" fill="none" stroke="${col}" stroke-width="1.4" stroke-dasharray="4 4" opacity=".7"/><path d="${solid}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`;
  for (const p of pts) if (p.anchor) g += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="3" fill="var(--surface)" stroke="${col}" stroke-width="1.5"/>`;
  g += `<circle cx="${x(lastP.t)}" cy="${y(lastP.v)}" r="4.5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
  for (const p of it.store || []) if (p.t >= t0 && p.v >= lo && p.v <= hi) g += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="3.5" fill="var(--tag)" stroke="var(--ink)" stroke-width="1"><title>Store check ${esc(fmtDate(p.t))}: ${money(it, p.v)} (${esc(p.src)})</title></circle>`;
  g += `<g id="cross" visibility="hidden"><line id="cx" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3"/><circle id="cd" r="4" fill="var(--ink)"/></g>`;
  svg.innerHTML = g;
  geom = { x, y, pts, W };
  const anyAnchor = pts.some((p) => p.anchor);
  $("chartnote").textContent = pts.length === 1 ? `First check on ${fmtDate(lastP.t)}. The line grows with every monthly check.` : anyAnchor ? "Before 2012, open circles are individual published data points joined by a dashed line; prices between them are not shown." : "";
}
function chartHover(e) {
  if (!geom) return; const svg = $("chart"), rect = svg.getBoundingClientRect(), px = (e.clientX - rect.left) * (geom.W / rect.width);
  let best = 0, bd = Infinity; geom.pts.forEach((p, k) => { const d = Math.abs(geom.x(p.t) - px); if (d < bd) { bd = d; best = k; } });
  const p = geom.pts[best], X = geom.x(p.t), Y = geom.y(p.v);
  const cr = document.getElementById("cross"); if (!cr) return; cr.setAttribute("visibility", "visible");
  $("cx").setAttribute("x1", X); $("cx").setAttribute("x2", X); $("cd").setAttribute("cx", X); $("cd").setAttribute("cy", Y);
  const tip = $("tip"); tip.hidden = false; tip.style.left = Math.max(70, Math.min(rect.width - 70, X * rect.width / geom.W)) + "px";
  tip.textContent = `${p.anchor && p.label ? p.label : fmtDate(p.t)} · ${money(BYID[selected], p.v)} · ${p.src}`;
}
function chartLeave() { const cr = document.getElementById("cross"); if (cr) cr.setAttribute("visibility", "hidden"); $("tip").hidden = true; }

/* search */
let resIdx = 0, resList = [];
function renderResults() {
  const box = $("results"), combo = $("combo");
  if (!query) { box.hidden = true; combo.setAttribute("aria-expanded", "false"); return; }
  resList = ITEMS.filter(matches).slice(0, 12);
  box.innerHTML = resList.length ? resList.map((i, k) => { const c = change(i, period); return `<button class="res" role="option" id="opt${k}" data-id="${esc(i.id)}" aria-selected="${k === resIdx}"><span class="nm"><span>${esc(i.name)}</span><small>${esc(i.spec)} · ${esc(i.cat)}</small></span><span class="num">${money(i, cur(i))}</span><span class="num ${cls(c)}">${c == null ? "new" : pct(c)}</span></button>`; }).join("")
    : `<div class="res" style="cursor:default">No prices match “${esc(query)}” yet. Try a shorter word.</div>`;
  box.hidden = false; combo.setAttribute("aria-expanded", "true");
}
function select(id) {
  selected = id; history.replaceState(null, "", "#" + encodeURIComponent(id)); renderDetail();
  query = ""; $("q").value = ""; renderResults(); paintTiles();
  if (window.innerWidth < 900) $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
}
function setPressed(sel, btn) { document.querySelectorAll(sel).forEach((b) => b.setAttribute("aria-pressed", b === btn)); }

function bind() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-id]"); if (t) { select(t.dataset.id); return; }
    const chip = e.target.closest(".chip"); if (chip) { activeCat = chip.dataset.cat || null; renderChips(); renderMap(); return; }
    const pr = e.target.closest("#period button"); if (pr) { period = +pr.dataset.d; setPressed("#period button", pr); renderMap(); renderMovers(); renderSummary(); renderDetail(); return; }
    const dn = e.target.closest("#density button"); if (dn) { density = dn.dataset.v; setPressed("#density button", dn); renderMap(); return; }
    const hr = e.target.closest("#range button"); if (hr) { histYears = +hr.dataset.y; setPressed("#range button", hr); renderDetail(); return; }
    if (!e.target.closest("#combo")) { $("results").hidden = true; $("combo").setAttribute("aria-expanded", "false"); }
  });
  $("map").addEventListener("pointerover", (e) => {
    const t = e.target.closest(".tile"); if (!t) return; const i = BYID[t.dataset.id], c = change(i, period);
    $("hoverline").innerHTML = `<b>${esc(i.name)}</b> · ${esc(i.spec)} · ${money(i, cur(i))} · <span class="${cls(c)}">${c == null ? "new" : pct(c)}</span> · ${esc(i.series[i.series.length - 1].src)}`;
  });
  const q = $("q");
  q.addEventListener("input", () => { query = q.value.trim().toLowerCase(); resIdx = 0; renderResults(); paintTiles(); });
  q.addEventListener("focus", () => { if (query) renderResults(); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!resList.length) return; resIdx = (resIdx + (e.key === "ArrowDown" ? 1 : -1) + resList.length) % resList.length; renderResults(); $("opt" + resIdx)?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter" && resList[resIdx]) { e.preventDefault(); select(resList[resIdx].id); q.blur(); }
    else if (e.key === "Escape") { q.value = ""; query = ""; renderResults(); paintTiles(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); } });
  const svg = $("chart"); svg.addEventListener("pointermove", chartHover); svg.addEventListener("pointerleave", chartLeave);
  new ResizeObserver(() => { if (selected) drawChart(); }).observe($("chartbox"));
}

$("yr").textContent = new Date().getFullYear();
load().then(() => {
  if (!ITEMS.length) { $("map").innerHTML = `<div class="loading">No published prices yet.</div>`; $("asof").textContent = "No prices yet"; return; }
  bind(); renderChips(); renderSummary(); renderMovers(); renderFeed(); renderMap(); renderDetail();
}).catch(() => { $("map").innerHTML = `<div class="loading">Prices could not be loaded. Please try again shortly.</div>`; $("asof").textContent = "Prices unavailable"; });
