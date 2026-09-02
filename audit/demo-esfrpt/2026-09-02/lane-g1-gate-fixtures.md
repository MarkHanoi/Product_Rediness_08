# LANE G1 — never-overstate gate: recorded-fixture arms for the LIVE-RESOLVED routes

**Date:** 2026-09-02 · **Subject:** lane-b (graph-kernel-oss) Q1 — `check-envelope-never-overstates.ts`
walked only pack-declared zones; the live-resolved routes (Paris §PARIS-SIGN-OFF, Denmark plandata,
Madrid NZ-1) contributed ZERO solves · **Disposition:** three recorded-fixture arms added on the
NL-courtyard pattern (section 2b), each with vacuity guards + checker teeth; all four planted
falsifications went RED and restored sha-identical · **Commit:** none (orchestrator owns the commit).

## What was built

**Scope kept exactly:** `tools/ga-gate/check-envelope-never-overstates.ts` + a new fixture corpus
`tools/ga-gate/corpus/never-overstate/` (4 JSON files). `packages/**` untouched — every import the
arms need was ALREADY exported from `packages/site-parcel-data/src/index.ts` (the DK adapter surface
rides `export * from './countryAdapters/dk/index.js'` at index.ts:2328), so **no barrel additions are
owed to the orchestrator**.

The gate's `main()` became async (`resolveParisEnvelope` / `resolveMadridNZ1Ring` are async; both are
driven on a stub `fetchImpl` replaying the RECORDED body — the gate stays network-free and
deterministic). The tail follows the `check-collab-graph-integrity.ts` precedent
(`main().then(exit, …literal process.exit(2))` — the R5 meta-gate's literal-exit-2 match is kept).

### Arm 2c — §PARIS-LIVE-ROUTE (`corpus/never-overstate/paris-plu-19-DL-0002.json`)

Fixture = the `/api/paris/plu` body at the signed route's live-probed parcel (19-DL-0002, 19th arr.),
VERBATIM from the 2026-07-26 probe as recorded in `apps/editor/__tests__/parisSiteDispatch.test.ts`
(`PLU_BODY`/`ECM_RING` — the real 83.12 m² plub_ecm ring). Chain driven: `resolveParisEnvelope`
(recorded fetch) → `computeParisEnvelope` — the exact production pair `siteDispatch` runs.

- **Bound:** drawn ECM volume ≤ published `st_area_shape` × published `plub_hauteur` ceiling
  (83.122 m² × 25 m), with the 1 % tolerance `projectParisRingToEnu` states for its projection;
  height exact-bounded at 25 m. The bounds come from the fixture's separate `published` block
  (independently transcribed from the same probe) — NEVER from the solve itself, which is what makes
  the falsification meaningful.
- **Couronnement:** the same recorded inputs with `courCode:'X'` must keep the cited PARTIAL refusal
  (`couronnementRefusal` + `couronnement_UG324` on `missingRules`) and must never ADD volume over the
  straight prism.
- **No-ECM point:** the recorded body minus its ECM half must draw NOTHING (`ok:false`,
  `refusedComponent:'footprint'`) — the Paris overstate direction is drawing where ECM is absent.
- **Vacuity guards:** the resolve must yield ECM inputs; the base solve must produce a positive
  volume; the cour-X variant must actually walk the partial-refusal class — otherwise exit 2, not 0.
- **Checker teeth:** the pre-fix fabricated shape (emprise = whole 720 m² parcel × hauteur) is
  tampered onto the honest result and must be flagged by the same audit, or exit 2.

### Arm 2d — §DK-DENOMINATOR-LIVE (`dk-cph-noerrebro-ramme.json`, `dk-aarhus-midtby-ramme.json`)

Fixtures = the VERBATIM 2026-09-01 live keyless features (transcripts:
`audit/europe-site-intel/2026-08-31/impl/lane-dk-transcripts/2026-09-01-chain-executed-live.txt`,
mirrored from `packages/site-parcel-data/__tests__/dkCorrections.test.ts`), with the live DAWA parcel
areas (3,776 / 8,293 m²). BOTH live consumers of a bebygpct rule are driven:
the C58 record route (`mapPlandataToZoningRecord` → `computeBuildableEnvelope`, `rulePack:null`,
incl. the dispatcher's §L-620 storey-derived height for Aarhus) and the declarative GFA consumer
(`mapDkFeatureToRules` → `deriveDkGfaFromBebygpctRule`).

- **Nørrebro (af=4, parcel-scoped — the VALID multiply):** envelope solves with FAR 1.50 / height
  ≤ 24 m; `computeFarLimitedHeight().maxGFA` AND the GFA consumer's `gfaM2` must both stay ≤ the
  fixture's bebygpct × grundareal = **5,664 m²**. Terminal: `env ok, GFA 5664 m² ≤ ceiling 5664 m²`.
- **Aarhus (af=1, planning-area — the refusal MUST stay a refusal):** `plotRatioFAR` must stay null
  on the record; the GFA consumer must refuse `basis-planning-area`; **the tripwire** greps the
  serialised chain output (`{rec, env, solids, gfa}`) for the digits of the naive per-parcel product
  180 % × 8,293 = **14,927.4 m²** — it must appear NOWHERE. Terminal: `FAR withheld=true, GFA
  consumer REFUSED (basis-planning-area), naive '14927' absent=true`.
- **Tripwire teeth:** the pre-fix per-parcel multiply (`maxFAR 1.8 × 8293`) is run through
  `computeFarLimitedHeight` and its serialisation MUST contain `14927` — proving the grep can see the
  number it polices — or exit 2.

### Arm 2e — §MADRID-NZ1-LIVE (`madrid-nz1-manzana-0105104.json`)

Fixture = the representative PGOUM-97 layer-6 ArcGIS body in the live wire shape (outSR=4326
[lon,lat] rings, closing vertex repeated, `COEF_Z:'1,25'` String, `CODMANZANA:'0105104'`), verbatim
from `resolveMadridNZ1Ring.test.ts` and **honestly labelled representative-of-live** in
`_provenance` (sigma.madrid.es returned HTTP 500 through recon, so no byte-verbatim body exists in
the repo — same honesty discipline as the NL arm's labelled-synthetic courtyard). Chain driven:
`resolveMadridNZ1Ring` (recorded fetch) → equirect projection (θ=0, the dispatcher's frame) →
`computeBuildableEnvelope` with `ES_MADRID_NZ1_PACK` + `explicitAreaFootprint` — the exact
§MADRID-NZ1 route.

- **Bound:** the parcel is built to BITE the published ring (covers its left 60 % + a 10 m apron), so
  the clip provably ran: inset 905.7 m² < parcel 1,957.9 m² AND < ring 1,509.6 m², and must stay ≤
  parcel ∩ published ring (905.8 m², 1 % tolerance).
- **COEF_Z stays withheld:** the ring is the WHOLE claim (its use as edificabilidad is NOT authorised
  — `resolveMadridNZ1Ring.ts` header). ANY of `maxHeight_m` / `maxFAR` / `maxVolumeM3` non-null on
  the envelope, or ANY solid claiming volume (published ceiling **0 m³** — the honest render is a
  footprint slab, `claimsVolume:false`), is a finding.
- **Vacuity guards:** ring resolves ≥ 3 vertices; envelope solves; the clip must have bitten both
  ways or exit 2. **Checker teeth:** a fabricated height (20 m) tampered onto the envelope makes
  `envelopeToMassing` mint a volume-claiming prism — the audit must flag it or exit 2.

## Acceptance evidence (verbatim terminal lines, true process RCs)

**BEFORE** (pre-change tree, `npx tsx tools/ga-gate/check-envelope-never-overstates.ts`):

```
[never-overstate] corpus: 6 pack-bearing jurisdiction(s) · 182 zone-solve(s) walked · 138 solved ok · 44 refused (a refusal draws nothing and cannot overstate — counted, not skipped)
[never-overstate] OK: 0 overstatement(s) across 182 zone-solve(s) in 6 jurisdiction(s) + estimated-default + the planted self-test pack.
RC=0
```

**AFTER** (with the three arms):

```
[never-overstate] §PARIS-LIVE-ROUTE: recorded parcel 19-DL-0002 — base 83.1 m² × 25 m, cour-X partial refusal HELD, no-ECM drew nothing.
[never-overstate] §DK-DENOMINATOR-LIVE Nørrebro (af=4): env ok, GFA 5664 m² ≤ ceiling 5664 m².
[never-overstate] §DK-DENOMINATOR-LIVE Aarhus (af=1): FAR withheld=true, GFA consumer REFUSED (basis-planning-area), naive '14927' absent=true.
[never-overstate] §MADRID-NZ1-LIVE: recorded manzana 0105104 — clip 905.7 m² of ring 1509.6 m², COEF_Z "1,25" withheld=true, claimed volume 0 m³ required.
[never-overstate] corpus: 6 pack-bearing jurisdiction(s) · 189 zone-solve(s) walked · 143 solved ok · 46 refused (a refusal draws nothing and cannot overstate — counted, not skipped)
[never-overstate] OK: 0 overstatement(s) across 189 zone-solve(s) in 6 jurisdiction(s) + estimated-default + the recorded live-route arms (Paris · Denmark · Madrid NZ-1) + the planted self-test pack.
RC=0
```

**The solve count GREW: 182 → 189 walked (138 → 143 solved ok, 44 → 46 refused-and-counted).** The
+7 = Paris base + Paris cour-X + Paris no-ECM (refused) + DK Nørrebro env + DK Aarhus env + DK Aarhus
GFA refusal (counted) + Madrid NZ-1 clip.

## Falsification transcripts (plant → RED naming the excess → restore sha-identical)

Shipped shas: gate `2848bae2e262ee06d2bd6a1447c7c8994cd30837c02f2ece692acf2d7a70d440`; fixtures
`5ea0c8a2…` (paris) / `3d9a7d74…` (dk-cph) / `7379d789…` (dk-aarhus) / `511bf2bc…` (madrid).

1. **Paris** — scratch `published.heightCeilingM: 25 → 2.5` in the fixture → **RC=1**:
   `[volume] fr-75056-paris/live-route / 19-DL-0002/base — drawn ECM volume 2076.6 m³ exceeds the
   published footprint × published ceiling = 207.8 m³ (excess 1868.8 m³)` (+ the height finding, both
   for base AND cour-X). Restored → sha `5ea0c8a2…` byte-identical.
2. **DK Nørrebro** — scratch `published.gfaCeilingM2: 5664 → 566.4` → **RC=1**:
   `[far] … computed GFA 5664.0 m² exceeds the fixture's bebygpct × grundareal = 566.4 m² (excess
   5097.6 m²)` + the same from `deriveDkGfaFromBebygpctRule`. Restored → sha `3d9a7d74…` identical.
3. **DK Aarhus** — scratch the PRE-FIX defect itself: `properties.bebygpctaf: 1 → 4` (the "assume
   parcel" read) → **RC=1** with all three findings: FAR 1.8 rode the record; the refusal DEGRADED to
   a computed GFA; **the naive product surfaced and the tripwire caught it** (`the naive
   planning-area product (180 % × 8293 m² ≈ 14927…) surfaced in the serialised chain output`).
   Restored → sha `7379d789…` identical.
4. **Madrid** — scratch the gate's bound (`honestCeilingM2 * 0.5`) → **RC=1**:
   `[setback] es-28079-madrid/nz1-live-route / manzana-0105104 — explicit-ring clip granted 905.7 m²
   where parcel ∩ published ring is 452.9 m²`. Restored → gate sha `2848bae2…` identical.
5. **Blindness guard** (extra) — scratch-blinding `auditParisSolve` (always `[]`) → **RC=2**
   `UNPROVEN: Paris arm teeth: the pre-fix parcel×hauteur shape was not flagged — the arm cannot see
   the defect it polices`. Restored → sha identical. ("Cannot fail" aliases to UNPROVEN, never PASS.)

One deliberate cleanup (removing an unused `ParisPluProxyResponse` type import) was applied AFTER a
verified byte-identical restore; the final shipped gate sha above is post-cleanup and the gate was
re-run green on it (RC=0, 189 solves).

Root `npx tsc -p tsconfig.json --noEmit` → **RC=0** (see the return report; tools/ is outside the
root include set, so the gate's own types are proven by the tsx executions above).

## Remaining un-walked live-resolved routes, ranked by overstate risk

The dispatcher (`apps/editor/src/ui/site/siteDispatch.ts`) still resolves live data into drawn
envelopes on routes this gate walks only at the pack-zone level (section 1) or not at all:

1. **Barcelona** (`applyBcnZoningThenFallback`, :8094) — the deepest live chain (block-ring
   dissolve, alçada reguladora per clau, official street widths, 22@, cossos sortints). Pack zones
   are walked; the LIVE enrichment chain has zero recorded-fixture solves. Highest risk by volume of
   live arithmetic and by history (L-581/L-586 lived here).
2. **Córdoba family** (`applyCordobaZoningThenFallback` + traced + raster-classified + manual admin,
   :4206–:5133) — `CORDOBA_ENVELOPE_VERIFIED` signed; live zone → envelope with per-zone numbers.
3. **Murcia region** (`applyMurciaZoningThenFallback` / `applyMurciaRegionZoningByIne`, :6525/:7038)
   — the CONSTRUCTED street-width (ancho-de-calle) chain is an overstate-prone derivation with no
   national source (memory: spain-scaling).
4. **Valencia** (`applyValenciaZoningThenFallback`, :7418) — alineaciones route.
5. **CH Zürich** (`applyChZoningThenFallback`, :3992) — BZO catalogue route.
6. **ES rasant datum** (`geometry/facadeRasantDatum.ts`, L-584) — **assessed for arm 4 and deferred
   as NOT cheap**: it needs a recorded terrain-profile + façade-line fixture pair, and no recorded
   live pair exists in the repo's tests; its consumers are the BCN height chains (item 1), so it
   belongs inside a future Barcelona live-chain arm rather than as a freestanding one.
7. **Sevilla / Zaragoza / Telde / El Sauzal / Balears / Cartagena / Alcantarilla / AMB towns**
   (:5135–:6928) — gated by `*_ENVELOPE_VERIFIED` flags, most still refusal-shipping (cannot
   overstate today); risk materialises the day a flag flips, at which point the fixture-arm pattern
   here is the template.
8. **NL goothoogte / overlay caveats** — the envelope side is walked (2b); the caveat-carry halves
   (§NL-GOOTHOOGTE-CARRY, §NL-OVERLAY-CARRY) are pinned by tests, not by this gate.

## Residuals (named)

- The Madrid fixture is representative-of-live (labelled in `_provenance`), not a byte capture —
  replace it with a byte-verbatim body the day sigma.madrid.es answers a recorded probe.
- The Paris arm varies ONE field (`courCode:'X'`) off the recorded body to walk the crown-refusal
  class; a byte-recorded cour=X parcel body would make that variant fully recorded too.
- The gate header's "PURE READ" now includes reading its own in-repo corpus dir — stated in the
  header; still no network, still deterministic.
