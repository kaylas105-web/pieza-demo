# Pieza (demo store)

A demo electronics store for Argentina, built as a static site so it runs free on GitHub Pages.
The brand, prices and stock are fictional; nothing is sold or charged.

The idea: a technician's bench. Every product "passes through the bench" before shipping.
The signature feature is **Piezas que encajan**: pick a product and the bench fills the empty
slots with the pieces that work with it, chosen by the store's AI recommendations.

## What works

- Catalog with 8 drawers (categories), search, sort by price
- Product pages with an installments calculator (cuotas sin interés), specs and photo credits
- Piezas que encajan (complementary products) and similar products
- Catalog map: every product placed by its AI embedding, nearest neighbours on click
- Cart in the browser, checkout form with validation, simulated Mercado Pago payment, order page

No accounts or admin panel: those need a server.

## How the AI part works

`scripts/embed.mjs` runs once on a developer machine with the multilingual MiniLM model
(Transformers.js, local, no API). It writes `data/ai.json`: 4 similar products, 3 that fit
(from complementary drawers, with brand and platform checks) and a 2D map position for each
product. The site only reads that file.

## Build and preview

Needs Node 22.

```
node scripts/build.mjs                          # builds dist/ for the site root
BASE=/pieza-demo/ node scripts/build.mjs        # for a GitHub Pages project site
BASE=/pieza-demo/ node scripts/serve.mjs        # http://localhost:4321/pieza-demo/
```

`tests/e2e.mjs` walks the buying journey with Playwright and crawls every link:

```
node tests/e2e.mjs <path to a node_modules/playwright folder>
```

## Data

- `data/products.json`: products (name, price, stock, specs, photo file)
- `data/store.json`: store name, drawers, installments, shipping
- `data/credits.csv`: photo authors and licenses (Wikimedia Commons)
- `static/img/`: web images made by `scripts/prepare_images.py` (square crops, cutouts)

After changing products: run `prepare_images.py` (new photos) and `embed.mjs` (new AI data), then build.

## Deploy

Push to `main`. The workflow in `.github/workflows/pages.yml` builds and publishes to GitHub Pages.
In the repo settings, Pages > Source must be set to "GitHub Actions" (once).

## Photos

Product photos come from Wikimedia Commons under free licenses, cropped and resized, some with
the background removed. Authors and licenses are listed on the "Créditos de fotos" page and
under each product photo. Product and brand names belong to their owners.
