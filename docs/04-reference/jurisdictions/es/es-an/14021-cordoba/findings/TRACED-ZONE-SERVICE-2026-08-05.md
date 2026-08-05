# Córdoba — the TRACED-ZONE service: infrastructure, not more tracing (2026-08-05)

Yesterday's session (`SESSION-SUMMARY-2026-08-04.md`, `END-TO-END-PROOF-2026-08-04.md`) proved that
one hand-traced zone polygon (`PAS2_TRACED_UTM`, traced off `CUS20W.jpg`, east of the pilot bbox)
computes a real buildable envelope when fed directly into `computeBuildableEnvelope` inside a unit
test. That polygon existed **only** inside `cordobaProofOfConcept.test.ts` — there was no live path
from "a traced zone polygon" to the actual dispatcher. This note records the infrastructure built to
close that gap: a checked-in geometry store, a pure point-lookup resolver, and a dispatcher branch,
all gated behind a brand-new, independently-owned, default-`false` honesty flag. **No further sheets
were traced this session** — scaling the store is explicitly a separate, later task.

## What was built

| Piece | File |
|---|---|
| Geometry store (seed: PAS-2) | `packages/site-parcel-data/src/providers/data/cordobaTracedZones.json` |
| Pure point-lookup resolver | `packages/site-parcel-data/src/providers/resolveCordobaTracedZone.ts` |
| Its own honesty gate | `CORDOBA_TRACED_ZONES_VERIFIED` (in the resolver file above), **default `false`** |
| Package barrel exports | `packages/site-parcel-data/src/index.ts` |
| Dispatcher wiring | `apps/editor/src/ui/site/siteDispatch.ts` — new `applyCordobaTracedZoneThenFallback`, called from a new `if` branch in `applyZoning` |
| Unit tests (resolver) | `packages/site-parcel-data/__tests__/resolveCordobaTracedZone.test.ts` |
| Dispatch tests, gate closed | `apps/editor/__tests__/cordobaTracedZoneSiteDispatch.test.ts` |
| Dispatch tests, gate mocked open | `apps/editor/__tests__/cordobaTracedZoneVerifiedSiteDispatch.test.ts` |

## The data-file schema — how to add a newly-traced polygon

`cordobaTracedZones.json` is a flat JSON array of records (mirrors the offline shapefile-extract
pattern already used for Telde/El Sauzal, `providers/data/teldeEdif.json` /
`providers/data/elSauzalZuso.json`, rather than inventing a new convention). Each record:

```json
{
    "zoneCode": "PAS-2",
    "sourceSheet": "CUS20W.jpg",
    "tracedDate": "2026-08-04",
    "provenance": "PRYZM's OWN hand-traced reading of a published … sheet … NOT authoritative municipal geometry. …",
    "ring": [
        [-4.751610745611372, 37.899655755369544],
        [-4.751624200781803, 37.900223311739985],
        [-4.751387157091413, 37.90029893613047],
        [-4.750772795438035, 37.90029005443858],
        [-4.750747123834404, 37.89968663162375]
    ]
}
```

- **`zoneCode`** — MUST be a code already registered in `CORDOBA_PGOU2001_ZONE_CODES`
  (`esCordobaPGOU2001.ts`): `PAS-1/2/3`, `OA-1/2`, `UAD-1/2/3`, `CTP-1`, `PTC` — **never `MC-1..4`**.
  MC has its own, separate, unresolved footprint blocker (`CORDOBA_MC_FONDO_UNRESOLVED_RING`) that
  no amount of zone-polygon tracing closes — see that constant's own header. A future tracing pass
  that identifies an MC parcel should still record it (for future use), but the resolver test suite
  asserts every seeded code is in the closed vocabulary, so an MC entry there today would be a
  self-inconsistent fixture, not a capability.
- **`sourceSheet`** — the exact CUS filename the trace was read from, e.g. `CUS20W.jpg`.
- **`tracedDate`** — ISO date of the TRACE, not of the file edit.
- **`provenance`** — a full sentence, in the house style, that (a) says this is PRYZM's own
  machine-traced-unverified reading, never a COACo/GMU publication, (b) names the derivation method
  (visual pixel→UTM georeferencing, RGB legend-swatch sampling), and (c) points at the findings doc
  with the full derivation. There is no ordinance article to cite here — the honesty is about
  **provenance**, not legal citation, and every consumer of a traced record surfaces this string
  verbatim next to any number it feeds.
- **`ring`** — a single OUTER ring (no holes modelled — none of the CUS parcels traced so far have
  interior voids), `[lon, lat]` pairs, **WGS84 (EPSG:4326)**, not necessarily closed. WGS84 was
  chosen over the UTM(EPSG:25830) the sheets are actually read in because this file is meant to be
  directly human/tool-readable (openable in any GeoJSON viewer without a projection step) and the
  resolver's point-in-polygon test at this polygon size has no measurable precision cost in degrees
  (see `resolveCordobaTracedZone.ts`'s `pointInRingEvenOdd` comment for the specific argument — this
  is deliberately NOT the same discipline as `geometry/nativeCrs.ts`'s §NATIVE-CRS-MEASUREMENT rule,
  which governs *distance* measurement, not point containment). Convert a UTM trace to WGS84 with
  `nativeToWgs84('EPSG:25830', e, n)` from `packages/site-parcel-data/src/geometry/nativeCrs.ts` —
  that is exactly how the seed record's five vertices were produced from `PAS2_TRACED_UTM`.

To add a polygon: append a new object to the JSON array, run
`cd packages/site-parcel-data && npx vitest run __tests__/resolveCordobaTracedZone.test.ts` (the
"every seeded zoneCode belongs to the closed vocabulary" test will fail loudly on a bad code), then
run the full package suite.

## The resolver

`resolveCordobaTracedZone(point, deps?)` — async (trivially resolving; no I/O actually happens),
never throws, three honesty properties documented in the file's own header (mirrors
`resolveCordobaSubzone` / `resolveTeldeZone`):

1. Never throws — every failure is a typed refusal (`no-point`, `out-of-cordoba`,
   `data-unavailable`, `no-traced-zone-here`).
2. Does not decide to render — it resolves a zone code + ring only; the dispatcher decides.
3. Never silently widens a match — a plain even-odd point-in-polygon test against the exact traced
   ring, no buffering.

At today's scale (one polygon) the core (`resolveCordobaTracedZoneFromRecords`) is a plain linear
scan over every record. That is explicitly fine — the file says so — until the store grows into the
"dozens to low-hundreds" range this task anticipated; a real spatial index (an R-tree keyed on each
ring's bbox, checked before the exact even-odd test) is named as the should-do once that happens, not
built pre-emptively.

## The gate — `CORDOBA_TRACED_ZONES_VERIFIED`, independent of `CORDOBA_ENVELOPE_VERIFIED`

This is the constraint the task called out to read twice, and it was honored exactly:
`CORDOBA_TRACED_ZONES_VERIFIED` (in `resolveCordobaTracedZone.ts`) is a **separate, independently
owned** flag, default `false`. It does **not** read, alias, or get read by
`CORDOBA_ENVELOPE_VERIFIED` (`esCordobaZoneClassification.ts`, signed `true` 2026-08-03). The two
flags certify two different claims:

- `CORDOBA_ENVELOPE_VERIFIED` — the OCR transcription of the PGOU-2001's numeric ordinance tables
  (setbacks, FAR, coverage, height) matches the source PDFs.
- `CORDOBA_TRACED_ZONES_VERIFIED` — a hand-traced GEOMETRY reading of a scanned map sheet is
  trustworthy. A different skill, a different failure mode — `END-TO-END-PROOF-2026-08-04.md`'s own
  §Stage 3 records a real near-miss on the very polygon seeded here: the first cluster picked by eye
  was the wrong zone family (Manzana Cerrada, salmon) instead of the right one (Plurifamiliar
  Aislada, gold), caught only by RGB-sampling the legend swatch.

## Dispatcher wiring — confirmed a no-op on production behaviour today

`applyCordobaTracedZoneThenFallback` (new function, `siteDispatch.ts`) is called from a new branch in
`applyZoning`, positioned right after the existing pilot branch:

```ts
if (qLat != null && qLon != null && isInCordoba(qLat, qLon)) {
    void applyCordobaZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
    return;
}
if (qLat != null && qLon != null && !isInCordoba(qLat, qLon) && isInCordobaMunicipality(qLat, qLon)) {
    void applyCordobaTracedZoneThenFallback(ctx, boundary, qLat, qLon, estimated);
    return;
}
```

i.e. condition (a) from the brief — "in Córdoba but outside the pilot's live coverage" — is
`isInCordobaMunicipality(lat, lon) && !isInCordoba(lat, lon)`. While `CORDOBA_TRACED_ZONES_VERIFIED`
is `false`, the new function reads the gate first and, if closed, calls `applyEstimatedZoning`
directly — **exactly** the function that would have run had this branch never been added (Córdoba
municipality is already a registered jurisdiction in `registry.ts`, so the pre-existing §L-663 guard
inside `applyEstimatedZoning` converts the point into the generic `estimateSuppressedRefusal` cited
card, never a fabricated number). This was verified as a real property, not just argued: with the
gate closed, a point matching the seeded PAS-2 polygon still correctly refuses
(`cordobaTracedZoneSiteDispatch.test.ts`), and a companion file with the gate mocked open for that
file's module graph only (never the committed constant — see that file's own header for why it is
split out, and the Vitest module-hoisting pitfall that made a single shared file unsafe) proves the
compute branch renders a real `status: 'ok'` PAS-2 envelope end-to-end
(`cordobaTracedZoneVerifiedSiteDispatch.test.ts`).

## Test results

- `cd packages/site-parcel-data && npx vitest run` → **147 test files, 2778 tests, all passed** (146
  files / 2766 tests pre-existing + 1 new file / 12 new tests, zero regressions).
- `cd apps/editor && npx vitest run __tests__/cordobaSiteDispatch.test.ts` → 18/19 pass; the one
  failure (`expected … to have a length of 13 but got 14`) is **pre-existing and unrelated** — `PTC`
  was registered as a 14th zone code on 2026-08-04 and this one assertion was never updated to match;
  confirmed by re-running the identical test against `git stash` (fails identically with none of this
  session's changes applied).
- `cd apps/editor && npx vitest run __tests__/cordobaTracedZoneSiteDispatch.test.ts
  __tests__/cordobaTracedZoneVerifiedSiteDispatch.test.ts` → **6 tests, all passed.**

## What still needs a human (named, not built)

1. **The `CORDOBA_TRACED_ZONES_VERIFIED` sign-off itself.** A founder/authorized-signer decision,
   exactly the same act (and the same L-449 discipline) as `CORDOBA_ENVELOPE_VERIFIED`'s 2026-08-03
   sign-off — but a SEPARATE certification, because it certifies a different claim (see above). It
   must never be flipped as a side effect of "finishing" a feature.
2. **A QA methodology for verifying traced polygons before that flip.** Not built — only named, per
   the brief. The minimum bar implied by `END-TO-END-PROOF-2026-08-04.md`'s own two named failure
   modes: an independent human re-derivation of (a) every polygon's corner/grid-tick coordinates
   (catching an extrapolated, unverified corner like PAS-2's own top-edge northing) and (b) every
   polygon's legend-swatch RGB match against its claimed zone family (catching the exact
   Manzana-Cerrada-vs-Plurifamiliar-Aislada near-miss that trace itself required a correction for) —
   for every record in the store, not a spot check, and not a "does this look plausible on the map"
   visual pass. This QA pass, its pass/fail bar, and who is qualified to run it are all open.
3. **Scaling the store past one polygon.** Explicitly out of scope for this task (per the brief) and
   for this note — a citywide tracing pass is separate, later work. When it happens, revisit the
   linear-scan note in `resolveCordobaTracedZoneFromRecords`'s header before the store reaches the
   thousands-of-polygons range.

## Ciudad Jardín pass (2026-08-05) — location CONFIRMED, no polygon added

The founder asked specifically for a Ciudad Jardín parcel (a real, named residential district
east/north of the historic centre). This pass **positively located the district** but ends with
**zero new records in `cordobaTracedZones.json`** — a deliberate refusal, not an oversight. Both
halves are recorded below because the location work is real, reusable groundwork.

### Location — confirmed, not guessed

The CUS raster sheets themselves carry **no printed neighbourhood-name labels inside built urban
fabric** — every text label found on 8+ sampled sheets (`El Patriarca`, `El Tablero`, `Llanos del
Pretorio`, `El Majano`, `Corva del Lagartijo`) is a legacy rural/paraje toponym sitting in
undeveloped (SNU/green) land, never a barrio name over dense colour-coded fabric. So the premise in
this task's own brief — "CUS sheets carry neighbourhood labels, as seen in review of CUS39/41" —
did **not** hold up under inspection; that claim should not be repeated uncritically next time.

What *did* work: the companion **AR (alineaciones y rasantes) sheet series** (`corpus/Cordoba -
Planos Alineaminetos y rasantes/ar##.pdf`, same 1–49 grid as the CUS series, rendered via PyMuPDF at
6× zoom for legible street-name text) prints real street names. `ar11.pdf` and `ar19.pdf` both show
**"Calle Brillante" / "Avenida del Brillante"** explicitly, cross-corroborated by real, independently
verifiable landmarks on the same sheets: **Hospital San Juan de Dios**, **Convento de las
Carmelitas**, **Colegio Público "El Brillante" Preescolar**, **Camping Municipal "El Brillante"**,
and the water utility **E.M.A.C.S.A.** "Villa Azul" plant. Avenida del Brillante is the defining
spine of Ciudad Jardín in real Córdoba geography (runs north from the historic-centre edge up into
the Sierra foothills) — this is a positive, multi-source identification, not an inference from
position alone. **CUS11W.jpg is the core Ciudad Jardín sheet**; its immediate southward neighbour
**CUS19W.jpg** (confirmed adjacent: CUS11's bottom edge E342841–344641/N4196801 = CUS19's top edge)
carries the corridor's southern continuation down toward the historic centre.

Both sheets' corners were independently read to the CUS41W standard (4 corners plus 5+ interior
200 m grid-ticks on each axis, cross-corroborated to a consistent ~0.99–1.00 m/px scale on both X
and Y — done via a Python/PIL crop-and-zoom script rather than by-eye estimation this time, which
also caught and corrected an initial misread of CUS11W's NE/SE corner eastings, 342841 misread where
344641 was correct — exactly the blur-driven digit-confusion failure mode this file's own §schema
section warns about, caught here by the required interior-tick cross-check, not skipped).

### Why no polygon was added — the zone doesn't clear the pack

RGB legend-swatch sampling (pixel-exact, not eyeballed — swatch colours read directly off CUS11W's
own legend: `Unifamiliar Aislada` (126,207,250), `Unifamiliar Adosada` (55,160,228), `Manzana
Cerrada` (239,148,119), `Ordenación Abierta` (203,51,28), `Plurifamiliar Aislada` (246,164,20)) shows
**CUS11W is essentially 100% `Unifamiliar Aislada` (UAS)** — matching Ciudad Jardín's known character
as a detached/semi-detached villa district. But `esCordobaPGOU2001.ts`'s own header documents UAS as
a **dead link — never registered in `CORDOBA_PGOU2001_ZONE_CODES`**, functionally the same
structural blocker as `MC` (which this task explicitly said to avoid). A scan for `UAD` (Unifamiliar
Adosada, which IS packed) at legend-tight tolerance found zero connected components >300 px anywhere
in CUS11W or CUS12W; loosening the tolerance only picked up anti-aliased UAS-edge noise scattered
across the whole sheet, not a real UAD region.

CUS19W (the confirmed southward continuation of the same corridor) does carry real `PAS`
(Plurifamiliar Aislada, packed) polygons, RGB-confirmed — but every one found there is an
**already-built, multi-building city block** (shoelace-measured at 14,700 m² and 47,600 m² for the
two candidates inspected), not a single buildable parcel; CUS20W's original PAS-2 seed only worked
because it happened to be a clean, undeveloped, un-subdivided lot. Attempting to trace individual
building footprints inside those blocks hit a hard source-resolution wall — CUS19W is ~1867 px for
an 1800 m sheet width (≈1 m/px), and at that resolution the interior parcel-subdivision lines
dissolve into unreadable noise under 10×+ zoom (confirmed by crop-and-inspect, not assumed).

**Net result:** Ciudad Jardín's location is now confirmed and documented (CUS11W core +
CUS19W's northern edge, both control-point-georeferenced above), but no compliant single-parcel
polygon was found there this session — the villa core is on an unregistered zone code, and the
nearest packed-zone extension is built out at the wrong scale for this raster's resolution. Per the
brief's own explicit standard, a wrongly-scoped or wrongly-scaled trace presented as "Ciudad Jardín"
would be worse than nothing, so `cordobaTracedZones.json` is **unchanged** this session — still the
single PAS-2 seed record from 2026-08-04, `CORDOBA_TRACED_ZONES_VERIFIED` still `false`. Test suites
were re-run to confirm the no-op: `packages/site-parcel-data` 147 files / 2786 tests pass;
`apps/editor`'s two traced-zone dispatch suites 6/6 pass — both unchanged, as expected, since no
production or data file was touched.

**What would unblock this, named for whoever picks it up next:**

1. **Pack UAS ordinance numbers.** The single highest-leverage fix — Ciudad Jardín's actual zoning
   family finally gets real setback/height/FAR numbers, the same way `PTC` was closed on 2026-08-04.
   Until then, Ciudad Jardín cannot compute a real envelope no matter how well it's traced.
2. **Search further along the Brillante corridor for a genuinely vacant PAS/OA/UAD parcel** —
   CUS11W/CUS19W were the only two sheets inspected this pass; the corridor continues further north
   (uphill, per `ar11.pdf`'s "PAM B-1", hospital/convent grounds — possibly more vacant land there)
   and there may be an undeveloped lot elsewhere along it that wasn't checked.
3. **A higher-resolution source scan**, if one exists, would unblock building-level tracing inside
   the already-built PAS blocks on CUS19W without needing to find vacant land at all.

## 2026-08-05 (second pass) — item 1 CLOSED (UAS packed); item 2 attempted, still blocked

This pass picked up directly where the note above left off, in two independent parts.

### Part 1 — UAS-1…UAS-6 PACKED (the item this file's own previous section named as the unblock)

Art. 13.10 (Ordenanza de la Zona de Vivienda Unifamiliar Aislada, six subzones) was independently
re-verified against the source PDF — **not merely re-quoted from this file's own prior claims** —
via `pdftotext -layout` against `TomoIIB_TR_A4_Revisado_Parte2.pdf` (lines 1354–1522 in the
extracted text: Art. 13.10.1 "Delimitación y subzonificación" through 13.10.5). Unlike `O_PAS2` /
`O_OA1` / `O_CTP1` / `O_MC`, this document has a CLEAN, born-digital text layer for this article — no
raster-render fallback was needed. Every value matched the previously-recorded table digit-for-digit,
zero discrepancies: edificabilidad 0,40→0,18 (Art. 13.10.2.1), parcela mínima 600→1.700 m²
(13.10.2.2.a), fachada mínima 16→25 m (13.10.2.2.b), ocupación 40 %→18 % (13.10.2.3), retranqueo
frontal 6 m / lindero privado 3 m for ALL six subzones (13.10.3.1/.2), altura PB+1 / 7 m with a 9,75 m
cumbrera ático allowance (13.10.3.3), uso dominante Residencial Unifamiliar + compatible industria
1ª/terciario/equipamiento/aparcamientos (13.10.4).

All six subzones are now packed in `esCordobaPGOU2001.ts` (`UAS-1`…`UAS-6`, plain `setbacks`, no
`geometricRule` — Art. 13.10 states no *profundidad edificable* to clip) and added to
`CORDOBA_PGOU2001_ZONE_CODES` (now 20 codes, up from 14). This does **not** change live-COACo
dispatch behaviour for the one UAS pilot parcel — the calificación still names only the family, never
a subzone suffix, so `cordobaZoneRefusalFor`/`cordobaNoRulePackRefusal` still refuse it, now via a
renamed `cordobaUasSubzoneUnbindableRefusal` (`regime-undetermined`, the same shape as
`cordobaIndustrialUnbindableRefusal`, replacing the old `cordobaUasChapterUnobtainableRefusal`'s now-
false "document unobtainable" framing). What it DOES change is that the traced-zone path
(`resolveCordobaTracedZone.ts`) can now resolve a `"UAS-n"` polygon to a real envelope, once
`CORDOBA_TRACED_ZONES_VERIFIED` is separately signed (it is not, as of this writing). Full test
suite: `cd packages/site-parcel-data && npx vitest run` → **147 files / 2803 tests, all passed**
(146/2786 pre-existing + this session's additions, zero regressions). `apps/editor`'s three Córdoba
dispatch suites (`cordobaSiteDispatch.test.ts`, `cordobaTracedZoneSiteDispatch.test.ts`,
`cordobaTracedZoneVerifiedSiteDispatch.test.ts`) → 25/25 pass, including the previously-noted
pre-existing `toHaveLength(13)` mismatch, now corrected to 20.

### Part 2 — a genuinely vacant Ciudad Jardín UAS parcel: STILL NOT FOUND, and a real methodological gain

With UAS now packed, this session re-inspected CUS11W (the confirmed Ciudad Jardín core) and, per
this file's own suggestion, CUS12W (its unexplored western neighbour) directly as raster images
rather than by RGB/connected-component script alone.

**A genuinely new, useful fact**: the plain numeral printed directly on each block in the CUS legend
(`Nº /letra: código subzona`) IS the ordinance subzone digit for whatever colour family that block
carries — confirmed by reading the legend text itself on both CUS11W and CUS12W. So a UAS block
labelled "3" on the sheet is directly `UAS-3`, no RGB-swatch inference needed to get the DIGIT (RGB
sampling is still needed to confirm the FAMILY colour, per the near-miss this file's own §Stage 3
already recorded). This is real, reusable groundwork for the next tracing pass: it removes one whole
axis of misread risk.

**The parcel-scale finding is unchanged, though, and this pass corroborates the prior one rather than
reversing it.** Both CUS11W (the Brillante corridor core, subzone "3" over most of the sheet) and
CUS12W (subzones "1"/"2"/"3"/"5" across its western UAS fabric) were inspected at 3–6× crop zoom
across multiple regions of each sheet (not a single spot-check). In every region inspected, the UAS
fabric is DENSELY BUILT — every parcel polygon visible at this ~1 m/px scale already carries a small
building-footprint outline inside it. No blank (footprint-free) single parcel was found in any
inspected region of either sheet. This is consistent with Ciudad Jardín's real character (a mature,
fully-developed early-20th-century garden suburb) and with the prior session's own conclusion — it is
not a new negative result, but an independent corroboration of it via a different method (direct
visual inspection vs. scripted RGB/connected-component scanning).

**Net result**: `cordobaTracedZones.json` is UNCHANGED this pass too — still the single PAS-2 seed
record, `CORDOBA_TRACED_ZONES_VERIFIED` still `false`. Per the brief's own standard, forcing a trace
onto a built parcel (or an unconfirmed blank patch) would be worse than nothing, so none was added.
Test suites were re-run to confirm the no-op: `packages/site-parcel-data` 147/2803 pass (as above,
driven entirely by the UAS pack + refusal-vocabulary changes, none of them touching the traced-zone
data file or resolver); `resolveCordobaTracedZone.test.ts` specifically: 12/12 pass, unchanged.

**What would unblock Part 2 next, named for whoever picks it up after this:**
1. **A genuinely higher-resolution source** for the CUS series (or an equivalent cadastral layer) —
   the ~1 m/px scan resolution is the binding constraint on BOTH sheets inspected so far, not the
   search effort. Two independent passes (script-driven and visual) have now hit the same wall.
2. **Search sheets this pass did not open** — only CUS11W and CUS12W were inspected (CUS19W was
   re-confirmed, not re-scanned, from the prior pass's own record). The Brillante corridor continues
   north past CUS11W's top edge, and CUS12W's own western/southern extents were not exhaustively
   covered pixel-by-pixel — a next pass could scan those tiles specifically for a footprint-free
   parcel using the confirmed on-sheet-digit method above to skip the RGB-only disambiguation step.
3. **Accept a non-Ciudad-Jardín UAS location.** The task that motivated tracing Ciudad Jardín
   specifically was demonstrating the newly-packed UAS ordinance on a recognisable district; nothing
   about `CORDOBA_PGOU2001_ZONE_CODES` or `resolveCordobaTracedZone.ts` requires the FIRST UAS trace
   to be there. A vacant UAS parcel anywhere in Córdoba, on any traced CUS sheet, would exercise the
   same code path.

## 2026-08-05 (third pass) — CUS20W_v2.png tested and REJECTED as a source; not traced

The founder supplied a new file, `corpus/Calificacion, usos y sistemas_UPGRADE/CUS20W_v2.png`,
described as a "confirmed real (not AI-upscaled)" upgrade of `CUS20W.jpg` — the exact sheet the
existing `PAS-2` seed was traced from. This pass tested, rather than assumed, whether it actually
carries more usable boundary detail. **Verdict: worse, not better — not traced, nothing added.**

**Pixel dimensions, checked directly (`PIL.Image.size`):**

| File | Size |
|---|---|
| `CUS20W_v2.png` | **1172 × 896** |
| `CUS20W.jpg` (the original, same sheet) | 1879 × 1436 |
| `CUS41W.jpg` (best-established control points) | 1882 × 1443 |

The new file is smaller than **both** existing references it was meant to upgrade — not just
smaller than CUS41W (as the task brief already flagged), but smaller than the very CUS20W.jpg it
is a "v2" of. The width/height ratio between the two CUS20W versions is uniform (0.6237 / 0.6240) —
strong evidence `CUS20W_v2.png` is a downscaled re-render of the same source raster (bigger file
size only because it's an uncompressed RGBA PNG vs. a compressed JPEG), not an independent rescan
at higher fidelity.

**Direct visual test, not just dimension arithmetic.** The same real-world region (the PAS-2
cluster's block, pixel box (1250,400)-(1650,750) in CUS20W.jpg) was cropped from both files, each
upscaled with Lanczos resampling to the identical 1200×1050 output size, for a true side-by-side at
equal viewing scale (crops saved to the session scratchpad, not committed). Result:

- **Original CUS20W.jpg crop**: the "2" zone digits inside every parcel block are crisp, unambiguous
  single characters. Interior parcel-subdivision lines within the residential blocks (the fine
  building-footprint tick marks) are faint but individually resolvable on close inspection. The `S`
  and `E` legend letters are clean.
- **CUS20W_v2.png crop (same area, same output scale)**: the same digits render visibly blurred and
  in places genuinely misreadable — a "2" is ambiguous with "Z" or "7", strokes have softened,
  anti-aliasing has smeared. The interior subdivision lines inside blocks are less distinct, not
  more. Nothing sharper, higher-contrast, or newly legible was found anywhere in the compared crop.
  This is a straight image-quality regression, not just "different rendering" — it is the same
  underlying raster resampled down and back up, losing information at every step.

No smaller/finer parcel was attempted from `CUS20W_v2.png` as a result — tracing from a strictly
lower-resolution copy of a sheet already traced at higher resolution would not "stress-test finer
detail," it would introduce more digitization error than the existing PAS-2 seed carries, for zero
gain. Per this file's own standing rule (a wrongly-scoped or wrongly-scaled trace is worse than
none), this is a clean refusal, not a stalled attempt.

`cordobaTracedZones.json` is **unchanged** — still the single PAS-2 seed record.
`CORDOBA_TRACED_ZONES_VERIFIED` is **unchanged**, still `false`. No code or data file was touched
this pass, so no test suite was re-run (nothing to regress).

**What would actually move this forward:** the founder's premise that a genuinely higher-resolution
rescan exists is still worth pursuing — but whatever produced `CUS20W_v2.png` was evidently a
resize/re-export of the same low-resolution scan already in the corpus, not a new higher-DPI capture
of the physical sheet. If a truly higher-resolution source (e.g., a fresh scan at higher DPI, or a
vector/GIS-native calificación layer instead of a raster) becomes available, it should be dimension-
checked (`PIL.Image.size`) **and** visually crop-compared against the existing baseline — exactly the
two-step test this pass ran — before any tracing time is spent on it.
