# Envelope Capability Matrix — per jurisdiction

> **Status:** LIVING DOCUMENT, updated on every material landing. Created 2026-08-03.
> **The one question this answers:** *"Today, if a user selects a parcel in this jurisdiction, can
> PRYZM generate a building envelope that is legally defensible?"* — measured by jurisdiction, not by
> dataset, not by area share, not by count of things discovered.
>
> **Companion to, not a replacement for:**
> | For | Read |
> |---|---|
> | The founder-mandated national KPI dashboard (envelope/refusal split, updated every reporting cycle) | [PEC-EXECUTION-DASHBOARD.md](../../03-execution/plans/PEC-EXECUTION-DASHBOARD.md) |
> | Whether DRAWN geometry overstates the legal right (a correctness axis, not a status axis) | [ENVELOPE-REALISM-MATRIX.md](./ENVELOPE-REALISM-MATRIX.md) |
> | Full jurisdiction rollout tracker (all 8 replication layers) | [GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md](../GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md) |

## The rule this matrix applies

**Status is `VERIFIED` only if a `*_ENVELOPE_VERIFIED` / `*_CERTIFIED` gate is signed `true`.**
Everything else is `UPPER_BOUND` (draws, claims no buildable right — `open-top-indicative`) or
`BLOCKED` (draws nothing). **Discovered-but-unwired evidence does not move a jurisdiction.** A
research finding moves this matrix only on the commit that wires it into `registry.ts` and/or flips a
gate — never on the commit that merely documents it.

⚠ Percentages below are directional engineering/data/legal splits, not measured resolution rates —
for the measured area-share and determination-split figures, the dashboard is authoritative.

## Matrix

| Jurisdiction | Status | Capability % | Eng % | Data % | Legal % | Blocking layer | Next unlock |
|---|---|---:|---:|---:|---:|---|---|
| **Barcelona** | VERIFIED (partial scope) | ~55% | 80% | 70% | 60% | overlays (5 applicable families unmodelled — island/PTI is not applicable to mainland Barcelona, a taxonomy correction, not a 6th blocker) | Heritage + Flood adapters LANDED (`f834f325`, `f2fdaa00`) — real parsers, resolvers, fixtures from live-extracted features, 27 tests, not wired (no registry/proxy/gate). Heritage: `GetFeatureInfo` never returns geometry from this service, attribute-bag only — a real constraint for whoever wires this next. Flood: DPH→prohibits/ZFP→restricts, both cite RD 638/2016. Environmental (PEIN): legal-effect mapping now COMPLETE — only one PEIN space touches Barcelona (Serra de Collserola, governed by PEPNat, ACORD GOV/48/2021), full article-cited OverlayEffect record produced (prohibited/restricted uses, quantified height/footprint caps, Art. 53 fora-d'ordenació rule). ⚠ Key finding: the Art. 7 gestor report is advisory/non-binding, NOT a hard veto like heritage's BCIN gate — an adapter must not model it the same way. Ready to wire pending geometry (which sub-zone — Reserva vs. general park — a parcel falls in changes severity). Coastal is blocked on a live MITECO server outage (500 on every Costas sublayer, confirmed with controls) — re-probe later, not a PRYZM gap. Airport: RD 657/2022 fully extracted (BOE-A-2022-12553) — it's a POINTS-AND-PARAMETERS decree, not a polygon decree (~40 ETRS89 reference points, no embedded map, no boundary polygon anywhere — VALIDATED, full PDF-stage checklist run, confirmed negative). Servitude surfaces require applying Decreto 584/1972 (as amended by RD 297/2013)'s formulas to these points — a computation task, not extraction. Wind-turbine radioelectric servitudes have NO geometry yet — the RD itself defers that to a future, unissued decree. |
| **Murcia** | ⚠ VERIFIED, live over-grant defect | ~40% | 60% | 65% | 50% | RL 7m cesión (Art. 5.14.3, item 3 — corrected citation) still un-fixed on 16.53% of measured land (VALIDATED, independently re-measured 2026-08-03, exact match to 3 decimals). No GIS shortcut exists — falsification confirmed (a) and (b) both false; buffering is genuinely required | Buffer `pgou_ejes` (camino axis) 7m each side, native-CRS (reuse `nativeCrs.ts`), intersect against RL parcel boundary. No new geometry primitive needed (simpler than Madrid's snap-gate case) — one open unknown: whether `pgou_ejes` geometrically covers all RL-zone caminos de huerta (unverified, not a legal question) |
| **Madrid NZ-1** | UPPER_BOUND (footprint ring only) | 15% | 40% | 55% | 30% | height (Art. 8.1.15.1, CPPHAN-discretionary — genuinely unavailable) | none — no dataset closes this specific gap |
| **Madrid NZ-3,4,5,7,8,9** | BLOCKED | 0% | 20% | 45% (PUB:ALIN found, unwired) | — | geometry ingestion — 59.1M m² of `Alineación Oficial` sits unread | Wire PUB:ALIN ingestion (dependency-graph rank-3 node). Street width VALIDATED-derivable (Art. 6.6.8.3, single perpendicular between published alignments, no averaging) but needs a founder signature (SIG-M2-Madrid analogue) **and** an unbuilt ray-cast-between-polylines primitive (ADR-0289, PROPOSED not built) — realistic unlock ≈8-9% of NZ land, not the 15.75% previously assumed (brief's NZ-9 figure was wrong 9×; grados 1º/2º alone are 0.747%, not 6.920%) |
| **Balears** | UPPER_BOUND (listed 2026-08-03) | 20% | 70% | 35% | 20% | overlays + fitxa-to-article provenance unverified on 98% of zones | Confirm fitxa↔article on the top zones |
| **València** | BLOCKED — R2 gate CONFIRMED SHUT after independent adversarial review, 2026-08-03 | 10% | 30% | 60% | 20% | **LEGAL AMBIGUITY, genuinely unresolved.** First falsification agent's claim (altura=graphed count incl. planta baja, doctrine closed) was independently re-checked by a second agent with no access to the first's conclusions — verdict NO, STRONG confidence. The "Fuera de Ordenación" reconciliation was mischaracterized (moves buildings to a still-nonconforming "Diferido" status, not into conformity) and doesn't explain the measured −2 modal gap (n=105, spread −13…+7). The 24/24 parcel match tests GIS-vs-PDF self-consistency, not GIS-vs-built-reality, which is what the gate actually tests. | Exit requires a written municipal answer to `VALENCIA_R5_ASK`, specifically reconciling the −2 gap — not re-reading the same primary sources a third time. `esValenciaEnvelope.ts:494-506` is accurate as written; do not edit it. |
| **Córdoba** | BLOCKED — engineering-complete, awaiting founder sign-off only, corrected 2026-08-03 | 5% | 90% | 90% | 60% | **PRODUCT DECISION, not engineering.** `VERIFICATION.md` marked SIGNABLE 2026-08-01 (13/13 subzones OCR-verified, zero wrong digits). CTP-1/MC geometricRule gaps flagged in `ENVELOPE-REALISM-MATRIX.md` were stale — closed same-day they were written (`6dbad1f2`, 2026-07-26); UAD-3's separate real gap closed 2026-08-02 (`ef0e966b`). ⚠ One unresolved flag: `VERIFICATION.md`'s own ledger may not yet reflect the UAD-3 closure — worth a founder check before signing, not a blocker in itself. | Sign `VERIFICATION.md` §SIG-1 — this is the entire remaining path |
| **Canarias** | BLOCKED | 5% | 20% | 45% | 30% | zoning — WMS reachable but vigencia is single-valued, not a live choice. **SIPU 2.6.A codebook FOUND** (2026-08-03): "Manual de Sistematización... ITPU-SIPU", Gobierno de Canarias v02 2012, live at idecanarias.es. `'I'` confirmed genuine no-determination; `'COM'` is a real non-numeric value (not unknown, current code treats it as unknown — needs a fix); `'T'` (FonMaxEd) is a legible alignment-parallel signal (not unknown either). Confidence STRONG, primary-source validation pass in flight now (89MB PDF, partial download last time). | Land the validation pass, then fix `esCanariasSipu.ts`'s `COM`/`T` handling (2 field changes, small) |
| **Zaragoza** | BLOCKED — rule pack LANDED (`e46f1a81`) for A1/3.1, A1/3.2, A1/4.1, A1/4.2, registered but gated on unsigned `ZARAGOZA_ENVELOPE_VERIFIED`, same as Córdoba/Murcia | 0% | 85% | 60% | 40% | **PRODUCT DECISION for Grado 3/4** — engineering is done (25 tests, tsc clean): street-width banding (3.1/3.2, reusing `streetWidth.ts`/band-edge-guard pattern unchanged), flat-depth `alignment` rule (15m, Art. 4.1.3), all wired and empty-mapped while unsigned. Known documented gap: A1/3.2's 3rd "Travesía" band unresolved (qualifying-street lookup doesn't exist), shipped with 2 bands only. Grado-1/2 (A1/1, A1/2 — remaining ~40% of A1) is a separate, unbuilt pipeline: graphic `Textos_Altura_Edificable` point-join + Roman-numeral parser + Art. 4.1.8's H=5+(n−1)×3.30 formula (98% of 7,856 labels are bare Roman numerals, VALIDATED full census). | Grado 3/4: founder decision to sign `ZARAGOZA_ENVELOPE_VERIFIED` (no engineering left, mirrors Córdoba's position exactly). Grado 1/2: build the graphic pipeline (~150-250 LOC) before any signature question applies there. |
| **Huesca** | BLOCKED, correctly (refusal VALIDATED, exhaustive) | 5% | 20% | 30% | 20% | alignment — genuinely unpublished | `gis.huesca.es` from a different network — the one open lead |
| **Málaga** | NOT_STARTED — registry empty, but a research trail exists | 0% | 0% | unknown | 0% | not registered at all — `tools/andalucia-envelope-max/` has 10+ prior probe scripts (host sweep, GeoServer, PGOU schema, polcalif, normativa params) never wired or verified | Someone reads `tools/andalucia-envelope-max/out/*.json` before starting fresh — do not re-probe blind |
| **Andalucía (rest) / CyL / Galicia** | NOT_STARTED | 0% | 0% | 0% | 0% | — | no work done — not inventing a number here |

## Totals

- **Jurisdictions with any working envelope generation (VERIFIED or UPPER_BOUND): 3 of 12 tracked** (Barcelona, Murcia, Balears). 2 more (Madrid NZ-1, València) produce a partial/no-height or not-yet-wired output.
- **% Spain land area with working envelope generation: cannot state.** Each city's percentage above is a share of *that city's own* buildable land, not of Spain — no national denominator exists yet (C64 §2.13 flags the denominator itself is being restated to the cadastral parcel).
- **% parcels theoretically processable: cannot state.** No parcel census exists anywhere in the repo. Every figure here is area or field-count, never parcel-count. This is the standing measurement gap, tracked, not a research gap.
- **Biggest single unlock available: Madrid `PUB:ALIN`** — 59.1M m², already published, sitting unread, strictly upstream of street width too.

## Update discipline

- A row moves **only** on a commit: a `registry.ts` wiring, a gate flip (human-signed, L-449), or an
  engineering fix landing. A research finding alone — however strong — updates the "Next unlock"
  column, never the Status or Capability % column.
- Every status change in this file should cite the commit hash that caused it.
- If a jurisdiction is touched and this file is not updated in the same session, treat this file as
  stale for that jurisdiction until re-checked — do not assume it is current.

## Change log

| Date | Change |
|---|---|
| 2026-08-03 | Created. Initial 12-jurisdiction snapshot following the Balears open-top listing (`c14d1e2e`) and the València `altura` falsification (`VALIDATED`, agent `ad66bfccf2b913334`, not yet wired). Málaga row added after founder flagged existing unwired `tools/andalucia-envelope-max/` probe trail. |
| 2026-08-03 | Madrid "Next unlock" updated after street-width falsification (agent `a596174379d3abdf3`): width is VALIDATED-derivable from published alignments (Art. 6.6.8.3), not missing — but blocked on a founder signature + an unbuilt geometry primitive (ADR-0289). Status/Capability % unchanged — no commit landed. Brief's own NZ-9 coverage figure corrected: grados 1º/2º are 0.747% of NZ land, not 6.920% (a 9× error); realistic total unlock ≈8-9%, not 15.75%. |
| 2026-08-03 | Barcelona "Next unlock" updated after live overlay census (agent `a2c1c4cd5e42b930a`): all probes were live HTTP requests, not web-search snippets. Heritage + Flood are near-ready (live sources, legally clean, one probe cycle from adoptable). Environmental is a legal-mapping task, not a data gap. Coastal is a live authority-side server outage (not a PRYZM gap — re-probe later). Airport's only public geometry is a non-authoritative KML; real geometry is in RD 657/2022's unextracted annex. Corrected: "island/PTI" is not a 6th family for Barcelona (mainland jurisdiction, PTI only applies to Balears/Canarias) — the matrix's "all 6 families" language overstated the blocker by one. Status/Capability % unchanged — nothing wired. |
