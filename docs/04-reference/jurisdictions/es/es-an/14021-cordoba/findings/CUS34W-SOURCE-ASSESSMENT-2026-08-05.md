# CUS34W_v2 — Source Assessment, 2026-08-05

> **Task type:** verification/assessment only. No code, rule pack, or `cordobaTracedZones.json`
> record was touched or added. Files inspected:
> `corpus/Calificacion, usos y sistemas_UPGRADE/CUS34W_v2.jpg` and `CUS34W_v2.png`.

## Executive summary

**CUS34W_v2 is a genuine PGOU-2001 CUS sheet 34 (Texto Refundido, Oct. 2002) — but it is a 4.0×
pixel-upscale of the SAME raster PRYZM already holds** (`corpus/Calificacion, usos y
sistemas/CUS34W.jpg`, 1849×1441 px), not a new higher-fidelity scan. A direct equal-scale crop
comparison shows **identical geometry, softer/blurrier line edges, and no new legible detail** in
the v2 files. Independently, and more decisively: **sheet 34 is one of the six sheets COACo's own
`coaco:hojas_cus` layer names as already vectorised into the live `coaco:ordenanzas` WFS**
(`CUS25W, CUS26W, CUS34W, CUS41W, CUS45W, CUS46W` — `findings/MACHINE-READABLE-SOURCE-SEARCH-
2026-08-02.md` line 192). Even a genuinely higher-resolution rescan of this sheet would add nothing
PRYZM doesn't already have from a stronger source (a published vector layer outranks any hand-trace
of a raster, per `ADR-0283`/`ADR-0284`). **Recommendation: (A) ignore this source.** This mirrors,
almost exactly, the `CUS20W_v2.png` rejection recorded the same day in `TRACED-ZONE-SERVICE-
2026-08-05.md`'s third pass — same "confirmed real, not AI-upscaled" framing, same measured
uniform-ratio-downscale signature, same verdict.

---

## 1. Source inventory

**Files, checked directly (`PIL.Image.size`, `os.path.getsize`):**

| File | Pixel size | Bytes | Format |
|---|---:|---:|---|
| `CUS34W_v2.jpg` | 7396 × 5764 | 16,484,010 | JPEG |
| `CUS34W_v2.png` | 7396 × 5764 | 55,729,288 | PNG (lossless container) |
| `corpus/Calificacion, usos y sistemas/CUS34W.jpg` (existing, already in corpus, byte-identical copy also at `corpus/cus/CUS34W.jpg`) | 1849 × 1441 | 423,880 | JPEG |

**Scale ratio: exactly 4.0000× in both width and height** (`7396/1849 = 4.0`, `5764/1441 = 4.0`).
An organic higher-DPI rescan of a physical sheet does not produce an exact integer ratio to an
existing digital file — this is the signature of a software upscale (e.g. Lanczos/bicubic ×4) of
the already-held raster, not an independent capture.

**Title block, read directly off the sheet** (bottom-right panel, both files, legible at full
resolution):

```
CORDOBA                                    2001
PLAN GENERAL DE ORDENACION
ESTUDIO DE IMPACTO AMBIENTAL
TEXTO REFUNDIDO
CALIFICACION, USOS Y SISTEMAS                34
ESCALA 1:5000              OCTUBRE 2002       Nº ORDEN
GERENCIA DE URBANISMO AYUNTAMIENTO DE CORDOBA   JOSE SEGURA Y ASOCIADOS
```

**Sheet-index grid** (also in the same panel) shows the 1–49 sheet layout with cell **"34"**
boxed/highlighted, directly below cell "26" in the same column, and adjacent to 33/35 — consistent
with the known 49-sheet grid geometry already documented in `corpus/MANIFEST.md` and
`CORPUS-REVIEW-2026-08-04-PM.md`.

**Coordinate grid** — UTM easting tick labels legible along the bottom map edge:
`344200 · 344400 · 344600 · 344641` (EPSG:25830, consistent with Córdoba's known UTM footprint,
same convention as CUS41W's previously-read `342841/344041` corner labels in
`GEOREFERENCING-FEASIBILITY-2026-08-04.md`).

**Verdict on §1: this is genuinely CUS sheet 34-West of the PGOU-2001**, same publisher, same
authorship (Gerencia de Urbanismo / José Segura y Asociados), same series as the other 48 sheets
already held. Not a different or substitute document.

## 2. Document type

**Raster image, both files — jpg and png.** Neither carries embedded vector geometry, text layer,
or CAD structure; both are pixel grids. This is the same conclusion already established for the
whole CUS series in `CORPUS-REVIEW-2026-08-04-PM.md` and `GEOREFERENCING-FEASIBILITY-2026-08-04.md`
(§Check 1). Nothing about this upgrade changes that: **it is still not machine-readable geometry**,
upscaling a raster does not manufacture vector data.

## 3. Content — legible vs illegible

Legible on the sheet (both files, same content, confirmed by direct crop inspection):

- Zone-family colour fields (e.g. an orange-salmon block group labelled numeral "2" in the NW
  corner; a "S"/"SG" labelled parcel with an arrow-annotated "PR.RG" callout, i.e. a Sistema General
  / public-system designation, not a private buildable zone).
- Full legend fragment: `Pluritamiliar Aislada` (orange/gold swatch), `Comercial` (grey),
  `Industrial` (light grey) — same colour-coded legend format as every other CUS sheet already
  catalogued.
- Planeamiento-remitido delegation codes (`PERI`, `ED`, `PU`, partial `PA`/`R`/`E` visible at crop
  edge) — the same delegation-instrument vocabulary already known from the pilot's `coaco:actuaciones`
  layer and the CUS legend format documented in `CORPUS-REVIEW-2026-08-04-PM.md`.
- UTM coordinate tick labels at the sheet edges (see §1).

Illegible / not improved by the upscale: **nothing new became legible**. A same-region,
equal-viewing-scale crop comparison (region (700,700)-(1000,1000) in the 1849×1441 original vs. the
4×-scaled equivalent (2800,2800)-(4000,4000) in `CUS34W_v2.jpg`, both resampled to 1200×1200 for a
fair side-by-side) shows **identical parcel boundary geometry**, but the v2 crop is visibly
**softer/blurrier at every edge**, consistent with upscale interpolation, not added optical
resolution. No parcel-subdivision line, digit, or legend glyph that was ambiguous in the original
became clearer in v2 — the opposite of what a genuine higher-DPI rescan would show. This is the same
finding pattern (uniform ratio, degraded not improved) already recorded for `CUS20W_v2.png` earlier
the same day.

**jpg vs png comparison:** identical pixel dimensions (7396×5764) in both. The PNG (55.7 MB,
lossless) avoids the JPEG's additional generation-loss compression artifacts the JPEG (16.5 MB)
necessarily carries on top of the upscale itself — so **if either file were to be used for anything,
the PNG is the technically cleaner of the two** (no double compression). But since the underlying
raster content is confirmed to carry no more real information than the already-held original JPEG,
this preference is moot in practice — neither file is worth tracing from.

## 4. Comparison against current implementation

| | Existing PRYZM coverage | What CUS34W_v2 would add |
|---|---|---|
| **Live vector zoning** (`coaco:ordenanzas` WFS, `resolveCordobaSubzone.ts`) | Publisher-vectorised, authoritative-in-scope. `coaco:hojas_cus` explicitly names **CUS34W** as one of the 6 source sheets COACo digitised into this layer (`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md` line 192: `CUS25W, CUS26W, CUS34W, CUS41W, CUS45W, CUS46W`). | Nothing — the land this sheet depicts is already represented in a **higher-authority** vector source than anything a hand-trace of this raster could produce. |
| **Traced-zone store** (`cordobaTracedZones.json`, `resolveCordobaTracedZone.ts`) | Exactly ONE record today: `PAS-2`, traced off **`CUS20W.jpg`** — a sheet east of the pilot bbox, explicitly chosen because it sits **outside** COACo's vectorised coverage (`TRACED-ZONE-SERVICE-2026-08-05.md`). | CUS34W is the wrong kind of sheet for this store's purpose: the store exists to cover land the pilot does NOT vectorise. CUS34W is inside the already-vectorised set. |
| **MC height table** (`resolveCordobaStreetWidth.ts`, `idecordoba:manzana`) | Independent of the CUS series entirely — sourced from a block-ring WFS, not a raster sheet. | No interaction; CUS34W is not an input to this resolver. |
| **Corpus holdings** (`corpus/MANIFEST.md`) | `CUS34W.jpg`, 1849×1441, 423,880 bytes, already fetched and catalogued 2026-08-04. | A same-content, larger, blurrier duplicate. |

**Conclusion: this sheet does not cover new geographic area from PRYZM's perspective in any
actionable sense** — the land it depicts is inside the set COACo itself already vectorised, and the
one traced-zone record PRYZM does maintain deliberately targets sheets *outside* that vectorised
set. It duplicates/refines nothing PRYZM has authored, because PRYZM has authored nothing from CUS34
specifically (no trace exists from this sheet in `cordobaTracedZones.json`), and there is no reason
to start now given a live, authoritative vector alternative already exists for this land.

## 5. Engineering value

| Lever | Improved? | Why |
|---|---|---|
| (a) Zoning reconstruction | **No** | Land already vectorised by the publisher's own downstream agent (COACo); a PRYZM hand-trace from this raster would be a strictly weaker, unverified derivation of land that already has an authoritative vector answer. |
| (b) Ordinance extraction | **No** | Still a raster, zero text/vector geometry (§2). Does not touch the actually-open ordinance-extraction gaps (MC street-width AR-series CAD sheets, Fichas de Planeamiento volume). |
| (c) Parcel assignment | **No** | No new parcel geometry; Catastro/INSPIRE parcel provision is unaffected. |
| (d) Legal refusals reduction | **No** | The pilot already answers (or correctly refuses, per delegation) for this sheet's footprint via `coaco:ordenanzas`/`coaco:actuaciones`. |
| (e) Automatic envelope coverage | **No, quantifiably ~0** | `CORDOBA-COMPLETE-COVERAGE-ROADMAP-2026-08-04.md` Phase 2/3 and the ENVELOPE.md ceiling math both size the CUS-series opportunity as **vectorising the sheets outside COACo's already-digitised 6-sheet subset** (the remaining 43 of 49, now that all 49 are fetched). CUS34W is inside that already-digitised 6, so it carries **0 m² of net-new vectorisable-and-not-already-vectorised land** — it cannot contribute to the "≈8%, order of magnitude only" hypothetical ceiling in `ENVELOPE.md`, which is explicitly built on the **un-vectorised** 43. |

**Quantification:** cannot be more precise than "0 net-new parcels" without re-running the pilot's
own dissolve/overlay measurement to confirm CUS34's full extent falls inside Sur+Noroeste (not done
here — out of scope for an image-quality assessment) — but the identity of sheet 34 with one of
COACo's own six source sheets is sourced directly from the corpus's own findings doc, not inferred,
so this is a strong, not merely probable, negative.

## 6. Legal impact

No conflict was found, because **no trace was attempted from this sheet** (per the Recommendation
below). The precedence rule is already established in code for exactly this situation, should anyone
be tempted to trace CUS34W later: `resolveCordobaTracedZone.ts` (file header, lines 11–18) states
its own traced polygons are "a materially WEAKER source than a WFS answer — no municipal service
stands behind a single vertex," and ADR-0283/0284 (cited in
`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md` §12) hold that a CUS sheet is "a published *drawing*,
not authoritative published geometry." **The live `coaco:ordenanzas` WFS vector for this land should
win over any hand-trace of CUS34W, without qualification** — this is not a close call requiring
founder adjudication, it follows directly from the codebase's own documented source hierarchy.

## 7. Coverage improvement estimate

**Zero, to the resolution this assessment can measure.** CUS34W is confirmed (via COACo's own
`coaco:hojas_cus` publisher metadata, not PRYZM inference) to be one of the six sheets already
consumed into the live vector pilot. The roadmap's entire remaining CUS-series opportunity is
defined as the sheets **outside** that six-sheet set; this file cannot be counted toward it under
any consistent accounting.

## 8. Remaining blockers

Unchanged by this file. The genuinely open items remain exactly as recorded in
`CORDOBA-COMPLETE-COVERAGE-ROADMAP-2026-08-04.md` §3 and `CLOSURE-REGISTER.md`'s coverage-loss
matrix: vectorising the 43 CUS sheets outside COACo's already-digitised subset, the MC street-width
measurement basis (blocked on the AR-series CAD sheets, a different document family entirely), and
the still-unlocated Córdoba Fichas de Planeamiento volume. This assessment closes no blocker and
opens none.

## 9. Recommended next steps

**(A) Ignore this source.** Do not trace it, do not add it to the corpus as a distinct asset beyond
noting this assessment, do not spend further engineering time evaluating it.

Justification, restated compactly:
1. **Pixel-identical content to an already-held file**, upscaled exactly 4.0× with measurable
   quality loss, not gain (§1, §3) — the same rejection pattern already applied to `CUS20W_v2.png`
   the same day.
2. **Even hypothetically at genuine higher fidelity, the underlying land is already covered by a
   stronger source** — COACo's own live `coaco:ordenanzas` vector layer, which was built from this
   exact sheet (§4, §5).
3. **No engineering lever in the open roadmap benefits** — the CUS-series opportunity is specifically
   sheets outside the already-vectorised six, and CUS34 is inside that six (§5, §7).

If a genuinely independent higher-resolution rescan of CUS34W (or, more valuably, of any of the 43
sheets NOT already vectorised) becomes available in future, apply the same two-step test used here
and previously on `CUS20W_v2.png`: (1) `PIL.Image.size` ratio-check against the existing file for a
suspicious exact-integer upscale, and (2) an equal-viewing-scale crop comparison before spending any
tracing time.

---

*Method: `PIL.Image.size`/`os.path.getsize` direct measurement; visual inspection of both full files
and targeted crops via the Read tool; cross-reference against `corpus/MANIFEST.md`,
`findings/MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`, `findings/CORPUS-REVIEW-2026-08-04-PM.md`,
`findings/GEOREFERENCING-FEASIBILITY-2026-08-04.md`, `findings/TRACED-ZONE-SERVICE-2026-08-05.md`,
and direct reads of `packages/site-parcel-data/src/providers/resolveCordobaTracedZone.ts`,
`.../cordobaBbox.ts`, and `.../data/cordobaTracedZones.json`. No code, rule pack, or data file was
modified.*
