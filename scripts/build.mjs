// Builds the static site into dist/.  node scripts/build.mjs
// BASE is the path the site lives under (GitHub Pages project sites use "/<repo>/").
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const BASE = (process.env.BASE || "/").replace(/\/?$/, "/");
const SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, ""); // full origin for canonical URLs, if known

const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const store = JSON.parse(read("data/store.json"));
const products = JSON.parse(read("data/products.json"));
const ai = JSON.parse(read("data/ai.json"));
const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
const drawer = Object.fromEntries(store.drawers.map((d) => [d.id, d]));
const credits = parseCredits(read("data/credits.csv"));
const hasCut = (slug) => existsSync(path.join(ROOT, "static/img", `${slug}-cut.webp`));

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => "$\u00a0" + Math.round(n).toLocaleString("es-AR");
const url = (p = "") => BASE + p;
const img = (slug, size = "") => url(`img/${slug}${size}.webp`);
const off = (p) => (p.was && p.was > p.price ? Math.round((1 - p.price / p.was) * 100) : 0);

function parseCredits(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  const map = {};
  for (const r of body) { const o = Object.fromEntries(head.map((h, i) => [h.replace(/^\ufeff/, ""), r[i] ?? ""])); map[o.image] = o; }
  return map;
}
const licenseUrl = (l) => {
  const m = /^CC (BY(?:-SA)?) (\d\.\d)(?: (\w+))?$/i.exec(l || "");
  if (m) return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${m[3] ? m[3].toLowerCase() + "/" : ""}`;
  if (/^CC0/i.test(l || "")) return "https://creativecommons.org/publicdomain/zero/1.0/";
  return null;
};

// ---------- shared pieces ----------
function tape(text, cls = "") {
  return `<span class="tape ${cls}">${esc(text)}</span>`;
}

function priceBlock(p, big = false) {
  const o = off(p);
  return `<div class="price${big ? " price--big" : ""}">
    ${o ? `<s>${money(p.was)}</s>` : ""}
    <strong>${money(p.price)}</strong>${o ? `<em>-${o}%</em>` : ""}
  </div>`;
}

function item(p, opts = {}) {
  const d = drawer[p.cat];
  return `<li class="slot${p.stock > 0 ? "" : " slot--out"}" data-slug="${p.slug}" data-cat="${p.cat}" data-name="${esc((p.name + " " + p.brand).toLowerCase())}" data-price="${p.price}">
  <a href="${url(`p/${p.slug}/`)}" class="slot__link">
    <span class="slot__num">${d.num}·${String(products.indexOf(p) + 1).padStart(2, "0")}</span>
    <span class="slot__photo"><img src="${img(p.slug, "-s")}" alt="" width="480" height="480" loading="${opts.eager ? "eager" : "lazy"}" decoding="async"></span>
    <span class="slot__brand">${esc(p.brand)}</span>
    <span class="slot__name">${esc(p.name)}</span>
    ${priceBlock(p)}
    <span class="slot__meta">${p.stock > 0 ? `${store.installments} cuotas sin interés de ${money(p.price / store.installments)}` : "Sin stock por ahora"}</span>
  </a>
</li>`;
}

function fitsBench(base, { heading = true, id = "" } = {}) {
  const fits = ai[base.slug].fits.map((s) => bySlug[s]);
  return `<div class="bench" data-bench data-base="${base.slug}"${id ? ` id="${id}"` : ""}>
  ${heading ? `<p class="bench__hint mono">Pieza base: <b>${esc(base.name)}</b></p>` : ""}
  <div class="bench__mat">
    <svg class="bench__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${fits.length ? fits.map((_, i) => `<path d="M44 50 L56 ${[15, 48, 81][i]}" />`).join("") : `<path d="M44 50 L56 50" />`}
    </svg>
    <div class="bench__base">
      <img src="${hasCut(base.slug) ? img(base.slug, "-cut") : img(base.slug, "-s")}" alt="${esc(base.name)}" class="${hasCut(base.slug) ? "is-cut" : "is-print"}" width="480" height="480">
      ${tape(base.name, "tape--small")}
    </div>
    ${fits.length
      ? fits.map((f, i) => `<div class="bench__fit bench__fit--${i + 1}" style="--i:${i}">
      <span class="bench__outline" aria-hidden="true"></span>
      <a href="${url(`p/${f.slug}/`)}" class="bench__piece">
        <img src="${hasCut(f.slug) ? img(f.slug, "-cut") : img(f.slug, "-s")}" alt="" class="${hasCut(f.slug) ? "is-cut" : "is-print"}" width="240" height="240" loading="lazy">
        <span class="bench__label"><span>${esc(f.name)}</span><b class="mono">${money(f.price)}</b></span>
      </a>
      <button type="button" class="btn btn--fit" data-add="${f.slug}" aria-label="Sumar ${esc(f.name)} al carrito">+ Sumar</button>
    </div>`).join("")
      : `<p class="bench__alone mono">Esta pieza va sola: no necesita nada más para funcionar.</p>`}
  </div>
</div>`;
}

function layout({ title, description, body, path: pagePath = "", page = "", image }) {
  const canonical = SITE_URL ? `${SITE_URL}${url(pagePath)}` : "";
  const fullTitle = title ? `${title} · ${store.name}` : `${store.name} · ${store.tagline}`;
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#24493a">
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
${image && SITE_URL ? `<meta property="og:image" content="${SITE_URL}${image}">` : ""}
<meta name="robots" content="noindex">
<link rel="icon" href="${url("favicon.svg")}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=JetBrains+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="${url("site.css")}">
<script>document.documentElement.classList.add("js")</script>
<script type="module" src="${url("app.js")}"></script>
</head>
<body data-page="${page}" data-base="${BASE}">
<a class="skip" href="#main">Saltar al contenido</a>
<p class="demo-bar mono">DEMO · Tienda de ejemplo: no se vende ni se cobra nada real</p>
<header class="top">
  <a href="${url()}" class="logo" aria-label="${store.name}, inicio">
    <svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="3"/><path d="M13 29V11h8a6 6 0 0 1 0 12h-8"/><circle cx="29" cy="29" r="2.4"/></svg>
    <span>${store.name}</span>
  </a>
  <nav class="nav" aria-label="Principal">
    <a href="${url("productos/")}"${page === "catalog" ? ' aria-current="page"' : ""}>Cajones</a>
    <a href="${url("mapa/")}"${page === "map" ? ' aria-current="page"' : ""}>Mapa</a>
    <a href="${url("#encajan")}">Piezas que encajan</a>
  </nav>
  <form class="search" action="${url("productos/")}" role="search">
    <label class="sr-only" for="q">Buscar</label>
    <input id="q" name="q" type="search" placeholder="Buscar en la mesa" autocomplete="off">
  </form>
  <a href="${url("carrito/")}" class="cart-link"${page === "cart" ? ' aria-current="page"' : ""}>Carrito <span class="cart-count mono" data-cart-count>0</span></a>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="foot__grid">
    <div>
      <p class="logo logo--foot"><span>${store.name}</span></p>
      <p>${esc(store.tagline)}. ${esc(store.city)}, Argentina.</p>
      <p class="mono foot__demo">Sitio de demostración. Marca, precios y stock son de ejemplo. Los nombres de productos y marcas pertenecen a sus dueños.</p>
    </div>
    <div>
      <p class="foot__h">Cajones</p>
      <ul>${store.drawers.map((d) => `<li><a href="${url(`productos/?cajon=${d.id}`)}">${d.name}</a></li>`).join("")}</ul>
    </div>
    <div>
      <p class="foot__h">Tienda</p>
      <ul>
        <li><a href="${url("mapa/")}">Mapa del catálogo</a></li>
        <li><a href="${url("carrito/")}">Carrito</a></li>
        <li><a href="${url("creditos/")}">Créditos de fotos</a></li>
      </ul>
      <p class="mono foot__pay">Pagos con Mercado Pago (simulado en esta demo) · ${store.installments} cuotas sin interés · Envío gratis desde ${money(store.freeShippingFrom)}</p>
    </div>
  </div>
</footer>
<div class="toast" role="status" aria-live="polite" data-toast></div>
</body>
</html>
`;
}

// ---------- pages ----------
function home() {
  // Hero: real objects laid on the cutting mat, each with its label tape.
  // [slug, x, y, rotation, width] on desktop, then [x, y, width] on phones (percent of the bench).
  const heroItems = [
    ["steam-deck-oled", 3, 9, -6, 47, 0, 3, 62, "Steam Deck OLED"],
    ["airpods-max", 62, 3, 8, 24, 66, 0, 30, "AirPods Max"],
    ["airtag", 57, 45, 0, 8, 70, 40, 12, "AirTag"],
    ["dualsense", 4, 50, 4, 33, 2, 52, 50, "DualSense"],
    ["pixel-9a", 44, 58, 10, 8, 56, 50, 11, "Pixel 9a"],
    ["apple-watch-ultra-2", 72, 50, -10, 13, 80, 58, 17, "Watch Ultra 2"],
  ];
  const hero = heroItems
    .map(([slug, x, y, r, w, mx, my, mw, short], i) => {
      const p = { ...bySlug[slug], name: short };
      return `<a href="${url(`p/${slug}/`)}" class="obj${slug === "airtag" ? " obj--desk" : ""}" style="--x:${x}%;--y:${y}%;--r:${r}deg;--w:${w}%;--mx:${mx}%;--my:${my}%;--mw:${mw}%;--i:${i}">
        <img src="${img(slug, "-cut")}" alt="${esc(p.name)}" fetchpriority="${i < 2 ? "high" : "auto"}">
        <span class="obj__tag"><span>${esc(p.name.replace(/ \d+ GB.*$/, ""))}</span><b class="mono">${money(p.price)}</b></span>
      </a>`;
    })
    .join("");

  const counts = Object.fromEntries(store.drawers.map((d) => [d.id, products.filter((p) => p.cat === d.id)]));
  const drawers = store.drawers
    .map((d) => `<li class="drawer">
      <a href="${url(`productos/?cajon=${d.id}`)}" class="drawer__front">
        <span class="drawer__row"><span class="drawer__num mono">${d.num}</span><span class="drawer__count mono">${counts[d.id].length} piezas</span></span>
        ${tape(d.name)}
        <span class="drawer__inside" aria-hidden="true">${counts[d.id].slice(0, 4).map((p) => `<img src="${img(p.slug, "-s")}" alt="" loading="lazy" width="96" height="96">`).join("")}</span>
        <span class="drawer__note">${esc(d.note)}</span>
        <span class="drawer__handle" aria-hidden="true"></span>
      </a>
    </li>`)
    .join("");

  const benchBases = ["iphone-16e", "switch-2", "canon-r50", "macbook-air-m4"];
  const fresh = ["iphone-17-pro", "switch-2", "macbook-air-m4", "airpods-pro-3", "sony-zv-e10", "galaxy-zflip6", "steam-deck-oled", "apple-watch-s10"].map((s) => bySlug[s]);

  const body = `
<section class="hero mat" aria-labelledby="hero-h">
  <div class="ruler ruler--top" aria-hidden="true"></div>
  <div class="hero__text">
    <p class="kicker mono">Mesa 01 · ${esc(store.city)}</p>
    <h1 id="hero-h">Cada pieza pasa por la mesa antes de llegar a tu casa.</h1>
    <p class="hero__lead">Celulares, consolas, cámaras y audio, revisados uno por uno. Y una mesa que te dice qué más encaja con lo que elegiste.</p>
    <div class="hero__cta">
      <a class="btn btn--buy" href="${url("productos/")}">Abrir los cajones</a>
      <a class="btn btn--ghost" href="#encajan">Ver qué encaja</a>
    </div>
    <ul class="hero__facts mono">
      <li>${store.installments} cuotas sin interés</li>
      <li>Envío gratis desde ${money(store.freeShippingFrom)}</li>
      <li>Pagás con Mercado Pago</li>
    </ul>
  </div>
  <div class="hero__bench" aria-label="Productos sobre la mesa">${hero}</div>
</section>

<section class="chapter chapter--paper" aria-labelledby="cajones-h">
  <div class="chapter__head">
    <p class="kicker mono">Capítulo 1</p>
    <h2 id="cajones-h">Los cajones</h2>
    <p>Todo está ordenado como en un taller: cada cosa en su cajón, con su etiqueta. Tirá de uno.</p>
  </div>
  <ul class="cabinet">${drawers}</ul>
</section>

<section class="chapter chapter--mat mat" id="encajan" aria-labelledby="encajan-h">
  <div class="ruler ruler--top" aria-hidden="true"></div>
  <div class="encajan">
    <div class="encajan__text">
      <p class="kicker mono">Capítulo 2 · La pieza que falta</p>
      <h2 id="encajan-h">Piezas que encajan</h2>
      <p>Elegí una pieza base. La mesa marca los huecos y los llena con lo que mejor le va: la inteligencia artificial de la tienda lee cada producto y busca entre los que de verdad funcionan juntos.</p>
      <div class="base-pick" role="tablist" aria-label="Pieza base">
        ${benchBases.map((s, i) => `<button type="button" role="tab" class="base-pick__btn" aria-selected="${i === 0}" aria-controls="bench-${s}" id="tab-${s}" data-pick="${s}">${esc(bySlug[s].name.replace(/ \d+ GB.*$| \+ .*$| 13".*$/, ""))}</button>`).join("")}
      </div>
    </div>
    <div class="encajan__benches">
      ${benchBases.map((s, i) => `<div role="tabpanel" id="bench-${s}" aria-labelledby="tab-${s}"${i ? " hidden" : ""}>${fitsBench(bySlug[s], { heading: false })}</div>`).join("")}
    </div>
  </div>
</section>

<section class="chapter chapter--paper check" aria-labelledby="check-h">
  <div class="check__ticket">
    <p class="mono check__top">PIEZA · CONTROL DE MESA<br>-----------------------------</p>
    <ol class="check__list mono">
      <li><span class="tick" aria-hidden="true"></span>Caja abierta frente a cámara</li>
      <li><span class="tick" aria-hidden="true"></span>Encendido y carga completa</li>
      <li><span class="tick" aria-hidden="true"></span>Pantalla, botones y puertos</li>
      <li><span class="tick" aria-hidden="true"></span>Número de serie anotado</li>
      <li><span class="tick" aria-hidden="true"></span>Embalado con su etiqueta</li>
    </ol>
    <p class="mono check__bottom">-----------------------------<br>OK · LISTO PARA DESPACHAR</p>
  </div>
  <div class="check__text">
    <p class="kicker mono">Capítulo 3</p>
    <h2 id="check-h">Lo que hacemos antes de cerrar la caja</h2>
    <p>Comprar tecnología por internet da miedo: que llegue otro modelo, que no prenda, que falte el cargador. Por eso cada pedido pasa por la mesa y sale con su control firmado.</p>
    <p class="mono small">Ejemplo del recorrido de una tienda real. En esta demo no se despacha nada.</p>
  </div>
</section>

<section class="chapter chapter--paper" aria-labelledby="fresh-h">
  <div class="chapter__head chapter__head--row">
    <div>
      <p class="kicker mono">Capítulo 4</p>
      <h2 id="fresh-h">Recién salidos de la mesa</h2>
    </div>
    <a class="link-arrow" href="${url("productos/")}">Ver las ${products.length} piezas</a>
  </div>
  <ul class="tray">${fresh.map((p) => item(p)).join("")}</ul>
</section>

<section class="chapter chapter--map mat" aria-labelledby="map-h">
  <div class="ruler ruler--top" aria-hidden="true"></div>
  <div class="map-teaser">
    <div>
      <p class="kicker mono">Capítulo 5</p>
      <h2 id="map-h">El mapa de la mesa</h2>
      <p>La misma inteligencia artificial ubica todo el catálogo en un plano: lo que se parece queda cerca. Tocá una pieza y se iluminan sus vecinas.</p>
      <a class="btn btn--buy" href="${url("mapa/")}">Abrir el mapa</a>
    </div>
    <div class="map-teaser__dots" aria-hidden="true">
      ${products.map((p) => `<i style="--x:${ai[p.slug].xy[0] * 100}%;--y:${ai[p.slug].xy[1] * 100}%" data-cat="${p.cat}"></i>`).join("")}
    </div>
  </div>
</section>`;
  return layout({ description: `${store.name}: tecnología revisada a mano en ${store.city}. ${store.installments} cuotas sin interés, envío a todo el país y recomendaciones con inteligencia artificial. Tienda de demostración.`, body, page: "home" });
}

function catalog() {
  const body = `
<section class="chapter chapter--paper catalog">
  <div class="chapter__head chapter__head--row">
    <div>
      <p class="kicker mono">Todos los cajones</p>
      <h1 data-catalog-title>Las ${products.length} piezas</h1>
    </div>
    <p class="mono catalog__count" data-catalog-count aria-live="polite">${products.length} piezas</p>
  </div>
  <div class="filters" role="group" aria-label="Filtrar por cajón">
    <a href="${url("productos/")}" class="filter" data-filter="" aria-current="true">Todo</a>
    ${store.drawers.map((d) => `<a href="${url(`productos/?cajon=${d.id}`)}" class="filter" data-filter="${d.id}"><span class="mono">${d.num}</span> ${d.name}</a>`).join("")}
    <label class="sort mono"><span>Orden</span>
      <select data-sort>
        <option value="">Como en la mesa</option>
        <option value="asc">Menor precio</option>
        <option value="desc">Mayor precio</option>
      </select>
    </label>
  </div>
  <ul class="tray tray--all" data-catalog>${products.map((p, i) => item(p, { eager: i < 8 })).join("")}</ul>
  <p class="empty" data-empty hidden>No encontramos piezas con esa búsqueda. Probá con otra palabra o <a href="${url("productos/")}">mirá todo</a>.</p>
</section>`;
  return layout({ title: "Cajones", description: `Catálogo completo de ${store.name}: celulares, tablets, computación, audio, gaming, foto, hogar y accesorios.`, body, path: "productos/", page: "catalog" });
}

function productPage(p) {
  const d = drawer[p.cat];
  const c = credits[p.photo];
  const lic = c && licenseUrl(c.license);
  const similar = ai[p.slug].similar.map((s) => bySlug[s]);
  const o = off(p);
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, brand: { "@type": "Brand", name: p.brand },
    description: p.short, image: (SITE_URL || "") + img(p.slug),
    offers: { "@type": "Offer", priceCurrency: "ARS", price: p.price, availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
  };
  const body = `
<nav class="crumbs mono" aria-label="Ruta"><a href="${url("productos/")}">Cajones</a> / <a href="${url(`productos/?cajon=${d.id}`)}">${d.num} ${d.name}</a></nav>
<article class="pdp">
  <div class="pdp__photo mat">
    <div class="ruler ruler--top" aria-hidden="true"></div>
    <div class="ruler ruler--left" aria-hidden="true"></div>
    <figure>
      <img src="${img(p.slug)}" alt="${esc(p.name)}" width="1000" height="1000" fetchpriority="high">
      ${c ? `<figcaption class="mono">Foto: ${c.source ? `<a href="${esc(c.source)}" rel="noopener nofollow" target="_blank">${esc(c.author || "autor desconocido")}</a>` : esc(c.author)}, ${lic ? `<a href="${lic}" rel="noopener nofollow license" target="_blank">${esc(c.license)}</a>` : esc(c.license)}. Foto ilustrativa, recortada.</figcaption>` : ""}
    </figure>
    <span class="stamp" aria-hidden="true">REVISADO<small>EN LA MESA</small></span>
  </div>
  <div class="pdp__sheet">
    <p class="kicker mono">${d.num} · ${esc(d.name)} · ${esc(p.brand)}</p>
    <h1>${esc(p.name)}</h1>
    <p class="pdp__short">${esc(p.short)}</p>
    ${priceBlock(p, true)}
    <div class="cuotas" data-cuotas data-price="${p.price}">
      <p class="mono cuotas__h">Calculá tus cuotas</p>
      <div class="cuotas__opts" role="radiogroup" aria-label="Cantidad de cuotas">
        ${[1, 3, store.installments].map((n, i) => `<label><input type="radio" name="cuotas" value="${n}"${i === 2 ? " checked" : ""}><span>${n === 1 ? "1 pago" : `${n} cuotas`}</span></label>`).join("")}
      </div>
      <p class="cuotas__out" aria-live="polite"><b class="mono" data-cuota>${money(p.price / store.installments)}</b> <span data-cuota-label>por mes, sin interés</span></p>
    </div>
    <p class="ship mono">${p.price >= store.freeShippingFrom ? "Envío gratis a todo el país" : `Envío ${money(store.shipping)} · gratis desde ${money(store.freeShippingFrom)}`}</p>
    ${p.stock > 0
      ? `<form class="buy" data-buy="${p.slug}">
      <label class="sr-only" for="qty">Cantidad</label>
      <input id="qty" name="qty" type="number" min="1" max="${Math.min(p.stock, 9)}" value="1" inputmode="numeric">
      <button class="btn btn--buy" type="submit">Agregar al carrito</button>
    </form>
    <p class="stock mono">${p.stock <= 3 ? `Quedan ${p.stock} en la mesa` : "Hay stock en la mesa"}</p>`
      : `<p class="stock stock--out mono">Sin stock por ahora</p>`}
    <dl class="specs">
      ${p.specs.map(([k, v]) => `<div><dt class="mono">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
      <div><dt class="mono">Código</dt><dd class="mono">PZ-${String(products.indexOf(p) + 1).padStart(3, "0")}</dd></div>
    </dl>
  </div>
</article>

<section class="chapter chapter--mat mat pdp-fits" aria-labelledby="fits-h">
  <div class="ruler ruler--top" aria-hidden="true"></div>
  <div class="encajan encajan--pdp">
    <div class="encajan__text">
      <p class="kicker mono">La pieza que falta</p>
      <h2 id="fits-h">Piezas que encajan con este ${p.cat === "celulares" ? "celular" : "producto"}</h2>
      <p>Elegidas por la inteligencia artificial de la tienda entre productos que funcionan con este.</p>
    </div>
    ${fitsBench(p, { heading: false })}
  </div>
</section>

<section class="chapter chapter--paper" aria-labelledby="sim-h">
  <div class="chapter__head chapter__head--row">
    <div><p class="kicker mono">Vecinas en el mapa</p><h2 id="sim-h">Si estás comparando</h2></div>
    <a class="link-arrow" href="${url(`mapa/?pieza=${p.slug}`)}">Ver en el mapa</a>
  </div>
  <ul class="tray">${similar.map((s) => item(s)).join("")}</ul>
</section>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  return layout({ title: p.name, description: `${p.name} en ${store.name}: ${p.short} ${money(p.price)}${o ? ` (-${o}%)` : ""}, ${store.installments} cuotas sin interés.`, body, path: `p/${p.slug}/`, page: "product", image: img(p.slug) });
}

function mapPage() {
  const body = `
<section class="mapview mat" aria-labelledby="mapa-h">
  <div class="ruler ruler--top" aria-hidden="true"></div>
  <div class="mapview__side">
    <p class="kicker mono">El mapa de la mesa</p>
    <h1 id="mapa-h">Lo que se parece, queda cerca</h1>
    <p>La inteligencia artificial de la tienda lee el nombre, la descripción y la ficha de cada producto, y los ubica en este plano. Nadie los acomodó a mano.</p>
    <label class="mapview__find"><span class="sr-only">Buscar en el mapa</span><input type="search" placeholder="Buscar una pieza" data-map-find list="map-names"></label>
    <datalist id="map-names">${products.map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>
    <ul class="legend mono">${store.drawers.map((d) => `<li data-cat="${d.id}"><i></i>${d.num} ${d.name}</li>`).join("")}</ul>
  </div>
  <div class="mapview__panel" data-map-panel aria-live="polite">
    <p class="mono">Tocá cualquier pieza del mapa.</p>
  </div>
  <div class="mapview__scroll" data-map-scroll>
    <div class="mapview__plane" data-map>
      <svg class="mapview__links" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" data-map-links></svg>
      ${products.map((p) => `<button type="button" class="pin" data-pin="${p.slug}" data-cat="${p.cat}" style="--x:${ai[p.slug].xy[0] * 100}%;--y:${ai[p.slug].xy[1] * 100}%" aria-label="${esc(p.name)}"><img src="${img(p.slug, "-s")}" alt="" loading="lazy" width="64" height="64"></button>`).join("")}
    </div>
  </div>
</section>`;
  return layout({ title: "Mapa del catálogo", description: `Mapa interactivo del catálogo de ${store.name}: la inteligencia artificial agrupa los productos parecidos.`, body, path: "mapa/", page: "map" });
}

function cartPage() {
  const provinces = ["Mendoza", "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán"];
  const body = `
<section class="chapter chapter--paper cart" aria-labelledby="cart-h">
  <div class="chapter__head"><p class="kicker mono">Remito</p><h1 id="cart-h">Tu carrito</h1></div>
  <div class="cart__grid" data-cart-page>
    <div class="slip" data-slip>
      <p class="mono" data-cart-empty hidden>Tu carrito está vacío. <a href="${url("productos/")}">Abrí un cajón</a>.</p>
      <ul class="slip__lines" data-cart-lines></ul>
      <dl class="slip__totals mono" data-cart-totals></dl>
    </div>
    <form class="checkout" data-checkout novalidate>
      <fieldset>
        <legend>Datos de envío</legend>
        <div class="field"><label for="f-name">Nombre y apellido</label><input id="f-name" name="name" autocomplete="name" required minlength="3"><p class="err" hidden></p></div>
        <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required><p class="err" hidden></p></div>
        <div class="field"><label for="f-phone">Teléfono</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" required pattern="[\\d +\\-\\(\\)]{8,}"><p class="err" hidden></p></div>
        <div class="field field--wide"><label for="f-street">Calle y número</label><input id="f-street" name="street" autocomplete="street-address" required minlength="4"><p class="err" hidden></p></div>
        <div class="field"><label for="f-city">Ciudad</label><input id="f-city" name="city" autocomplete="address-level2" required><p class="err" hidden></p></div>
        <div class="field"><label for="f-prov">Provincia</label><select id="f-prov" name="province" required autocomplete="address-level1"><option value="">Elegí</option>${provinces.map((p) => `<option>${p}</option>`).join("")}</select><p class="err" hidden></p></div>
        <div class="field"><label for="f-zip">Código postal</label><input id="f-zip" name="zip" autocomplete="postal-code" required pattern="[A-Za-z]?[0-9]{4}[A-Za-z]{0,3}" inputmode="numeric"><p class="err" hidden></p></div>
      </fieldset>
      <fieldset>
        <legend>Pago</legend>
        <p class="pay mono"><b>Mercado Pago</b> · ${store.installments} cuotas sin interés. En esta demo el pago es simulado: no pedimos ni guardamos tarjetas.</p>
      </fieldset>
      <button class="btn btn--buy btn--block" type="submit" data-pay>Pagar con Mercado Pago (simulado)</button>
    </form>
  </div>
</section>
<div class="paying" data-paying hidden role="alertdialog" aria-modal="true" aria-labelledby="paying-h">
  <div class="paying__box" tabindex="-1">
    <p id="paying-h" class="mono">Conectando con Mercado Pago (simulado)…</p>
    <span class="paying__bar"><i></i></span>
  </div>
</div>`;
  return layout({ title: "Carrito", description: `Tu carrito en ${store.name}.`, body, path: "carrito/", page: "cart" });
}

function orderPage() {
  const body = `
<section class="chapter chapter--paper order" aria-labelledby="order-h" data-order>
  <div class="order__ticket">
    <p class="kicker mono" data-order-num>Pedido</p>
    <h1 id="order-h" data-order-title>Buscando tu pedido…</h1>
    <ol class="steps mono" data-order-steps>
      <li class="is-done">Pedido recibido</li>
      <li class="is-done">Pago aprobado (simulado)</li>
      <li class="is-now">En la mesa: revisión</li>
      <li>Despachado</li>
      <li>Entregado</li>
    </ol>
    <ul class="slip__lines" data-order-lines></ul>
    <dl class="slip__totals mono" data-order-totals></dl>
    <p class="mono small">Esto es una demo: no se cobró nada y no se va a despachar ningún paquete.</p>
    <a class="btn btn--ghost-dark" href="${url("productos/")}">Seguir mirando</a>
  </div>
</section>`;
  return layout({ title: "Tu pedido", description: `Estado de tu pedido en ${store.name}.`, body, path: "pedido/", page: "order" });
}

function creditsPage() {
  const rows = products.map((p) => ({ p, c: credits[p.photo] })).filter((r) => r.c);
  const body = `
<section class="chapter chapter--paper credits" aria-labelledby="cred-h">
  <div class="chapter__head"><p class="kicker mono">Fotos</p><h1 id="cred-h">Créditos de fotos</h1>
  <p>Las fotos de productos vienen de Wikimedia Commons, con licencias libres. Las usamos recortadas, redimensionadas y, en algunos casos, sin el fondo original. Son ilustrativas: no muestran un equipo en particular.</p></div>
  <ul class="credits__list">${rows.map(({ p, c }) => {
    const lic = licenseUrl(c.license);
    return `<li><img src="${img(p.slug, "-s")}" alt="" width="72" height="72" loading="lazy"><div><a href="${url(`p/${p.slug}/`)}">${esc(p.name)}</a><p class="mono">${c.source ? `<a href="${esc(c.source)}" rel="noopener nofollow" target="_blank">${esc(c.author || "autor desconocido")}</a>` : esc(c.author)} · ${lic ? `<a href="${lic}" rel="noopener nofollow license" target="_blank">${esc(c.license)}</a>` : esc(c.license)}</p></div></li>`;
  }).join("")}</ul>
</section>`;
  return layout({ title: "Créditos de fotos", description: "Autores y licencias de las fotos de productos.", body, path: "creditos/", page: "credits" });
}

function notFound() {
  const body = `
<section class="chapter chapter--mat mat lost">
  <div class="ruler ruler--top" aria-hidden="true"></div>
  <p class="kicker mono">Error 404</p>
  <h1>Esta pieza no está en la mesa</h1>
  <p>Puede que la hayan movido de cajón. Volvé a empezar desde los cajones.</p>
  <a class="btn btn--buy" href="${url("productos/")}">Abrir los cajones</a>
</section>`;
  return layout({ title: "No encontrado", description: "Página no encontrada.", body, page: "404" });
}

// ---------- write ----------
rmSync(DIST, { recursive: true, force: true });
const out = (rel, html) => { const f = path.join(DIST, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, html); };
cpSync(path.join(ROOT, "static"), DIST, { recursive: true });
cpSync(path.join(ROOT, "src"), DIST, { recursive: true });
out("index.html", home());
out("productos/index.html", catalog());
for (const p of products) out(`p/${p.slug}/index.html`, productPage(p));
out("mapa/index.html", mapPage());
out("carrito/index.html", cartPage());
out("pedido/index.html", orderPage());
out("creditos/index.html", creditsPage());
out("404.html", notFound());
out(".nojekyll", "");
out("robots.txt", "User-agent: *\nDisallow: /\n"); // a demo should not compete with real stores in search
// Small catalog for the browser: cart, search on the map, neighbours.
out("catalog.json", JSON.stringify({
  store: { installments: store.installments, freeShippingFrom: store.freeShippingFrom, shipping: store.shipping },
  drawers: store.drawers.map(({ id, num, name }) => ({ id, num, name })),
  products: products.map((p) => ({ slug: p.slug, name: p.name, brand: p.brand, cat: p.cat, price: p.price, stock: p.stock, cut: hasCut(p.slug), similar: ai[p.slug].similar })),
}));
console.log(`Built ${products.length + 7} pages into dist/ (BASE=${BASE})`);
