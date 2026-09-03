# Lane U-SEED — the front-door gap closed: the first Components come into existence

**Date:** 2026-09-03 · **Status:** SHIPPED (no commit, per brief) · scoped tests green, my files tsc-clean.

## The gap (founder's catch)

The "Components" browser opened EMPTY with only "Load Component…" (a file picker), but:
- `find . -name '*.pryzm-family'` → **zero** starter files shipped,
- `GET /api/v1/families` served an empty in-memory store,
- there was **no "New/blank Component" path**.

So a first-time user had a file-picker and nothing to give it. The whole authoring loop
(U0 catalogue, U1 browser+place, U2 property, U3 workspace, U4 types, U6 chat) assumed a
component already existed. This lane makes the first one exist.

## What shipped (three things)

### 1. A starter library of real, valid, signed `.pryzm-family` files — authored via `packFamily`
`server/familySeeds.js` — the SINGLE source of truth (C84 EI-9). Three definitions authored as
DATA through the frozen packer (never hand-JSON, never a schema change):
- **Window** — `Width`/`Height`/`FrameWidth` + the §64 derived `GlassWidth = Width - 2 * FrameWidth`
  (so the demo works out of the box), `IfcWindow`.
- **Door** — `Width`/`Height`/`Thickness`, `IfcDoor`.
- **Panel** — `Width`/`Height`/`Depth`, `IfcBuildingElementProxy`.

Each carries a real reference plane + rectangular profile + extrude solid, is packed through
`packFamily` (signed with an ephemeral Ed25519 key), and re-unpacked to derive the exact
manifest/ifc-mapping/schema-hash that sit in the bytes. Ids are minted deterministically
(counter → Crockford-safe ULID) so the server and the tests agree without a shared constant.

`server/familyMarketplaceRoutes.js` gained `seedFamilyMarketplaceStore()` + opt-in seeding via
`buildFamilyMarketplaceRouter({ seed: true })`; the GET/POST handlers `await ensureSeedReady()`.
Seeding is OFF by default so the existing publish-flow suites keep their empty-then-publish
assertions; `server.js` opts in (off-switch `FAMILY_SEED=0`). `GET /api/v1/families` now returns
the three and `/:id/download` streams real bytes.

### 2. The browser's empty state OFFERS the starter library (not just file-open)
`apps/editor/src/ui/component-browser/ComponentBrowserPanel.ts` (additive; U4's uncommitted
"Types…" edit preserved intact — see `barrel-additions-u-seed.txt`):
- on open, `_refreshStarters()` calls the ONE catalogue's `listMarketplace()` leg (U0 already
  had it); the offers render as a **"Starter Components"** section, each with a **"Starter"**
  provenance chip and a **Load** button that calls `loadFromMarketplace(id)` (provenance
  `'marketplace'` once loaded). A slow/absent marketplace is HONEST — the empty state stands.
- the empty-state sentence now names all three routes forward (starter library, file, new).

### 3. A "New Component" path — the from-zero authoring path
`apps/editor/src/ui/component-browser/newComponent.ts` (new) + a **"New Component"** footer
button. `createBlankComponentDefinition()` mints a MINIMAL VALID definition (one type; the one
parameter is ADDED through `makeAddParameterMigrator` — the sanctioned document-mutation op,
not a hand-splice), packs it via `packFamily`, loads it through the ONE catalogue, and
`openNewComponentWorkspace()` opens **U3's existing** `openComponentDefinitionWorkspace` entry
seam on it (U3 not rewritten). D5 vocab throughout ("Component", never "Family").

## Acceptance — executed in the foreground

### (a) three seeds pack + load through the ONE catalogue and RESOLVE — GlassWidth = 1050
```
records: 3
  Window  id=fam_01HZ0000000000000000000008  bytes=1899  ifcBindings=2
  Door    id=fam_01HZ000000000000000000000M  bytes=1847  ifcBindings=2
  Panel   id=fam_01HZ0000000000000000000010  bytes=1713  ifcBindings=0
window resolve ok: true
  Width      = 1200
  FrameWidth = 75
  GlassWidth = 1050     ← the §64 formula, out of the box
```
Also proven through the real composed runtime + the ONE catalogue in
`apps/editor/__tests__/componentStarterLibraryAndNewComponent.test.ts` ARM A.

### (b) GET /api/v1/families returns the three (server test)
`server/__tests__/familyMarketplaceSeed.test.ts` (real `http.createServer` + `fetch`):
```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
- GET list returns Window/Door/Panel with category + ifcEntity + a real `sha256:` schemaHash;
- `/:id/download` streams REAL bytes that `unpackFamily` accepts, Window's `GlassWidth`
  expression intact (`Width - 2 * FrameWidth`);
- OPT-IN proven: a router built without `{ seed:true }` returns `families: []`.

### (c) composed-runtime + DOM test — browser lists three → load Window → place → resolves; New Component → workspace + add param
`apps/editor/__tests__/componentStarterLibraryAndNewComponent.test.ts`:
```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```
- ARM C: empty state renders synchronously (with file-open + New Component legs), then the
  starter library lists three (each a "Starter" chip); clicking Load on the Window registers it
  (`marketplace` provenance), it renders as a definition card, and the SAME `component.place`
  dispatch resolves and reads back out of the authoritative store.
- ARM D: "New Component" mints a minimal valid definition (one `Width` param via the op), it
  opens in U3's workspace, and `submitAddParameter` adds a second param through the workspace's
  own op path.

### Falsification — a corrupted seed refuses BY NAME; byte-identical restore
ARM B: flipping the ZIP signature bytes → `loadFromBytes` returns `ok:false`,
`reason: 'unpack-failed'`, message matches `/not-a-zip/i`, and `catalog.has(id) === false`
(the refusal wrote NOTHING — failure and empty stayed different values). Reloading the
untouched original bytes loads clean. GREEN.

## Suites
- **component surface:** new test 4/4; existing componentPlacementFlow / componentCatalogSeam /
  componentTypeCatalog / componentDefinitionWorkspace through composed runtime — 28/28.
- **file-format family:** `@pryzm/file-format` — 27 files / 282 tests, all pass (unmodified).
- **server:** `familyMarketplaceSeed.test.ts` 3/3.

## tsc (root, `--skipLibCheck`, `NODE_OPTIONS=--max-old-space-size=6144`)
My files (`ComponentBrowserPanel.ts`, `newComponent.ts`, `index.ts`) are **clean** — grep for
`component-browser|newComponent` in the tsc output → NONE. The 11 residual errors are ALL in
`packages/site-parcel-data/src/countryAdapters/ro/index.ts` and `sk/index.ts` — **untracked (`??`)
files from the concurrent countryAdapters wave**, explicitly outside this lane's scope
("countryAdapters/tools/context waves untouched"). Proven independent: importing the modified
routes + seeds under plain node (no DOMMatrix) imports clean and builds all three seeds.

## Notes for the orchestrator
- **Shared file** `ComponentBrowserPanel.ts` also carries U4's uncommitted "Types…" edit — left
  fully intact; additive merge details + the exact risk lines are in
  `audit/universal-component-editor/2026-09-02/barrel-additions-u-seed.txt`.
- **Pre-existing (NOT this lane):** `tests/family-marketplace-publish/__tests__/publish-roundtrip.test.ts`
  fails at COLLECTION with `DOMMatrix is not defined` — it imports the `@pryzm/file-format` ROOT
  barrel (pdfjs) under `environment: 'node'`, the documented pattern (see family-round-trip.test.ts's
  header). My routes/seeds import only `@pryzm/file-format/server` (proven to import clean under
  plain node), so this is not my regression and I left it untouched (file-format frozen).
- **Test-only console noise:** the panel's new auto-discovery fires a same-origin
  `GET /api/v1/families` on open; in the composed-runtime DOM suites (happy-dom, no server) that
  yields a caught `ECONNREFUSED` printed to stderr. It is caught inside `listMarketplace`
  (returns `transport-failed`), never an unhandled rejection — all suites pass. It is the correct
  production behavior (auto-discover starters).
```
