// Computes the store's AI data once, on the developer machine:
//   node scripts/embed.mjs <path to node_modules that has @huggingface/transformers> [models dir]
// Writes data/ai.json with, for every product:
//   similar: the 4 nearest products (cosine similarity of text embeddings)
//   fits:    3 products from complementary drawers, ranked by the same similarity
//   xy:      position on the catalog map (2D projection of the embeddings)
// The site only reads ai.json, so GitHub Pages needs no server and no AI service.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const [modules, modelsDir] = process.argv.slice(2);
if (!modules) throw new Error("usage: node scripts/embed.mjs <node_modules dir> [models dir]");

const products = JSON.parse(readFileSync(path.join(ROOT, "data/products.json"), "utf8"));
const { drawers } = JSON.parse(readFileSync(path.join(ROOT, "data/store.json"), "utf8"));
const drawerName = Object.fromEntries(drawers.map((d) => [d.id, d.name]));

const tjs = await import(pathToFileURL(path.join(modules, "@huggingface/transformers/dist/transformers.node.mjs")).href);
if (modelsDir) tjs.env.cacheDir = path.resolve(modelsDir);
const extract = await tjs.pipeline("feature-extraction", "Xenova/paraphrase-multilingual-MiniLM-L12-v2", { dtype: "q8" });

const text = (p) => [p.name, p.brand, drawerName[p.cat], p.short, p.specs.map(([k, v]) => `${k}: ${v}`).join(". ")].join(". ");
const vectors = (await extract(products.map(text), { pooling: "mean", normalize: true })).tolist();
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// What usually goes with what. "kind" stops a phone from suggesting another phone.
const kind = (p) =>
  ({ "magic-keyboard": "periferico", "magic-mouse": "periferico", airtag: "accesorio", "cargador-magsafe": "accesorio",
     dualsense: "control", "control-xbox": "control", "switch-pro-controller": "control", "dji-mini-4-pro": "drone",
     "instax-wide": "instantanea", "kindle-paperwhite": "lector", "raspberry-pi-5": "placa",
     "homepod-mini": "parlante", "echo-dot": "parlante", "apple-tv-4k": "streaming", "fire-tv-stick-4k": "streaming",
     "roku-express": "streaming" })[p.slug] ?? p.cat;
// Apple Watch, AirTag, MagSafe and the Magic keyboard/mouse only make sense next to Apple devices.
const appleOnly = new Set(["apple-watch-s10", "apple-watch-ultra-2", "airtag", "cargador-magsafe", "magic-keyboard", "magic-mouse"]);
const device = (p) => ["celulares", "tablets", "computacion"].includes(kind(p));
const ecosystemOk = (p, q) =>
  !((appleOnly.has(q.slug) && device(p) && p.brand !== "Apple") || (appleOnly.has(p.slug) && device(q) && q.brand !== "Apple"));
// Controllers only fit the machines they really work with.
const platform = (p) =>
  p.brand === "Nintendo" ? "nintendo" : ["dualsense", "control-xbox", "rog-ally", "steam-deck-oled"].includes(p.slug) ? "pc" : null;
const compatible = (p, q) =>
  !(kind(p) === "control" || kind(q) === "control") || (kind(p) !== "gaming" && kind(q) !== "gaming") || platform(p) === platform(q);
const goesWith = {
  celulares: ["audio", "accesorio", "wearables"],
  tablets: ["periferico", "audio", "accesorio"],
  computacion: ["periferico", "audio", "accesorio"],
  periferico: ["computacion", "tablets"],
  audio: ["celulares", "wearables", "accesorio", "tablets"],
  gaming: ["control", "audio"],
  control: ["gaming"],
  foto: ["drone", "instantanea", "tablets"],
  drone: ["foto", "celulares"],
  instantanea: ["foto", "celulares"],
  hogar: ["hogar", "parlante"],
  parlante: ["hogar", "streaming"],
  streaming: ["parlante", "hogar"],
  placa: [], // a Raspberry Pi needs cables and a power supply we do not sell
  wearables: ["celulares", "audio", "accesorio"],
  accesorio: ["celulares", "wearables", "audio"],
  lector: [], // a Kindle needs nothing else, and the site says so
};

// Two numbers per product for the map: the two main directions of the embeddings (PCA).
function project(vs) {
  const n = vs.length, d = vs[0].length;
  const mean = Array.from({ length: d }, (_, j) => vs.reduce((s, v) => s + v[j], 0) / n);
  const X = vs.map((v) => v.map((x, j) => x - mean[j]));
  const axes = [];
  for (let k = 0; k < 2; k++) {
    let a = Array.from({ length: d }, (_, j) => Math.sin(j * (k + 1) + 1));
    for (let it = 0; it < 200; it++) {
      const s = X.map((row) => dot(row, a));
      const next = Array(d).fill(0);
      X.forEach((row, i) => row.forEach((x, j) => (next[j] += x * s[i])));
      for (const b of axes) { const p = dot(next, b); next.forEach((_, j) => (next[j] -= p * b[j])); }
      const len = Math.hypot(...next);
      a = next.map((x) => x / len);
    }
    axes.push(a);
  }
  let pts = X.map((row) => axes.map((a) => dot(row, a)));
  // Gentle push apart so photos on the map do not sit on top of each other.
  const norm = (ps) => {
    const lo = [0, 1].map((k) => Math.min(...ps.map((p) => p[k]))), hi = [0, 1].map((k) => Math.max(...ps.map((p) => p[k])));
    return ps.map((p) => p.map((x, k) => 0.07 + (0.86 * (x - lo[k])) / (hi[k] - lo[k])));
  };
  pts = norm(pts);
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1], dist = Math.hypot(dx, dy) || 1e-6;
      if (dist < 0.075) { const f = (0.075 - dist) / 2 / dist; pts[i][0] -= dx * f; pts[i][1] -= dy * f; pts[j][0] += dx * f; pts[j][1] += dy * f; }
    }
  }
  return norm(pts);
}

const xy = project(vectors);
const out = {};
products.forEach((p, i) => {
  const ranked = products
    .map((q, j) => ({ q, score: i === j ? -9 : dot(vectors[i], vectors[j]) }))
    .sort((a, b) => b.score - a.score);
  const similar = ranked.filter((r) => r.q.stock > 0).slice(0, 4).map((r) => r.q.slug);
  const wanted = goesWith[kind(p)] ?? [];
  // Candidates from the drawers that go with this one; same brand gets a small bonus
  // (a MagSafe charger fits an iPhone better than a Pixel).
  const candidates = ranked
    .filter((r) => r.q.slug !== p.slug && r.q.stock > 0 && wanted.includes(kind(r.q)) && compatible(p, r.q) && ecosystemOk(p, r.q))
    .map((r) => ({ q: r.q, score: r.score + (r.q.brand === p.brand ? 0.08 : 0) }))
    .sort((a, b) => b.score - a.score);
  // Best one of each kind first (earbuds + charger + watch, not three earbuds), then fill up.
  const picked = [];
  for (const c of candidates) if (picked.length < 3 && !picked.some((x) => kind(x.q) === kind(c.q))) picked.push(c);
  for (const c of candidates) if (picked.length < 3 && !picked.includes(c)) picked.push(c);
  const fits = picked.map((c) => c.q.slug);
  out[p.slug] = { similar, fits, xy: xy[i].map((x) => Math.round(x * 1000) / 1000) };
});
writeFileSync(path.join(ROOT, "data/ai.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`AI data for ${products.length} products written to data/ai.json`);
for (const s of ["iphone-16e", "switch-2", "canon-r50", "macbook-air-m4"]) console.log(s, "->", out[s].fits.join(", "), "| similar:", out[s].similar.join(", "));
