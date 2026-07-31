# Zürich (BFS 0261) — BZO legal resolver order

> ZH-001 companion. The precedence a Zürich-parcel envelope resolver MUST apply when more than one
> planning instrument governs a parcel. Strongest first; a stronger instrument, where present, OVERRIDES
> the per-zone BZO Grundmasse in `ch-zh-zurich-BZO-zones.json`.
> **Last updated:** 2026-07-31 · **Maintainer:** UNASSIGNED · **Authority:** BZO 700.100 · PBG (Kt. ZH).

## Resolver order (strongest → weakest)

1. **Gestaltungsplan** (design plan) — a parcel-specific special land-use plan. Where one exists it
   supersedes the BZO Grundmasse entirely (its own density / height / setback geometry governs). Sourced
   as GIS, per parcel; **not yet ingested** (see NEXT — remaining work).
2. **Sondernutzungsplan** (special land-use plan, e.g. Quartierplan / Arealüberbauung provisions) — where
   a special plan applies, its provisions override the base-zone BZO values for the parcels it covers.
3. **BZO (Bau- und Zonenordnung 700.100)** — the base municipal zone order: the per-zone Grundmasse
   (AZ / Vollgeschosse / Gebäudehöhe / Grundgrenzabstand) transcribed in `ch-zh-zurich-BZO-zones.json`,
   plus the Art.38 setback formulas in `ch-zh-zurich-BZO-rules.json`. TWO parallel regimes (BZO 91/99 vs
   BZO 2016) — resolve the governing regime per parcel before reading a height (RISK R4).
4. **PBG** (kantonales Planungs- und Baugesetz, Kanton Zürich) — the cantonal parent law. Supplies the
   definitional / fallback rules the BZO builds on — e.g. the Grenzabstand / Gebäudeabstand measurement
   definition (§ 260). Applies where the instruments above are silent.

## Consequences for the machine table

- The zone table's `setbacks.front` is `{type:'Baulinie', resolver:'geometry'}` because a **Baulinie**
  (building line, a GIS geometry) — where present — fixes the frontage ahead of any per-zone number.
- A Gestaltungsplan or Sondernutzungsplan, when ingested, must be checked and applied BEFORE the BZO
  per-zone lookup; the current `ch-zh-zurich-BZO-zones.json` encodes level 3 (BZO) only.
- PBG §260 is captured as a definitional rule in `ch-zh-zurich-BZO-rules.json`
  (`zh-pbg-260-gebaeudeabstand-def`).

## Honest gaps (do not launder)

- **Gestaltungsplan / Sondernutzungsplan GIS layers are NOT yet ingested** — a parcel under a special plan
  is currently resolved as if only the BZO applied. This is a known override the resolver does not yet see.
- The **Art.38 per-zone kleiner/grosser Grundabstand table is UNKNOWN** (not extracted from the scanned
  ordinance) — see the zones JSON `setbackTableStatus`.
