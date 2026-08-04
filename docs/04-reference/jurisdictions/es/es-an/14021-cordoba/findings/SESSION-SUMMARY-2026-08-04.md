# Córdoba — 2026-08-04 session summary (the "documents were never the real blocker" pass)

> One long session, one thread: the founder progressively supplied real PGOU-2001 source
> documents and this file's companions were corrected in near-real-time as each one landed.
> The single biggest lesson of the day, repeated at three different scales, is recorded first
> because it should change how the NEXT city is approached, not just how Córdoba was:
>
> **A "this source doesn't exist" finding earlier in this project was, three separate times
> today, actually "this source exists at a different URL/domain than the one that was tested."**
> CUS calificación sheets, the alineaciones-y-rasantes series, and the `idecordoba:manzana`
> block-ring WFS layer were each independently re-verified live this session and found reachable
> — at a corrected path, not a new source. See §1 below for the specifics. Before accepting a
> "data does not exist" verdict for another jurisdiction, re-test the exact URL, not just the
> claim.

---

## §1. What was WRONG in the prior dossier, and the correction

| Prior claim | File it lived in | Correction |
|---|---|---|
| "41 of 49 CUS sheets are dead" | `CLOSURE-REGISTER.md` blocker 22, `MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md` | Wrong domain (`visor.pgou.coacordoba.org`). Real, live path: `gmucordoba.es/documentos/.../cusw_jpg/CUS{NN}W.JPG`. **49 of 49 now fetched.** |
| "No alignment/frontage layer exists anywhere" | `CLOSURE-REGISTER.md` row 25, `CAPABILITY-AUDIT-2026-08-04.md` | True for WFS/WMS *services* (still true). False for the static PDF tree: `gmucordoba.es/documentos/.../PDF_ar/ar{NN}.pdf`. **49 of 49 now fetched**, confirmed genuine vector CAD (not scans). |
| `idecordoba:manzana` block-ring layer at `idecordoba.cordoba.es` | `CAPABILITY-AUDIT-2026-08-04.md`, `resolveMurciaStreetWidth.ts` header | Wrong hostname (doesn't resolve). Real host: `ide.cordoba.es`. **Confirmed live**, `GetFeature` returns real `MultiPolygon` data, `totalFeatures: 20,730`, matching the prior count. |

## §2. Corpus now held (all in `corpus/`, see `corpus/MANIFEST.md` for the CUS/AR provenance)

| Set | Count | What it is |
|---|---|---|
| CUS calificación sheets | 49/49 | Citywide zoning-map rasters (JPEG), 1:5000 |
| Alineaciones y Rasantes | 49/49 | Alignment/frontage plans, genuine vector-CAD PDFs |
| Planos de Gestión | 49/49 | Execution/management-unit boundaries (PAU-P, sectors) |
| Planos de Edificación | 15/15 | Per-district historic-centre building/floor-count maps |
| Tomo IIA — Régimen Urbanístico | 2 parts | General/procedural PGOU-2001 regime |
| Tomo IIB — Usos, Ordenanzas y Urbanización | 2 parts | Per-zone numeric ordinances |
| Normativa del Conjunto Histórico (= Tomo VI) | 1 | Historic-centre PT ordinance |
| Normativa PEPCH | 1 | Cross-checks Tomo VI verbatim |
| "TOMO 03 NORMATIVA URBANISTICA FICHAS" | 1 | **Misfiled — this is Lorca's (Murcia), not Córdoba's.** Not usable. |

## §3. Rule-pack changes shipped today (`packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts`)

- **PT-CV (`PTC`) registered.** Ocupación 70%/80% (Art. 46.1) packed, real and cited. Height/FAR
  stay `null` — Art. 49.1 states floor count is a per-parcel determination read off the (now-held)
  "plano de edificación," which is a graphical map, not machine-extractable text (confirmed by
  direct `pdftotext` + visual check on all 15 sheets). Still refuses, now for a verified reason
  instead of "document not held."
- **`occupation-capped-alignment` GeometricRule kind** built (schema + engine + tests) for the
  general "unconstrained depth, capped by ocupación only" shape MC's footprint needs — built,
  tested, deliberately **not** wired to MC yet (would change MC's refusal shape for zero benefit
  while height was still unresolved; see §4).
- **MC street width — resolver built and wired** (`resolveCordobaStreetWidth.ts`), sourced from
  `idecordoba:manzana`, primary over the pre-existing (until-today-undiscovered-by-this-session)
  Catastro-dissolve fallback (`resolveCordobaMcStreetWidth.ts`). Feeds the already-transcribed
  `CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE`. **MC height is now resolvable.**
- **MC footprint still refuses**, independently and correctly — `CORDOBA_MC_FONDO_UNRESOLVED_RING`
  is untouched. Verified explicitly (test still asserts `degenerate`) that a resolved height does
  NOT cause MC to render a full envelope. MC's remaining blocker is now singular: footprint shape.
- **UAS / Industrial** confirmed correctly NOT packed — full numeric text exists (found already on
  disk since 2026-07-24, not new this session), but COACo's live attribute layer only records the
  zone *family*, never the subzone suffix, so no parcel can ever bind to a specific UAS-N/IND-N row.
  A structural data-model gap, not a document gap.
- Dispatch-lookup coverage verified: the zone-code→pack lookup was already fully generic (no
  allowlist bug); test coverage extended from 4 to 11 of 13 zone codes exercised end-to-end.

Full test suite: 2763 passing (`packages/site-parcel-data`), zero regressions.

## §4. Digitization feasibility (the CUS/AR raster→geometry problem)

- **AR (vector CAD) extraction**: works cleanly (PyMuPDF, already installed — 48,788 real path
  objects extracted from one sheet, correctly classified by color/width against the legend).
  **Georeferencing attempt on the extracted shapes honestly REFUSED** — couldn't cleanly separate
  real building/parcel outlines from other CAD noise (hatching, dimension boxes, symbols) well
  enough to pass the same statistical acceptance bar used successfully for Aragón. Named,
  fixable-in-principle obstacle (tighter shape classification, or vote against parcels instead of
  buildings) — not attempted further this session.
- **CUS (raster) georeferencing**: OCR does not work (Tesseract installed via winget mid-session,
  but the tick-mark font is too small/degraded even after tuning). **Direct visual reading works**
  — proven on one sheet (CUS41W), corner coordinates read by eye, cross-corroborated to a
  consistent ~0.99 m/px scale independently on both axes. Realistic path: ~8 crops read per sheet,
  49 sheets, no automated shortcut found. Full detail: `CUS-CONTROL-POINTS-2026-08-04.md`.
- **End-to-end proof-of-concept: PARTIAL — the chain works, but not a clean win.** One PAS-2 parcel
  traced off `CUS20W.jpg` — confirmed east of the pilot bbox (`cordobaBbox.ts` E max 344,460 vs.
  this polygon's ≈346,000), genuinely new territory. 5-vertex polygon traced, pixel→UTM via the
  visual-reading transform, run through the REAL `computeBuildableEnvelope` engine code (not hand
  math) in `packages/site-parcel-data/__tests__/cordobaProofOfConcept.test.ts`. Result: `status:
  'ok'`, height 12.75 m (PB+3), FAR 1.66, coverage 0.5, volume ≈46,998 m³. **Re-run and confirmed
  passing directly (3/3), not just taken on the implementing agent's word.**
  ⚠ **Two honest caveats that bear directly on scaling to the other 48 sheets:** (1) the FIRST
  cluster traced was actually the WRONG family (Manzana Cerrada, a refusal-only zone) — caught
  only by careful RGB-sampling the legend swatch against the traced polygon's fill colour, a real
  demonstrated failure mode (color confusion between visually similar swatches), not a
  hypothetical one; (2) the sheet's top-edge northing coordinate was an EXTRAPOLATION, not an
  independently-read tick label — the weakest link in this trace's georeferencing. **Conclusion:
  the chain — scanned sheet → visual georeferencing → traced zone → matched ordinance → computed
  number — is proven to work.** Scaling it needs an active guard against zone misidentification
  (e.g. mandatory RGB-swatch verification per trace, independent confirmation of every corner
  coordinate), not naive repetition of the same steps 48 more times. Full detail:
  `END-TO-END-PROOF-2026-08-04.md`.

## §5. What is still genuinely open

1. **MC footprint** — needs either a real published block/parcel geometry source (none found) or a
   product decision to accept the `occupation-capped-alignment` construction (built, unused).
2. **Citywide zone-polygon tracing** — the CUS sheets are now georeferenceable (proven method,
   not yet scaled past one sheet) but zone polygons themselves haven't been traced into vector
   geometry anywhere yet. This is the actual remaining size of the "cover the whole city" problem.
3. **PT-CV floor counts** — graphical per-parcel map, no extraction path found; lower priority
   (one zone family, historic centre only).
4. **Fichas de Planeamiento** (the real one, for the ~43-45% legally-delegated pilot land) — still
   not located; the file that looked like it was misfiled (Lorca, not Córdoba).
5. **UAS/Industrial subzone binding** — structurally blocked on COACo's own attribute data, not
   fixable from PRYZM's side at all.

## §6. Files touched today, for reference

Code: `esCordobaPGOU2001.ts`, `esCordobaZoneClassification.ts`, `ZoningRulesEngine.ts`,
`GeometricRule.ts` (schemas), `occupationCappedDepth.ts` (new), `resolveCordobaStreetWidth.ts`
(new), `server/cordobaZoningProxy.js`, `apps/editor/src/ui/site/siteDispatch.ts`, plus new/updated
tests across `packages/site-parcel-data/__tests__/` and `apps/editor/__tests__/`.

Docs corrected in place (retraction convention, originals preserved): `CLOSURE-REGISTER.md`,
`CAPABILITY-AUDIT-2026-08-04.md`, `MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`,
`GMU-TRANSPARENCY-REQUEST-DRAFT-2026-08-04.md`.

New findings docs (chronological): `CORPUS-REVIEW-2026-08-04-PM.md`,
`GEOREFERENCING-FEASIBILITY-2026-08-04.md`, `AR-EXTRACTION-PROTOTYPE-2026-08-04.md`,
`CUS-CONTROL-POINTS-2026-08-04.md`, `END-TO-END-PROOF-2026-08-04.md` (pending), this file.

*Compiled from the live session transcript, not re-derived — every figure above traces to a real
tool result or agent report from today's work.*
