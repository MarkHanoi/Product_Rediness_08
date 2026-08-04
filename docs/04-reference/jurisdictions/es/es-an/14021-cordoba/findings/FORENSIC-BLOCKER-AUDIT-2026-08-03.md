# FORENSIC BLOCKER AUDIT — Córdoba (INE 14021), 2026-08-03

> Part of a full 8-capital Andalucía audit (Almería, Cádiz, Córdoba, Granada, Huelva, Jaén, Málaga,
> Sevilla). All facts sourced from `git show HEAD:<path>` (HEAD=`fb7b6f71`) — the working tree has
> ~6,640 unrelated uncommitted deletions, so disk reads were treated as unreliable this session.
> Regional conclusion and sibling audits: [`../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md`](../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md).

1. **Implementation status**: Rulepack exists, **verified** (signed), **refusal only** in practice —
   the gate is `true` but no compute path exists.
2. **Planning source**: PGOU-2001, Texto Refundido Oct. 2002, *Normativa: Usos Ordenanzas y
   Urbanización*, Gerencia de Urbanismo.
3. **Geometry source**: GeoServer WFS 2.0.0 + WMS 1.3.0, `geoserver.pgou.coacordoba.org` — publisher
   is **COACo (Colegio de Arquitectos)**, not the planning authority itself.
4. **Parcel source**: National Catastro INSPIRE + a pre-joined `coaco:vcatastro_urbanismo` layer
   (5,725 parcels with `refcat`).
5. **Zone classification method**: Subzone code lives in the **filename** of a linked PDF
   (`O_MC3.pdf` → `MC-3`) — publisher-undocumented convention, broken on 14 of 453 polygons carrying
   a bare `O_MC.pdf`.
6. **Ordinance structure**: Title 13, Arts. 13.3–13.12, 5 families (PAS/OA/UAD/CTP-1/MC), covering
   only 2 districts (Sur + Noroeste) = 4.88% of Córdoba's suelo urbano.
7. **Machine-readable parameters**: Height — yes for PAS/OA/UAD/CTP-1, no for MC (per-street-width
   table). Depth — yes for UAD/CTP-1, MC is *libre* (bounded by ocupación only). FAR/coverage/
   setbacks — **not carried as GIS attributes at all**; `coaco:ordenanzas` serves only
   `ordenanza, et, sup_m2, link` — the actual numbers live in 13 PDFs, 12 vector-text-extractable.
8. **Alignment availability**: **Proven absent** — 105 WFS + 119 WMS + 15 COACo services swept, zero
   alignment layers found (`ejes_red_viaria` is a road-axis line, not a frontage — measured only
   16.7% within 1m of frontage vs. control's 83.9%).
9. **Overlay dependencies**: Heritage only (PEPCH — unsourced; Art. 13.3 Elemento Protegido;
   Conjunto Histórico Tomo VI — not held). 42.98% of ordenanza land separately delegated via
   `coaco:actuaciones`.
10. **CRS**: EPSG:25830 native; alignment sheets are EPSG:23030 (ED50) — measured shift, not assumed.
11. **Existing PRYZM implementation**: `rulepacks/esCordobaZoneClassification.ts` +
    `esCordobaPGOU2001.ts`, `providers/resolveCordobaSubzone.ts` + `resolveCordobaPgou.ts`,
    `server/cordobaZoningProxy.js`, registered `registry.ts:739-812` (two entries — pilot +
    municipal closure), certification gate `CORDOBA_ENVELOPE_VERIFIED`
    (`esCordobaZoneClassification.ts:48`, `true`), tests across 6+ files.
12. **Dispatch status**: **Reaches dispatch, reaches verification (gate passes), does not reach
    compute.** `siteDispatch.ts:1327-1328` routes here; the gate check at `:3229` passes; the `else`
    branch at `:3260-3282` unconditionally refuses — `computeBuildableEnvelope` is never called
    anywhere in the file for Córdoba.
13. **Root blocker**: **Engineering.** Verification is fully spent; nothing legal, external, or
    product-decision-shaped remains on the signed 5-subzone scope — the compute branch was simply
    never written (confirmed by the sign commit's own message: "deliberately NOT written").
14. **Smallest unlock**: Write the compute branch at `siteDispatch.ts:3260-3282`, mirroring Murcia's
    pattern (`:3804-3811`). **Estimated 1-2 hours.**
15. **Reuse analysis**: GeoServer container — yes (COACo's stack), but the container abstraction
    doesn't exist in code yet, so 0% mechanical reuse today even though the pattern is provable.
    Existing rule schema (`GeometricRule` union) — 100% fit, no new kind needed. Alignment provider —
    N/A, none exists to reuse; Córdoba's own alignment problem is unsolved.
