# Product Explorer

A small, responsive product catalogue built on the [DummyJSON Products API](https://dummyjson.com/docs/products).

Search, category filtering, sorting and pagination are all delegated to the API, so the browser
only ever transfers one page of results. Every product opens a details dialog backed by its own
request, and the loading, empty and failure states are all first-class parts of the UI rather than
afterthoughts.

Built with vanilla JavaScript (ES modules) and Vite — **no runtime dependencies**.

---

## Contents

- [Features](#features)
- [Technologies used](#technologies-used)
- [API used](#api-used)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Implementation notes](#implementation-notes)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

---

## Features

**Data & querying**
- Live product data from the DummyJSON Products API
- Full-text search across product name and description (debounced, 350 ms)
- Filter by any of the catalogue's 24 categories
- Six sort options — featured, top rated, biggest discount, price ↑/↓, name A–Z
- Server-side pagination with a windowed pager (`1 … 4 5 6 … 17`)
- Search, filter, sort and page state is mirrored into the URL, so any view can be
  shared or survive a refresh

**Details view**
- Accessible modal dialog with a full record fetched from `/products/{id}`:
  gallery, specifications, dimensions, warranty, shipping, returns and reviews
- Multi-image gallery with keyboard-operable thumbnails

**States**
- Skeleton placeholders sized to match real cards, so there is no layout shift on load
- Distinct, actionable error states for offline, timeout, network, 4xx and 5xx failures,
  each with a retry that re-runs the exact failed request
- Empty state worded to reflect which controls produced it, with a one-click reset
- Automatic single retry with backoff for transient failures, so a blip never reaches the user

**UX & accessibility**
- Responsive from 320 px to widescreen — 4 / 3 / 2 / 1 columns, no horizontal overflow
- Full keyboard support: skip link, visible focus rings throughout, <kbd>Ctrl/⌘ K</kbd> to focus search,
  <kbd>Esc</kbd> to clear search or close the dialog
- Dialog traps Tab, restores focus to the triggering card on close, and locks background scrolling
- Single polite live region announcing result counts (the grid is deliberately *not* a live region)
- Honours `prefers-reduced-motion`

---

## Technologies used

| | |
|---|---|
| **Language** | JavaScript (ES2020+ modules), no framework |
| **Build tool** | [Vite](https://vite.dev) 8 |
| **Styling** | Hand-written CSS with custom-property design tokens |
| **Testing** | [Playwright](https://playwright.dev) — 88 end-to-end tests |
| **Runtime dependencies** | none |

**Why no framework?** The app has one screen and a single shared piece of state (the current
query). A framework would have been the largest thing in the bundle without removing any real
complexity. The result is ~15 kB gzipped total.

**Why no web font?** A system font stack renders immediately, needs no network request, and
cannot cause a flash of invisible text or break offline.

---

## API used

Base URL: `https://dummyjson.com`

| Endpoint | Used for |
|---|---|
| `GET /products` | Paged catalogue listing |
| `GET /products/search?q=` | Text search |
| `GET /products/category/{slug}` | Category filtering |
| `GET /products/category-list` | Populating the category dropdown |
| `GET /products/{id}` | Full record for the details dialog |

Shared query parameters: `limit`, `skip`, `sortBy`, `order`, `select`.

`sortBy`/`order` were verified against the live API to sort the **entire** collection before
`skip`/`limit` are applied — on `/products`, `/products/search` and `/products/category/*` alike.
That is what makes server-side sorting correct across page boundaries, and it is covered by a test
that asserts page 2's cheapest item is not cheaper than page 1's most expensive.

---

## Getting started

### Prerequisites

Node.js `^20.19.0 || >=22.12.0` (required by Vite 8) and npm.

```bash
node --version
```

### Installation

```bash
git clone <repository-url>
cd dummyjson-product-explorer
npm install
```

### Run locally (development)

```bash
npm run dev
```

Then open <http://localhost:5173>. Hot module replacement is enabled.

### Build for production

```bash
npm run build
```

Outputs a static, deployable bundle to `dist/`:

```
dist/index.html                  3.6 kB │ gzip: 1.3 kB
dist/assets/index-*.css         20.4 kB │ gzip: 4.7 kB
dist/assets/index-*.js          25.9 kB │ gzip: 9.2 kB
```

### Preview the production build

```bash
npm run preview
```

Serves `dist/` on <http://localhost:4173>.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `https://dummyjson.com` | Points the app at a different API host. Handy for a mock/proxy, or for exercising the error state by setting an unreachable host. |

Set it in a `.env.local` file or inline:

```bash
VITE_API_BASE_URL=https://unreachable.invalid npm run dev
```

---

## Project structure

```
├── index.html                  # Static shell: header, hero, mount points, footer
├── src
│   ├── main.js                 # Controller: wiring, request lifecycle, rendering
│   ├── api
│   │   ├── client.js           # HTTP layer: timeout, retry, abort, ApiError
│   │   └── products.js         # Endpoint selection, sort options, response shaping
│   ├── state
│   │   └── store.js            # App state, pub/sub, URL synchronisation
│   ├── ui                      # Presentational components (build & return DOM)
│   │   ├── toolbar.js          # Search / category / sort controls
│   │   ├── productGrid.js      # Grid + delegated click handling
│   │   ├── productCard.js      # Card + skeleton card
│   │   ├── pagination.js       # Windowed pager
│   │   ├── productModal.js     # Details dialog (focus trap, scroll lock)
│   │   └── statusPanel.js      # Error and empty panels
│   ├── lib                     # Framework-free primitives
│   │   ├── dom.js              # `el()` element factory
│   │   ├── format.js           # Currency, rating, slug formatting
│   │   ├── debounce.js         # Debounce with cancel/flush
│   │   ├── focusTrap.js        # Tab containment + focus restore
│   │   └── icons.js            # Inline SVG icon set
│   └── styles                  # Import order = cascade order
│       ├── tokens.css          # Design tokens (colour, space, type, elevation)
│       ├── base.css            # Reset, focus styles, utilities
│       ├── layout.css          # Page bands: header, hero, sticky filter bar, footer
│       ├── controls.css        # Buttons and the search / filter / sort fields
│       ├── catalogue.css       # Summary line, product grid, card, pager
│       ├── feedback.css        # Status panels, skeletons, spinner
│       └── dialog.css          # Details dialog, gallery, specs, reviews
└── tests/e2e                   # Playwright specs
```

**Layering rule:** `ui/` never talks to `api/`, and `api/` never touches the DOM. `main.js` is the
only module that knows about both — it owns the request lifecycle and hands plain data to the
components.

**CSS organisation:** no framework and no preprocessor. Every value resolves to a token, and each
stylesheet co-locates its own responsive rules rather than collecting them in a single breakpoint
dump at the bottom of the file — so a component's behaviour at every width is readable in one place.

---

## Implementation notes

### Everything is server-side, with one documented exception

Search, filtering, sorting and pagination are all API-driven — a 12-item page is a 12-item
response. The one case the API cannot express is **search combined with a category filter**:
DummyJSON has no endpoint accepting both `q` and a category.

That case fetches the full result set for the query (`limit=0`) and intersects, sorts and pages it
client-side. This is a deliberate, bounded trade-off: the widest query in this dataset matches ~30
of 194 products, so it stays a single request and a trivial amount of work. See
[`src/api/products.js`](src/api/products.js).

### Two distinct race conditions, handled separately

Typing quickly, or clicking pages rapidly, produces overlapping requests. Both failure modes are
handled in [`src/main.js`](src/main.js):

- The in-flight request is **aborted** so the browser stops work on a query nobody is waiting for.
- A monotonic request token means a response that still arrives late is **discarded** rather than
  overwriting fresher results.

Aborts are distinguished from genuine failures, so cancelling a request never shows an error.

### Error handling is typed, not generic

[`src/api/client.js`](src/api/client.js) normalises every failure into an `ApiError` with a `kind`
(`offline`, `timeout`, `network`, `notFound`, `client`, `server`, `parse`). That drives two decisions:

- **The message the user reads.** A timeout says the service is busy; a 5xx says the service is
  having problems. No status codes leak into the UI.
- **Whether retrying is offered at all.** Only transient failures (`network`, `timeout`, `server`)
  are retryable — offering "Try again" on a 404 is a dead end, so those get a reset action instead.

Requests time out at 12 s and retry once with backoff. Timeout uses an internal
`AbortController` + `setTimeout` rather than `AbortSignal.timeout()`/`AbortSignal.any()`, so the app
runs on browsers that predate those APIs.

### A failed category list does not take down the page

The category dropdown is a secondary concern. If `/products/category-list` fails, the filter quietly
degrades to "All categories" and the catalogue stays fully usable — verified by a test.

### The render path is XSS-safe by construction

All DOM is built through the `el()` factory in [`src/lib/dom.js`](src/lib/dom.js), which routes text
through `textContent`. There is no HTML-string interpolation of API data and therefore no hand-rolled
escaping to get wrong. The only use of `innerHTML` is the in-repo inline SVG icon set.

### Accessible cards without nested interactive elements

Each card's "Details" button carries a full-card `::after` overlay. Pointer users get the
whole-card click target they expect; keyboard and screen reader users get exactly one properly
labelled control per card, instead of a card-inside-a-button or competing nested controls.

### Dialog details worth noting

- `Escape` is bound with an explicitly removed listener, **not** `{ once: true }` — a one-shot
  listener is consumed by the first keypress of any kind, which silently leaves `Escape` dead.
  There is a regression test for exactly this.
- Backdrop dismissal requires both press *and* release on the backdrop, so a text selection dragged
  out of the dialog does not close it.
- Scroll lock pads the body by the scrollbar's width, so the page behind does not jump.

### URL state uses `replaceState`, deliberately

Filter state is mirrored to the URL for sharing and refresh-safety, using `replaceState` rather
than `pushState`. With `pushState`, typing a search term would push a history entry per keystroke —
a Back button that walks backwards through half-typed queries is worse than no in-app history. The
trade-off is that Back leaves the app rather than undoing a filter.

---

## Testing

88 end-to-end tests run against the **production build** (`vite preview`) in two projects —
desktop Chrome and a Pixel 7 viewport.

```bash
npm run test:e2e                      # everything
npx playwright test --project=desktop-chromium
npx playwright test --headed           # watch it run
```

Happy paths run against the live API, because the point is to prove the real integration works.
Failure and empty states use request interception so they stay deterministic. Coverage includes:

- Load, search, debounce behaviour, category filter, both price sorts, pagination,
  URL hydration, invalid-category fallback, page reset on query change
- Cross-page sort correctness (page 2 continues where page 1 stopped)
- Empty results and reset; error / 500 / timeout / auto-retry / partial-failure states
- Dialog: detail fetch, labelling, Escape (including after other keypresses), backdrop,
  focus trap, focus restore, scroll lock, in-dialog error + retry, gallery switching
- Responsive column counts and horizontal-overflow checks at mobile / tablet / desktop
- Accessibility: labelled controls, single live region, card action names, keyboard-only
  path from search to dialog, skip link, heading structure

Every test also asserts a clean console — uncaught exceptions fail the run.

---

## Deployment

The build is a static bundle; any static host works. `base` is set to `./` in
[`vite.config.js`](vite.config.js), so it also works from a sub-path (GitHub Pages project sites,
S3 prefixes) with no reconfiguration.

Included configuration:

- [`netlify.toml`](netlify.toml) and [`vercel.json`](vercel.json) — build command, publish
  directory, and cache headers (immutable hashed assets, always-revalidated HTML)
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — installs, builds and runs the full
  test suite on push and PR

**Netlify / Vercel:** connect the repository; both configs are picked up automatically.
Otherwise: build command `npm run build`, publish directory `dist`.

**GitHub Pages:** `npm run build`, then publish `dist/`.

---

## Known limitations

- **Search + category is filtered client-side.** Unavoidable with this API (no endpoint accepts
  both), and bounded — see [Implementation notes](#implementation-notes). Against a much larger
  search result set this would need a different approach.
- **The Back button leaves the app** rather than stepping back through filters — a deliberate
  consequence of using `replaceState`.
- **`brand` is missing on roughly a third of DummyJSON records.** It is shown when present and
  omitted from the specifications list when absent, rather than rendering an empty row.
- **Search matches only what the API's `/products/search` matches — title and description.**
  Verified against the live API: brand, category and tags are *not* searchable server-side
  (searching a product's own brand returns zero results), and category names are not matched either,
  so "laptops" finds products whose text mentions laptops rather than everything in the Laptops
  category. The category dropdown is the tool for that, and the input's placeholder is worded to
  set the right expectation. Broadening this would mean fetching the catalogue and searching
  client-side — a worse trade for a dataset that could grow.
- **No unit tests.** For an app this size the end-to-end suite was the higher-value use of the
  time budget, since it verifies real API integration and real accessibility behaviour rather than
  mocked internals.
- **Reviews are display-only**, capped at 3, and reviewer email addresses in the API response are
  deliberately not rendered.
