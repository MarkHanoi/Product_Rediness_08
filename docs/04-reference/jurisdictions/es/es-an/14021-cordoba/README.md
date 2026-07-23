# Córdoba (INE 14021) — es / es-an

> **What is true now.** Last updated 2026-07-23 · Status: **DATA-ACCESS BLOCKER CRACKED**
> (calificación endpoint found, live) · **NO PACK** (numbers are in scanned PDFs, unverified).
> Honesty tiering per §CONTEXT-DATA-HONESTY. Governed by the JURISDICTION-PLAYBOOK.

## What governs here

- **Municipality:** Córdoba, INE **14021**, prov. Córdoba (14), **Andalucía (ISO es-an)**.
- **Instrument in force:** **PGOU-2001** (Plan General de Ordenación Urbanística), confirmed live via
  national SIU `Planeamiento_Vigente` → `FiguraVigente="Plan General", FechaFigura=2002`.
- **Legal frame:** LOUA → **LISTA** (Ley 7/2021) → its Reglamento; **Normas Directoras** for electronic
  documentation in force **24 Apr 2026** (only *post-that-date* plans publish structured geodata via VITUA;
  Córdoba's 2001 plan predates it).
- **Rule kind (C58 §2.2):** **calificación → ordenanza → document** — the ordenanza polygon carries a
  code and a link to its ordinance; the numeric parameters (edificabilidad / nº plantas / ocupación /
  retranqueos) live in the ordinance document. Same shape as Barcelona's *clau*. **NOT** a setback or a
  stored-FAR source. (`geometricRule` kind to be fixed at pack time; do not assume setback.)
- **Dual regime:** the **casco histórico** is under a separate **PEPCH** (Plan Especial de Protección del
  Conjunto Histórico) — the derived-planning trap. Untouched here; the pilot below does not cover it.

## The number (resolution, denominator named)

**0% shippable as `structured` today.** Denominator = a parcel click anywhere in Córdoba (INE 14021).

- **Calificación (structured geometry):** available live for **2 pilot districts only** — **Sur** (zona 01)
  and **Noroeste** (zona 02) — the IMDEEC-funded COACo pilot (~1.63 km², bbox 3.4×4.8 km). A click inside
  those districts resolves to a calificación polygon + ordinance link. **But the ordinance PDFs are scanned
  images** (no text layer) → the numbers are unextracted and unverified → **cannot ship `structured`**
  (L-449 gate). Best honest label today: `estimated-ruleset` pending OCR + human sign-off.
- **Rest of the municipality:** only **SIU clasificación** resolves (clase de suelo: urbano / urbanizable /
  no urbanizable) — a land-class answer, **not an envelope**.

So: the *access* blocker is solved (endpoint found, live, public, structured); the *shippable-pack* blocker
is now **OCR of 15 scanned ordinance PDFs + verification**, plus **pilot coverage** (2 of ~10 districts).

## Granularity (C58 §1.11)

- Calificación: **polygon (zone/manzana scale)** within the 2 pilot districts. 453 polygons.
- Clasificación (SIU): **sub-municipal MultiSurface, one per land class** — coarser, whole-municipality.

## Pack status

- **Starter pack authored, UNREGISTERED** (2026-07-23): `packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts`
  — 13 subzones across 5 families (PAS, OA, UAD full; CTP-1, MC partial), schema-valid, **not imported anywhere**.
- **Rule-extraction is DONE** (OCR/vision of all 15 ordinance PDFs): `findings/OCR-EXTRACTION-RESULTS.md` +
  `findings/ORDENANZA-PACK-SPEC.md`. Values are at tier **`pipeline-extracted-unverified`** (machine-read,
  human sign-off pending) — so `SOURCES.md` §C (the verified table) is still empty.
- Disposition today: **`unregistered`** (data-access solved; numbers extracted-but-unverified). Do **not**
  register until the tier lands in the schema + a human verifies the values.

## Key finding — the national SIU verdict (for the whole Spain rollout)

The national SIU host the prior pass thought dead is **LIVE** (`mapas.fomento.gob.es/arcgis`, browser UA)
— but it serves **clasificación, not calificación**. **There is no national calificación WMS.** Calificación
is per-jurisdiction. This closes the cross-cutting SIU trip-wire negatively — a proven negative that saves
Barcelona and Madrid the same hunt. Detail: `findings/CALIFICACION-ENDPOINT-PROBE.md §4`.

## Files in this folder

- `README.md` — this file (what is true now).
- `NEXT.md` — where we stopped, blockers, trip-wires, the smallest next step.
- `findings/CALIFICACION-ENDPOINT-PROBE.md` — the reachability probe, every host tried, full reproduction.
- `findings/OCR-EXTRACTION-RESULTS.md` — the 15-ordinance OCR/vision extraction, per-family value tables, the pilot resolution %.
- `findings/ORDENANZA-PACK-SPEC.md` — the pack design + the authored (unregistered) starter pack.
- `sources/SOURCES.md` — per-source catalogue (endpoints, tier, exact query). No packed field yet.
- `sources/VERIFICATION.md` — the human sign-off record (what an agent verified, what a human must still confirm).
