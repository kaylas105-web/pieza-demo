// Pieza demo: everything that runs in the browser. No framework, no tracking.
const BASE = document.body.dataset.base || "/";
const money = (n) => "$ " + Math.round(n).toLocaleString("es-AR");
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- storage (can be blocked in private windows) ----------
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* cart lives only in memory then */ } },
};
let memoryCart = store.get("pieza-cart", {});
const getCart = () => memoryCart;
const setCart = (cart) => { memoryCart = cart; store.set("pieza-cart", cart); paintCount(true); };

// ---------- catalog data ----------
let catalogPromise;
const catalog = () => (catalogPromise ??= fetch(BASE + "catalog.json").then((r) => r.json()).then((c) => ({ ...c, bySlug: Object.fromEntries(c.products.map((p) => [p.slug, p])) })));

// ---------- cart badge + toast ----------
function paintCount(bump = false) {
  const n = Object.values(getCart()).reduce((a, b) => a + b, 0);
  for (const el of $$("[data-cart-count]")) {
    el.textContent = n;
    if (bump && !reduced) { el.classList.remove("is-bump"); void el.offsetWidth; el.classList.add("is-bump"); }
  }
}
let toastTimer;
function toast(html) {
  const el = $("[data-toast]");
  if (!el) return;
  el.innerHTML = html;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 3800);
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function addToCart(slug, qty = 1) {
  const { bySlug } = await catalog();
  const p = bySlug[slug];
  if (!p || p.stock <= 0) return false;
  const cart = { ...getCart() };
  cart[slug] = Math.min((cart[slug] || 0) + qty, Math.min(p.stock, 9));
  setCart(cart);
  toast(`<span>Sumado: ${escapeHtml(p.name)}</span><a href="${BASE}carrito/">Ver carrito</a>`);
  return true;
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  e.preventDefault();
  if (await addToCart(btn.dataset.add)) {
    btn.classList.add("is-added");
    btn.textContent = "En el carrito";
  }
});
for (const form of $$("[data-buy]")) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const qty = Math.max(1, Math.min(9, parseInt(form.qty.value, 10) || 1));
    await addToCart(form.dataset.buy, qty);
  });
}

// ---------- reveal on scroll ----------
const revealTargets = $$(".chapter__head, .cabinet, .tray, .check__ticket, .check__text, .map-teaser, .encajan__text");
revealTargets.forEach((el) => el.classList.add("reveal"));
const io = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add("is-in", "is-on"); io.unobserve(en.target); }
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 })
  : null;
for (const el of [...revealTargets, ...$$("[data-bench]")]) io ? io.observe(el) : el.classList.add("is-in", "is-on");

// ---------- Piezas que encajan: choose a base piece ----------
const tabs = $$("[data-pick]");
function pick(btn, focus = false) {
  for (const t of tabs) {
    const on = t === btn;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute("aria-controls"));
    panel.hidden = !on;
    if (on) {
      const bench = $("[data-bench]", panel);
      bench.classList.remove("is-on");
      requestAnimationFrame(() => requestAnimationFrame(() => bench.classList.add("is-on")));
    }
  }
  if (focus) btn.focus();
}
tabs.forEach((t, i) => {
  t.tabIndex = i === 0 ? 0 : -1;
  t.addEventListener("click", () => pick(t));
  t.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); }
  });
});

// ---------- cuotas calculator ----------
for (const box of $$("[data-cuotas]")) {
  const price = Number(box.dataset.price);
  const out = $("[data-cuota]", box), label = $("[data-cuota-label]", box);
  box.addEventListener("change", (e) => {
    const n = Number(e.target.value);
    out.textContent = money(price / n);
    label.textContent = n === 1 ? "en un pago" : `por mes, ${n} cuotas sin interés`;
  });
}

// ---------- catalog: drawers, search, sort ----------
const grid = $("[data-catalog]");
if (grid) {
  const items = $$(".slot", grid);
  const original = [...items];
  const title = $("[data-catalog-title]"), count = $("[data-catalog-count]"), empty = $("[data-empty]");
  const input = $("#q");
  const names = Object.fromEntries($$("[data-filter]").map((a) => [a.dataset.filter, a.textContent.replace(/^\s*\d+\s*/, "").trim()]));
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function apply() {
    const params = new URLSearchParams(location.search);
    const cat = params.get("cajon") || "";
    const q = norm(params.get("q") || "");
    const sort = params.get("orden") || "";
    if (input) input.value = params.get("q") || "";
    $("[data-sort]").value = sort;
    let shown = 0;
    for (const li of items) {
      const ok = (!cat || li.dataset.cat === cat) && (!q || q.split(/\s+/).every((w) => norm(li.dataset.name).includes(w)));
      li.hidden = !ok;
      if (ok) shown++;
    }
    const ordered = sort ? [...original].sort((a, b) => (sort === "asc" ? 1 : -1) * (a.dataset.price - b.dataset.price)) : original;
    ordered.forEach((li) => grid.appendChild(li));
    for (const a of $$("[data-filter]")) a.setAttribute("aria-current", String(a.dataset.filter === cat));
    title.textContent = q ? `Resultados para “${params.get("q")}”` : cat ? names[cat] : `Las ${items.length} piezas`;
    count.textContent = `${shown} ${shown === 1 ? "pieza" : "piezas"}`;
    empty.hidden = shown > 0;
    document.title = `${title.textContent} · Pieza`;
  }
  const go = (changes) => {
    const params = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(changes)) v ? params.set(k, v) : params.delete(k);
    history.pushState(null, "", `${location.pathname}${params.size ? "?" + params : ""}`);
    apply();
  };
  for (const a of $$("[data-filter]")) a.addEventListener("click", (e) => { e.preventDefault(); go({ cajon: a.dataset.filter, q: "" }); });
  $("[data-sort]").addEventListener("change", (e) => go({ orden: e.target.value }));
  // On this page the header search filters in place, as you type.
  const form = input?.closest("form");
  form?.addEventListener("submit", (e) => { e.preventDefault(); go({ q: input.value.trim(), cajon: "" }); });
  let typing;
  input?.addEventListener("input", () => { clearTimeout(typing); typing = setTimeout(() => go({ q: input.value.trim(), cajon: "" }), 220); });
  addEventListener("popstate", apply);
  apply();
}

// ---------- map ----------
const plane = $("[data-map]");
if (plane) {
  const panel = $("[data-map-panel]"), links = $("[data-map-links]"), find = $("[data-map-find]");
  const pins = Object.fromEntries($$("[data-pin]").map((b) => [b.dataset.pin, b]));
  const pos = (b) => [parseFloat(b.style.getPropertyValue("--x")) * 10, parseFloat(b.style.getPropertyValue("--y")) * 10];

  async function select(slug, scroll = false) {
    const { bySlug, drawers } = await catalog();
    const p = bySlug[slug];
    if (!p) return;
    plane.classList.add("has-pick");
    for (const b of Object.values(pins)) b.classList.remove("is-pick", "is-near");
    pins[slug].classList.add("is-pick");
    const [x0, y0] = pos(pins[slug]);
    links.innerHTML = p.similar.map((s) => { pins[s].classList.add("is-near"); const [x, y] = pos(pins[s]); return `<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}"/>`; }).join("");
    const d = drawers.find((x) => x.id === p.cat);
    panel.innerHTML = `<p class="mono">${d.num} · ${escapeHtml(d.name)}</p><h2>${escapeHtml(p.name)}</h2><p class="mono">${money(p.price)}</p>
      <p class="mono">Sus 4 vecinas más cercanas:</p>
      <ul>${p.similar.map((s) => `<li><a href="${BASE}p/${s}/"><span>${escapeHtml(bySlug[s].name)}</span><span class="mono">${money(bySlug[s].price)}</span></a></li>`).join("")}</ul>
      <div class="panel__actions"><a class="btn btn--buy" href="${BASE}p/${slug}/">Ver la pieza</a>${p.stock > 0 ? `<button type="button" class="btn btn--ghost" data-add="${slug}">+ Sumar</button>` : ""}</div>`;
    // Only scroll the map sideways (on phones it is wider than the screen), never the page.
    const box = $("[data-map-scroll]");
    if (scroll && box.scrollWidth > box.clientWidth) box.scrollTo({ left: pins[slug].offsetLeft - box.clientWidth / 2, behavior: reduced ? "auto" : "smooth" });
    history.replaceState(null, "", `${location.pathname}?pieza=${slug}`);
  }
  for (const [slug, b] of Object.entries(pins)) b.addEventListener("click", () => select(slug));
  find.addEventListener("change", async () => {
    const { products } = await catalog();
    const v = find.value.trim().toLowerCase();
    const hit = products.find((p) => p.name.toLowerCase() === v) || products.find((p) => p.name.toLowerCase().includes(v));
    if (hit) { select(hit.slug, true); pins[hit.slug].focus({ preventScroll: true }); }
  });
  const start = new URLSearchParams(location.search).get("pieza");
  if (start && pins[start]) select(start, true);
}

// ---------- cart page ----------
const cartPage = $("[data-cart-page]");
if (cartPage) {
  const lines = $("[data-cart-lines]"), totals = $("[data-cart-totals]"), emptyMsg = $("[data-cart-empty]"), form = $("[data-checkout]");
  function sums(cart, c) {
    const sub = Object.entries(cart).reduce((s, [slug, q]) => s + (c.bySlug[slug]?.price || 0) * q, 0);
    const ship = sub === 0 || sub >= c.store.freeShippingFrom ? 0 : c.store.shipping;
    return { sub, ship, total: sub + ship };
  }
  function totalsHtml({ sub, ship, total }, c) {
    return `<div><dt>Subtotal</dt><dd>${money(sub)}</dd></div>
      <div><dt>Envío</dt><dd>${ship ? money(ship) : "Gratis"}</dd></div>
      ${ship ? `<div class="note"><dt>Te faltan ${money(c.store.freeShippingFrom - sub)} para el envío gratis</dt><dd></dd></div>` : ""}
      <div class="total"><dt>Total</dt><dd>${money(total)}</dd></div>
      <div class="note"><dt>${c.store.installments} cuotas sin interés de</dt><dd>${money(total / c.store.installments)}</dd></div>`;
  }
  async function render() {
    const c = await catalog();
    const cart = Object.fromEntries(Object.entries(getCart()).filter(([s, q]) => c.bySlug[s] && q > 0));
    const has = Object.keys(cart).length > 0;
    emptyMsg.hidden = has;
    form.hidden = !has;
    lines.innerHTML = Object.entries(cart).map(([slug, q]) => {
      const p = c.bySlug[slug];
      return `<li class="line" data-line="${slug}">
        <img src="${BASE}img/${slug}-s.webp" alt="" width="64" height="64">
        <div><a class="line__name" href="${BASE}p/${slug}/">${escapeHtml(p.name)}</a><br>
          <span class="line__qty"><button type="button" data-qty="-1" aria-label="Uno menos">−</button><output aria-label="Cantidad">${q}</output><button type="button" data-qty="1" aria-label="Uno más"${q >= Math.min(p.stock, 9) ? " disabled" : ""}>+</button></span></div>
        <div class="line__side"><span class="line__price">${money(p.price * q)}</span><button type="button" class="line__remove" data-remove>Quitar</button></div>
      </li>`;
    }).join("");
    totals.innerHTML = has ? totalsHtml(sums(cart, c), c) : "";
  }
  lines.addEventListener("click", (e) => {
    const li = e.target.closest("[data-line]");
    if (!li) return;
    const cart = { ...getCart() };
    const slug = li.dataset.line;
    if (e.target.closest("[data-remove]")) delete cart[slug];
    const step = e.target.closest("[data-qty]");
    if (step) { cart[slug] = (cart[slug] || 0) + Number(step.dataset.qty); if (cart[slug] <= 0) delete cart[slug]; }
    setCart(cart);
    render();
  });

  const messages = {
    valueMissing: "Completá este dato.",
    typeMismatch: "Revisá el formato del email.",
    patternMismatch: { phone: "Escribí un teléfono con código de área.", zip: "Escribí un código postal válido, por ejemplo 5500." },
    tooShort: "Es muy corto.",
  };
  function check(field) {
    const input = $("input, select", field), err = $(".err", field), v = input.validity;
    let msg = "";
    if (!v.valid) {
      const key = Object.keys(messages).find((k) => v[k]) || "valueMissing";
      msg = typeof messages[key] === "object" ? messages[key][input.name] : messages[key];
    }
    field.classList.toggle("is-bad", !!msg);
    input.setAttribute("aria-invalid", String(!!msg));
    err.textContent = msg;
    err.hidden = !msg;
    if (msg) { err.id ||= input.id + "-err"; input.setAttribute("aria-describedby", err.id); } else input.removeAttribute("aria-describedby");
    return !msg;
  }
  for (const f of $$(".field", form)) $("input, select", f).addEventListener("blur", () => f.classList.contains("is-bad") || $("input, select", f).value ? check(f) : null);
  form.addEventListener("input", (e) => { const f = e.target.closest(".field"); if (f?.classList.contains("is-bad")) check(f); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = $$(".field", form).filter((f) => !check(f));
    if (bad.length) { $("input, select", bad[0]).focus(); return; }
    const c = await catalog();
    const cart = getCart();
    const order = {
      id: "PZ-" + Date.now().toString(36).toUpperCase().slice(-6),
      at: new Date().toISOString(),
      name: form.name.value.trim(),
      city: `${form.city.value.trim()}, ${form.province.value}`,
      items: Object.entries(cart).filter(([s]) => c.bySlug[s]).map(([slug, q]) => ({ slug, q, name: c.bySlug[slug].name, price: c.bySlug[slug].price })),
      ...sums(cart, c),
    };
    const overlay = $("[data-paying]");
    overlay.hidden = false;
    $(".paying__box", overlay).focus();
    setTimeout(() => {
      const orders = store.get("pieza-orders", {});
      orders[order.id] = order;
      store.set("pieza-orders", orders);
      try { sessionStorage.setItem("pieza-last", JSON.stringify(order)); } catch { /* ignore */ }
      setCart({});
      location.href = `${BASE}pedido/?n=${order.id}`;
    }, reduced ? 300 : 1700);
  });
  render();
}

// ---------- order page ----------
const orderEl = $("[data-order]");
if (orderEl) {
  const id = new URLSearchParams(location.search).get("n");
  let order = store.get("pieza-orders", {})[id];
  if (!order) { try { const last = JSON.parse(sessionStorage.getItem("pieza-last") || "null"); if (last?.id === id) order = last; } catch { /* ignore */ } }
  if (!order) {
    $("[data-order-title]").textContent = "No encontramos ese pedido en este navegador";
    $("[data-order-steps]").hidden = true;
  } else {
    $("[data-order-num]").textContent = `Pedido ${order.id}`;
    $("[data-order-title]").textContent = `¡Gracias, ${order.name.split(" ")[0]}! Tu pedido está en la mesa.`;
    $("[data-order-lines]").innerHTML = order.items.map((i) => `<li class="line"><img src="${BASE}img/${i.slug}-s.webp" alt="" width="64" height="64"><span class="line__name">${escapeHtml(i.name)} × ${i.q}</span><span class="line__price">${money(i.price * i.q)}</span></li>`).join("");
    $("[data-order-totals]").innerHTML = `<div><dt>Envío a</dt><dd>${escapeHtml(order.city)}</dd></div><div><dt>Envío</dt><dd>${order.ship ? money(order.ship) : "Gratis"}</dd></div><div class="total"><dt>Total pagado (simulado)</dt><dd>${money(order.total)}</dd></div>`;
  }
}

paintCount();
