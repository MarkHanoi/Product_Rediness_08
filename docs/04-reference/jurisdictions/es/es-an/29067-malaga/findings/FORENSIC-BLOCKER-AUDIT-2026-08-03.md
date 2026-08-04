# FORENSIC BLOCKER AUDIT — Málaga (INE 29067), 2026-08-03

> Part of a full 8-capital Andalucía audit. All facts sourced from `git show HEAD:<path>`
> (HEAD=`fb7b6f71`) — the working tree has ~6,640 unrelated uncommitted deletions, disk reads treated
> as unreliable this session.
> Regional conclusion and sibling audits: [`../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md`](../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md).

1. **Implementation status**: **Research only.** No rulepack file, no gate, no registry entry.
2. **Planning source**: PGOU Málaga, Aprobación Definitiva Jul-2011, GMU.
3. **Geometry source**: GeoServer WFS at `sig.malaga.eu/geoserver/wfs` — `GetCapabilities` answers
   HTTP 200 (43 feature types) at the service path, though the bare root host DNS-fails.
4. **Parcel source**: National Catastro (inferred consistent with the rest of Andalucía; not
   independently re-confirmed for Málaga specifically this session).
5. **Zone classification method**: **Unknown/blocked** — `muralPGOU:POLCALIF_T` (calificación
   polygons) exists as a layer name, but `DescribeFeatureType` returns a 445-byte schema with
   **zero fields** and `GetFeature` returns HTTP 500.
6. **Ordinance structure**: Título 12, Arts. 12.1.1–12.5.x, families CJ/PROD/OA/UAS/UAD/CTP/MC/GSM/
   CH/EP/SUNC — **12 normative PDF documents, all HTTP 200, all 12 natively text-extractable** (no
   OCR needed), filenames encode the zone code.
7. **Machine-readable parameters**: Height — **value present on 90% of zone chapters** (PROD
   9m/12m, GSM 12m, UAS PB+1/7m, OA full table 4.20-25.40m, MC 3.00m). Depth — CTP states 15m
   *profundidad edificable* explicitly (Art. 12.2.14); MC/CH defer to subordinate instruments.
   FAR/coverage/setbacks — document-weighted: 20% complete extraction, 60% partial, 20%
   not-drawable.
8. **Alignment availability**: **The only published municipal alignment layer found anywhere in
   Andalucía** — `muralPGOU:LINALIN_T` ("líneas de ALINEACIÓN"), advertised in the same schema
   census as the other muralPGOU layers. Unbacked (same access blocker as everything else).
9. **Overlay dependencies**: Not established — blocked upstream of any overlay question.
10. **CRS**: EPSG:25830 on 36 of 43 feature types including all 8 `muralPGOU` layers; EPSG:23030 on
    7 legacy `Limasa:*` layers.
11. **Existing PRYZM implementation**: **None.** No rulepack, no provider, no registry entry, no
    gate, no test. Only research artefacts exist (`tools/andalucia-envelope-max/*.mjs`,
    `docs/.../29067-malaga/`).
12. **Dispatch status**: **Does not reach dispatch.** No `isInMalaga` branch anywhere in
    `applyZoning`. Falls to the unconditional `applyEstimatedZoning` fallback
    (`siteDispatch.ts:1387`) — **renders a fabricated generic estimate**, not even a refusal.
13. **Root blocker**: **External authority.** Every parameterized attempt to read `muralPGOU:*` (13
    combinations across WFS versions/mount paths/CRS, plus WMS GetMap/GetFeatureInfo/
    GetLegendGraphic) fails with `ORA-28000: la cuenta está bloqueada` — confirmed by control (3/3
    non-`muralPGOU` layers on the same GeoServer instance served normally, 0/8 `muralPGOU` layers
    did). This is entirely upstream of PRYZM.
14. **Smallest unlock**: A human contacts Ayuntamiento de Málaga (or its GIS vendor) to unlock the
    Oracle account. Not schedulable by engineering. Once unblocked: ~2-4 days to author a pack —
    most of the parameter reading is already done.
15. **Reuse analysis**: GeoServer container — same stack shape as Córdoba, but the **data model is
    different** (attribute-carrying vs. Córdoba's filename-encoded key), so Córdoba's zone-resolver
    code does **not port** despite the shared container type. Rule schema — the CTP 15m depth
    statement maps cleanly onto the same `alignment`-kind `GeometricRule` Córdoba's CTP-1 uses (same
    legal shape: measured from the vial). Alignment provider — **Málaga is the best candidate to
    seed a real one**, since `LINALIN_T` is the only published alignment layer in the region.
