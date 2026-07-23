# VERIFICATION — Córdoba (INE 14021)

> The human sign-off record (playbook §3.4). Draft → published is a human act. This file states what was
> machine-verified, by whom, against what, and **what a human must still confirm before any pack ships**.

## Sign-off status: NOT SIGNED (research draft — no pack)

| Item | State |
|---|---|
| Endpoint discovery + reachability | **Machine-verified** (agent, 2026-07-23) — see `findings/CALIFICACION-ENDPOINT-PROBE.md §7` for copy-paste reproduction. |
| Numeric parameters (edificabilidad / plantas / ocupación / …) | **NOT verified** — scanned PDFs, not yet OCR'd. |
| Human sign-off | **Pending.** No human has reviewed the ordinance documents. |

## What WAS verified this session (agent, browser-UA curl, 2026-07-23)

1. `geoserver.pgou.coacordoba.org/geoserver` WFS 2.0.0 + WMS 1.3.0 return HTTP 200; provider = COACo.
2. `coaco:ordenanzas` = 453 calificación polygons; schema `{geom, ordenanza, et, sup_m2, link}`; 10 distinct
   calificación families; 15 distinct ordinance-PDF links.
3. `coaco:distritos` = 2 features (Sur, Noroeste) → pilot coverage, not the municipality; ordenanzas bbox
   ≈ 3.4×4.8 km, Σ sup_m2 ≈ 1.63 km².
4. `coaco:actuaciones` = 42 derived-planning ámbitos; direct-ordenanza polygons (453) ≫ derived ámbitos (42).
5. National SIU is live (`mapas.fomento.gob.es/arcgis`); clasificación for INE 14021 = 6 classes, in force;
   Planeamiento_Vigente = Plan General 2002. **No national calificación service exists.**
6. One ordinance PDF (`O_PAS2.pdf`) fetched: 762 KB, `%PDF-1.7`, HTTP 200; `pdftotext`→3 chars ⇒ scanned.

## What a HUMAN must confirm before a pack ships (the open gate)

1. **OCR fidelity of the 15 ordinance PDFs** — that extracted edificabilidad / nº plantas / ocupación /
   retranqueos / parcela mínima match the scanned source, per ordenanza. (These are legal numbers — no
   interpolation, no cross-ordinance borrowing.)
2. **Geometric-rule kind (C58 §2.2)** — confirm each ordenanza is coverage-and-FAR vs alignment vs setback.
   Do not assume; the wrong kind is worse than a wrong number.
3. **Coverage honesty** — that a pack labels itself as covering **only** Sur + Noroeste, and that clicks
   elsewhere degrade to SIU clasificación (land class), never a borrowed pilot number.
4. **Positional agreement** — a sample Catastro parcel classified by `coaco:ordenanzas` agrees with the
   municipal viewer for that same plot.
5. **PEPCH exclusion** — that the casco histórico (separate Plan Especial, dual regime) is explicitly out of
   scope, not silently mis-qualified by an adjacent ordenanza.

## Constraints honoured this session

- No edits to `registry.ts` / `index.ts`. No pack authored. No commit / push. Worktree-isolated.
- Every claim tiered VERIFIED-LIVE / COULD-NOT-VERIFY; no value interpolated.
