# Córdoba (INE 14021) — es / es-an

> **What is true now.** Last updated **2026-08-04** · Status: **LIVE, PARTIAL, GATE OPEN.**
> Real numbers render today for a handful of zone families inside a 2-district pilot. Full arc
> of how it got here: [`findings/SESSION-SUMMARY-2026-08-04.md`](./findings/SESSION-SUMMARY-2026-08-04.md).
> Complete blocker-by-blocker state: [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md).
> Honesty tiering per §CONTEXT-DATA-HONESTY. Governed by the JURISDICTION-PLAYBOOK.

## What governs here

- **Municipality:** Córdoba, INE **14021**, prov. Córdoba (14), **Andalucía (ISO es-an)**.
- **Instrument in force:** **PGOU-2001** (Plan General de Ordenación Urbanística, Texto Refundido
  Oct. 2002), confirmed live via national SIU. Historic centre governed separately by **PEPCH**
  (Plan Especial de Protección del Conjunto Histórico) and, for the PT-CV subzone specifically, by
  its own **Tomo VI** (now held — see corpus, below).
- **Rule kind (C58 §2.2):** calificación → ordenanza → document. The ordenanza polygon carries a
  code and a link to its ordinance; numeric parameters live in the ordinance document. Same shape
  as Barcelona's *clau*.

## The number, today (resolution, denominator named)

**`CORDOBA_ENVELOPE_VERIFIED = true`** (signed 2026-08-03, `sources/VERIFICATION.md` §SIG-1) —
the honesty gate that used to block every Córdoba parcel is **open**. Real numbers render at
`pipeline-extracted-unverified` confidence for:

- **PAS-1/2/3, OA-1/2, UAD-1/2/3, CTP-1** — full, live.
- **PT-CV (`PTC`)** — ocupación packed and live; height correctly stays `null` (a per-parcel
  graphical determination, verified via the now-held "plano de edificación," not a missing
  document — see the session summary §3).
- **MC-1..4** — height is now resolvable (`resolveCordobaStreetWidth.ts`, sourced from the
  live `idecordoba:manzana` block-ring WFS, `ide.cordoba.es`), but MC still correctly refuses
  overall — the footprint ground (`CORDOBA_MC_FONDO_UNRESOLVED_RING`) is separate and unresolved.
- **UAS, Industrial** — correctly NOT packed. Full ordinance text is held, but COACo's live
  attribute layer never records the subzone suffix, so no parcel can bind to a specific row. A
  structural data-model gap, not a document gap — not fixable from PRYZM's side.

**Geographic scope:** still the 2-district COACo pilot (Sur + Noroeste, ≈4.96 km², `coaco:ordenanzas`
WFS). Outside it, a parcel gets a cited "no calificación published for this land" refusal, never a
fabricated estimate.

**But — proven-with-caveats, not just theorized, this session:** the pipeline extends beyond the
pilot. A real parcel traced off a citywide CUS sheet (outside the pilot bbox), georeferenced by
direct visual reading (OCR doesn't work on these sheets' tick-mark font; eyeballing does), matched
to PAS-2, and run through the actual production engine produced a real `status: 'ok'` envelope
(height 12.75 m, FAR 1.66, volume ≈46,998 m³). **Not a clean win, though**: the trace initially
picked the WRONG zone family before a color-swatch check caught it, and one corner coordinate was
an extrapolation rather than an independent read. The chain works; scaling it needs an active guard
against exactly that failure mode, not naive repetition. See
[`findings/END-TO-END-PROOF-2026-08-04.md`](./findings/END-TO-END-PROOF-2026-08-04.md).

## The corpus (2026-08-04) — acquisition is essentially complete

All of the following are held as real files in `corpus/` (see `corpus/MANIFEST.md` for CUS/AR
provenance):

| Set | Coverage |
|---|---|
| CUS calificación sheets (citywide zoning-map rasters) | **49/49** |
| Alineaciones y Rasantes (alignment/frontage, real vector CAD) | **49/49** |
| Planos de Gestión (execution/management-unit boundaries) | **49/49** |
| Planos de Edificación (historic-centre per-parcel floor maps) | **15/15** |
| PGOU-2001 Tomo IIA (Régimen Urbanístico) + Tomo IIB (Usos/Ordenanzas/Urbanización) | complete |
| Normativa del Conjunto Histórico (= Tomo VI) + Normativa PEPCH | complete, cross-verified |

⚠ Three separate "this source doesn't exist" findings in the prior dossier (CUS sheets, the AR
series, and the `idecordoba:manzana` WFS layer) were each wrong about the URL/domain, not about
the data's existence — all three corrected this session. **Before trusting a "data unobtainable"
verdict for another city, re-test the exact URL.**

## What's still genuinely open

1. **MC footprint** — no published block/parcel geometry states a *profundidad edificable*, and no
   existing `GeometricRule` kind cleanly expresses "unconstrained depth, capped by ocupación only"
   without a siting convention. A capability for this (`occupation-capped-alignment`) was built and
   tested this session but deliberately not activated — see session summary §3.
2. **Citywide zone-polygon tracing** — the CUS sheets are now georeferenceable (proven on one
   sheet/one polygon) but not traced at scale. This is the real remaining size of "cover the whole
   city."
3. **PT-CV floor counts** — graphical per-parcel map, no text-extraction path found.
4. **Fichas de Planeamiento** (the real one, for the ~43-45% of pilot land legally delegated to
   Plan Parcial/PERI/Estudio de Detalle) — still not located.
5. **UAS/Industrial subzone binding** — structurally blocked on COACo's own data, not PRYZM's to fix.

## Files in this folder

- `README.md` — this file (what is true now).
- `CLOSURE-REGISTER.md` — the complete, row-by-row blocker list, dated and corrected in place.
- `findings/SESSION-SUMMARY-2026-08-04.md` — the full arc of the 2026-08-04 session: what was
  wrong in the prior dossier, the corpus, every rule-pack change, digitization feasibility results.
- `findings/CORPUS-REVIEW-2026-08-04-PM.md` — the definitive per-document read-through (PEPCH,
  Conjunto Histórico, the misfiled Lorca document).
- `findings/GEOREFERENCING-FEASIBILITY-2026-08-04.md`, `findings/AR-EXTRACTION-PROTOTYPE-2026-08-04.md`,
  `findings/CUS-CONTROL-POINTS-2026-08-04.md` — the digitization/georeferencing investigation trail.
- `findings/CALIFICACION-ENDPOINT-PROBE.md` — the original reachability probe.
- `findings/OCR-EXTRACTION-RESULTS.md`, `findings/ORDENANZA-PACK-SPEC.md` — the original PGOU-2001
  ordinance transcription.
- `sources/SOURCES.md` — per-source catalogue.
- `sources/VERIFICATION.md` — the human sign-off record (§SIG-1, signed 2026-08-03).
