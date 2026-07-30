# NEXT — Bern (BFS 0351, canton BE, Switzerland)

> Where we stopped on Bern, exactly why, and what to do next. **Last updated:** 2026-07-30 ·
> **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD (C63 Phase-1 audit)

## 1 — WHERE WE STOPPED (the one-paragraph truth)
Bern is bake-covered and cadastral-capable, so the three cheap axes are cited-derived (DATA-SOURCES 80 ·
TERRAIN 50 · CONTEXT 56 → overall 66 % partial). On LEGISLATION it sits slightly BELOW the CH national floor
because canton BE is in the geodienste `incomplete` cohort (zone-ID leans on ÖREB BE). No Bern FAR/height
catalogue exists — the next gain is a DIFFERENT kind of work (confirm ÖREB BE, then transcribe + sign the
City Bauordnung, the Zürich play).

## 2 — THE NUMBER
**Overall 66 %** on the ASSESSED subset (DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56; weights 15/10/5 →
19.8/30). PARCEL/LEGISLATION/ENVELOPE/HEIGHTS `not-assessed` (typed reasons in `RATE.md`), NOT 0 %.

## 3 — BLOCKERS
### 3.1 — Canton BE is `incomplete` in the national WFS (LEGISLATION · DATA-SOURCES)
- **What it is.** geodienste `ms:grundnutzung` coverage is partial for BE (BE/GR/SO/VS cohort).
- **Why it blocks.** The strongest national zone-ID win is only partial for Bern.
- **THE EXACT RESUME STEP.** Confirm the ÖREB BE endpoint URL + probe one `extract` for a Bern parcel → firm
  the zone-ID; check whether canton BE populates the optional INTERLIS `Typ.Nutzungsziffer`.

### 3.2 — No BE buildable-envelope pack (LEGISLATION + ENVELOPE)
- **THE EXACT RESUME STEP.** Transcribe the City of Bern Bauordnung + BE BauG height/AZ, human-verify, sign
  `../../sources/VERIFICATION.md`, register a BE city pack (mirror `chZurichBzo.ts`).

### 3.3 — HEIGHTS nDSM not baked (§SWISS-NDSM-STAC-BUILD)
- **THE EXACT RESUME STEP.** Once the shared swisstopo nDSM STAC join is built (Zürich `NEXT.md §3.4`),
  re-bake `bern` + probe the provenance histogram.

### 3.4 — TERRAIN unverified
- **THE EXACT RESUME STEP.** `terrain.verify.mjs --tileset <bern>` round-trip → rung 50 → 100.

## 4 — TRIP-WIRES
- **4.1 — If canton BE enters the geodienste `full` cohort** → re-derive DATA-SOURCES zone-GIS (may firm).
- **4.2 — If the swisstopo nDSM STAC join lands for ANY CH city** → port to Bern (§3.3).
- **4.3 — If canton BE's INTERLIS `Typ.Nutzungsziffer` is found populated** → FAR becomes a cheap harvest.

## 5 — WHAT IS ALREADY BUILT (do not redo)
- National swisstopo AV parcel routing; the national zone-ID + cited-refusal pack (`chZoning.ts`); the bake +
  terrain REGIONS rows for `bern`.

## 6 — VERIFIED SOURCES
| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| ÖREB BE (federal M2M list) | ÖREB cadastre zone-ID | document (endpoint listed) | canton BE among 25/26 federal M2M URLs |
| geodienste `ms:grundnutzung` (BE) | zone code | partial (`incomplete` cohort) | BE not in the `full` 19-canton set |
| STAC `ch.swisstopo.swissalti3d` | DTM COG tiles | VERIFIED-LIVE | HTTP 200, EPSG:2056 |

## 7 — DEAD ENDS
- Expecting full national WFS zone coverage for BE → it is `incomplete` (use ÖREB BE).

## 8 — THE SMALLEST NEXT STEP that moves the number
`terrain.verify.mjs` the `bern` tileset (§3.4) — the cheapest single move (TERRAIN 50 → 100 = +5 pts on that
axis), no new sourcing.
