# LANE MURCIA-INE-FIX — L-12893 closed: es-mc municipalities route by Catastro INE, never by bbox chain order

**Date:** 2026-09-02 · **HEAD at start:** `c94a4d94` · **Row:** L-12893 (`docs/04-reference/ISSUE-LOG.md:53246`)
· **Evidence base:** `audit/demo-esfrpt/2026-09-02/lane-murcia-red.md` · **No commit made (per brief).**

## What shipped, in one line

The six registered Región-de-Murcia municipalities (Murcia 30030 · Cartagena 30016 · Lorca 30024 ·
Molina de Segura 30027 · Alcantarilla 30005 · Las Torres de Cotillas 30038) are now routed by the
**resolved parcel's own Catastro INE municipality code** (OVC `<cp>`+`<cm>` → `composeIneCode`),
with the bbox union demoted to the **pre-filter** it always claimed to be — L-12871's
"bbox = pre-filter only" invariant applied sub-nationally, exactly the row's recorded direction.
The founder's Churra parcel (38.0061, −1.138028) reaches the Murcia PGOU path again after four
weeks of drawing Molina de Segura's research-pending card.

## Mechanism of the fix

1. **Server proxy** (`server/jurisdiction/parcelZoningProxy.js`) — `parseReverseGeocode` now
   extracts each OVC `_Distancia` candidate's `<dt><loine><cp>…</cp><cm>…</cm></loine>` block
   (scoped to `<loine>` so namespaced `<cp:…>` GML tags can never be mistaken for it), and
   `buildParcelResult` forwards the **chosen** candidate's `cp`/`cm` on the parcel JSON — the
   §L-641 containment-preferred winner, not the merely-nearest. Null when absent, never a guess
   (L-616). The XML shape was already recorded live by `tools/murcia-parcel-probe` for this exact
   refcat (`3481104XH6038S` → `<cp>30</cp><cm>30</cm>`).
2. **Client provider** (`apps/editor/src/ui/site/parcel/CatastroParcelProvider.ts` +
   `ParcelProvider.ts`) — `parseProxyResponse` forwards `cp`/`cm` as new **optional**
   `ParcelFeature.catastroCp` / `catastroCm` fields (optional so no other provider changes).
3. **Dispatcher** (`apps/editor/src/ui/site/siteDispatch.ts`) — the six ordered bbox branches in
   `applyZoning` (Cartagena → Lorca → Molina → Alcantarilla → Las Torres → Murcia) are replaced by
   **one union-gated branch** → `applyMurciaRegionZoningByIne` (§ES-MC-INE-ROUTER), which states
   its contract at the site:
   - **DECIDER:** resolve the parcel (the same national Catastro leg every Spanish click uses);
     a resolved parcel routes by `composeIneCode(catastroCp, catastroCm)` — 30030 → the Murcia
     PGOU path (parcel threaded through as `prefetchedParcel`, so no second OVC round trip),
     30016 → Cartagena, 30005 → Alcantarilla, 30024/30027/30038 → the cited research-pending
     refusals (factored into `dispatchMurciaRegionResearchPending`, effect-identical to the old
     inline blocks).
   - **A resolved parcel whose INE is none of the six** (e.g. Santomera 30035, inside the loose
     union) routes to NO municipal path — `applyEstimatedZoning`'s registered-jurisdiction + SIU
     guards own the honest answer. Stamping the wrong municipality's card on that land was the
     L-12893 defect itself.
   - **PRE-FILTER FALLBACK:** a parcel-less click (Catastro miss/outage, or no `cp`/`cm` on the
     payload) has no cadastral identity to route from; the pre-INE chain order answers, preserved
     **verbatim** and documented at the site as an order, not a determination.

   Cartagena is included alongside the brief's five because `lane-murcia-red.md`'s root-fix
   direction names it and its box genuinely crosses `MURCIA_BBOX`'s southern band
   (37.71–37.74 × −1.23…−0.85) — the same disease, one class fix.

## INE codes — verified before hard-coding

Each code is pinned in **three independent in-repo places**, all checked this lane:
its municipality's own bbox module (`packages/site-parcel-data/src/providers/{murcia,cartagena,
lorca,molinaDeSegura,alcantarilla,lasTorresDeCotillas}Bbox.ts` — `*_INE_CODE` constants
30030/30016/30024/30027/30005/30038, each with recorded provenance), the jurisdiction docs
folder names (`docs/04-reference/jurisdictions/es/es-mc/` → `30005-alcantarilla`,
`30016-cartagena`, `30024-lorca`, `30027-molina-de-segura`, `30030-murcia`,
`30038-las-torres-de-cotillas`), and — for Murcia — the live OVC recording in
`tools/murcia-parcel-probe/__tests__/probe.test.ts` (cp 30 + cm 30 → `30030`, the founder's own
refcat). The dispatcher imports the constants from `@pryzm/site-parcel-data`; **no code literal
was retyped by hand**. `composeIneCode` (canonical, `murciaBbox.ts`) does the padding — cm is the
index within the province, so `30`+`30` composes to `30030`, never `3030`.

## RED-FIRST, verbatim

**RED (before the fix, after adding the pins)** — `npx vitest run __tests__/murciaSiteDispatch.test.ts`:

```
Tests  9 failed | 4 passed (13)
FAIL  … §L-12893 … > Churra + Catastro INE 30030 → the MURCIA path, never Molina research-pending card
AssertionError: expected false to be true   // urls.some(u => u.startsWith('/api/es/murcia-pgou'))
FAIL  … §MURCIA-ENVELOPE … > ROUTES to the Murcia municipal service — the link that was missing
AssertionError: expected undefined to be defined
```

(the 8 pre-existing reds of `lane-murcia-red.md`, plus the new Churra+INE pin failing on the
misroute; the new Molina-by-INE, parcel-less, and overlap-premise pins passed — bbox order
happens to satisfy them, which is exactly why the Churra pin is the discriminating test).

**GREEN (after the fix):**

```
murciaSiteDispatch.test.ts                 Tests  13 passed (13)        ← the 9 of record + 4 new §L-12893 pins
molina/lorca/alcantarilla/lasTorres/cartagena/esSiuEstimateGuard/catastroParcelProvider
                                           Test Files  7 passed (7) · Tests  33 passed (33)
server parcelZoningProxy (vitest.server.config.ts)
                                           Tests  13 passed (13)        ← incl. new §L-12893 cp/cm parser pin
final re-run after falsification restore (murcia + molina + esSiuEstimateGuard)
                                           Test Files  3 passed (3) · Tests  28 passed (28)
```

**Typecheck** — `npx tsc -p tsconfig.json --noEmit` (the editor's own `typecheck` config, root
tsc): **RC=0**, zero diagnostics.

## Falsification — the decider is what fixes it

In a scratch edit (sha256 of `siteDispatch.ts` recorded first:
`7d8acfb3708782bdb7b0e6f0d0fe3dd6acf98e1c2536fd1659a531f0020fde59`), the one decider line
`const ine = parcel !== null ? composeIneCode(…) : null` was replaced with `const ine = null` —
bbox order decides again. Result, verbatim:

```
FAIL  … §L-12893 … > Churra + Catastro INE 30030 → the MURCIA path, never Molina research-pending card
AssertionError: expected false to be true    (— /api/es/murcia-pgou never called: the Molina
                                                branch fires first in the overlap and returns)
Tests  1 failed | 3 passed | 9 skipped (13)
```

File then restored from the byte-copy; `sha256sum` re-read:
`7d8acfb3708782bdb7b0e6f0d0fe3dd6acf98e1c2536fd1659a531f0020fde59` — **byte-identical**.

## Behaviour changes beyond the headline (deliberate, stated)

- **Overlap-band land with a resolved parcel now routes by municipality of record** — Churra/El
  Puntal (Murcia land under Molina's loose box) get the Murcia PGOU path; genuine Molina land
  whose box also sits inside `MURCIA_BBOX` (e.g. Molina's own centre 38.0572, −1.2095, pinned)
  gets Molina's card by its own INE, not by chain luck.
- **A seventh municipality inside the loose union** (e.g. Santomera 30035) no longer gets the
  positionally-first municipal card; it falls to the estimated chokepoint whose
  registered-jurisdiction/SIU guards refuse honestly. Before, it silently got whichever
  registered box came first in the chain — same defect class as the founder's parcel.
- **The parcel-less click keeps the pre-INE chain order** (documented at the site). In the
  overlap bands that remains an ordering accident either way — with no cadastral identity there
  is nothing better to route from, and the research-pending refusals it lands on fabricate
  nothing.
- **One fewer OVC round trip on Murcia clicks:** the router's parcel resolve is threaded into
  `applyMurciaZoningThenFallback` as `prefetchedParcel` (`undefined` = legacy self-fetch,
  `null` = definitive miss moments ago).

## Files touched (complete)

- `apps/editor/src/ui/site/siteDispatch.ts` — §ES-MC-INE-ROUTER branch + router + helper;
  `applyMurciaZoningThenFallback` gains optional `prefetchedParcel`; imports.
- `apps/editor/src/ui/site/parcel/ParcelProvider.ts` — optional `catastroCp`/`catastroCm` on
  `ParcelFeature`.
- `apps/editor/src/ui/site/parcel/CatastroParcelProvider.ts` — parse + forward `cp`/`cm`.
- `server/jurisdiction/parcelZoningProxy.js` — `loine` cp/cm per candidate; forwarded on the
  chosen candidate's parcel payload.
- `apps/editor/__tests__/murciaSiteDispatch.test.ts` — stub carries the live-recorded cp/cm;
  new §L-12893 describe (4 pins: overlap premise both ways · Churra→Murcia by INE ·
  Molina-centre→Molina by INE, no Murcia fetch · parcel-less → pre-filter order).
- `server/__tests__/parcelZoningProxy.test.ts` — §L-12893 parser pin (cp/cm parsed; null when
  the `loine` block is absent).

**Not touched:** `packages/schemas/**` (frozen), `packages/site-parcel-data/**` (all needed
exports — `composeIneCode`, six `*_INE_CODE`s — already on the barrel), `countryAdapters/{fr,pt}`,
`packages/family-*`, `packages/file-format`, `apps/editor/src/ui/component/**` (held by the UCE
wave; re-checked `git status` before edits — every other modified row in the tree belongs to
concurrent lanes). The SIU guard chokepoint committed at `23890d56` is undisturbed: the router
funnels its unknown-INE and structural-failure tails through `applyEstimatedZoning`, the same
chokepoint every sibling uses.

## Left for the owner

- The ISSUE-LOG row L-12893 can move OPEN → closed once the orchestrator lands this (append-only
  edit deliberately left with the doc owner, per lane discipline).
- The CI-health finding from `lane-murcia-red.md` (deploys shipped over a red editor suite since
  08-04) is untouched by this lane and still deserves its own reading of the Actions history.
- The live proxy's cp/cm forwarding needs one production deploy before the founder's browser
  click benefits; until then the client receives no `cp`/`cm` and honestly falls back to the
  pre-filter order (the pre-fix behaviour, no worse).
