# FORENSIC BLOCKER AUDIT — Sevilla (INE 41091), 2026-08-03

> Part of a full 8-capital Andalucía audit. All facts sourced from `git show HEAD:<path>`
> (HEAD=`fb7b6f71`) — the working tree has ~6,640 unrelated uncommitted deletions, disk reads treated
> as unreliable this session. Companion: [`SOURCE-founder-sevilla-research-programme-2026-08-03.md`](./SOURCE-founder-sevilla-research-programme-2026-08-03.md)
> (the founder's own 3-pass research capture + verification, same day).
> Regional conclusion and sibling audits: [`../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md`](../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md).

1. **Implementation status**: **Research only**, but the strongest research position in the region
   outside Córdoba/Málaga. Not registered, no rulepack.
2. **Planning source**: Texto Refundido PGOU 2006, GUMA / Ayto. de Sevilla.
3. **Geometry source**: **ArcGIS REST** (FeatureServer + MapServer),
   `cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/` — **confirmed live by
   direct fetch this session**: 6 layers — Etiquetas y Altura máxima (1), Alineaciones (4),
   Modificaciones PGOU (15), Planeamiento de Desarrollo (20), Clasificación (24), Calificación (25).
4. **Parcel source**: Not independently confirmed this session; presumed national Catastro per the
   regional pattern.
5. **Zone classification method**: Field `zona_orden` on Layer 25 (e.g. `"SB: Suburbana"`), plus
   `clase_cat`, `u_global` — an attribute field, not a filename convention.
6. **Ordinance structure**: Per-zone Normas PDFs, linked directly per-parcel via `enlace_ng`/
   `enlace_np` fields on the same layer (the endpoint hands the exact PDF URL — not yet
   independently verified as direct-vs-lookup).
7. **Machine-readable parameters**: Height — **`altura_max` is a structured GIS attribute** — the
   only Andalucían capital serving height as data rather than requiring PDF extraction. FAR,
   coverage, setbacks, depth — **not found**; require one-time per-zone digitisation from the
   Normas PDFs.
8. **Alignment availability**: Layer 4 (`Alineaciones`) is published and confirmed live, but whether
   it's directly sufficient to construct a buildable polygon (vs. requiring semantic interpretation
   of exterior/interior alignment and fondo máximo) is **unresolved** — this is the exact open
   question in the founder's own research capture.
9. **Overlay dependencies**: Heritage layers appear present in the same service group (BIC/
   protected-catalogue/historic-sector, per the founder capture) but not independently confirmed by
   this session's own endpoint check — only the 6 core layers were fetched.
10. **CRS**: **Not found.** An `EPSG:25830` figure appears in a prior survey document but sits
    beside self-flagged guesses; the survey itself still asks "EPSG?" as an open question. First
    task for any real discovery pass.
11. **Existing PRYZM implementation**: **None**, except one incidental comment reference to Sevilla
    in `packages/site-parcel-data/src/rulepacks/ampladaDeVial.ts` (a shared street-width
    quantum-set file, cited only as a comparison data point — "Córdoba and Sevilla have no
    quantisation above ×2.8" — not an implementation).
12. **Dispatch status**: **Does not reach dispatch.** No `isInSevilla` branch anywhere. Falls to
    `applyEstimatedZoning` — **renders a fabricated generic estimate**.
13. **Root blocker**: **Research** (specifically: the CRS gap, the field-schema census beyond the 6
    layer names, and the alignment-sufficiency question are all unresolved) — **not** external
    authority (the endpoint is live and unblocked, unlike Málaga) and **not** engineering (nothing
    has been built to block on yet).
14. **Smallest unlock**: Re-probe `cdu.urbanismosevilla.org` for the native CRS and full Layer 25
    field schema — this alone resolves the first of the ten/eight unknowns both founder captures
    name as blocking, and costs an afternoon, not a discovery programme.
15. **Reuse analysis**: **ArcGIS REST container** — this is the first Andalucían (and one of very
    few Spain-wide) ArcGIS-published municipality identified; no PRYZM code currently handles this
    container type at all (existing containers are GeoServer-WFS-shaped). Building an
    `arcgisRest.ts` container adapter here would be genuinely novel, not a port of Córdoba's
    WFS-shaped code. Rule schema — plausible fit, unverified (Sevilla's height-as-attribute shape
    doesn't obviously map onto Córdoba's `GeometricRule` union without checking whether `altura_max`
    is metres or storeys first).
