# NEXT — Genève (BFS 6621, canton GE, Switzerland)

> Where we stopped on Genève, exactly why, and what to do next. **Last updated:** 2026-07-30 ·
> **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD (C63 Phase-1 audit)

## 1 — WHERE WE STOPPED (the one-paragraph truth)
Genève is bake-covered and cadastral-capable, so the three cheap axes are cited-derived (DATA-SOURCES 80 ·
TERRAIN 50 · CONTEXT 56 → overall 66 % partial). It inherits the CH national floor on LEGISLATION/ENVELOPE:
zone IDENTITY is strong (geodienste GE `full` + ÖREB GE RDPPF live) but there is no Genève FAR/height
catalogue — the next gain is a DIFFERENT kind of work (transcribe + sign the GE gabarit, the Zürich play).

## 2 — THE NUMBER
**Overall 66 %** on the ASSESSED subset (DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56; weights 15/10/5 →
19.8/30). PARCEL/LEGISLATION/ENVELOPE/HEIGHTS `not-assessed` (typed reasons in `RATE.md`), NOT 0 %.

## 3 — BLOCKERS
### 3.1 — No GE buildable-envelope pack (LEGISLATION + ENVELOPE)
- **What it is.** Only the national cited-refusal pack covers GE; no transcribed indice/gabarit.
- **Why it blocks.** Envelope refuses; Axis 2 count is the national floor.
- **THE EXACT RESUME STEP.** Transcribe the canton GE LCI/PLQ gabarit + indice d'utilisation, human-verify,
  sign `../../sources/VERIFICATION.md`, register a GE city pack (mirror `chZurichBzo.ts`).

### 3.2 — HEIGHTS nDSM not baked (§SWISS-NDSM-STAC-BUILD)
- **THE EXACT RESUME STEP.** Once the shared swisstopo nDSM STAC join is built (see Zürich `NEXT.md §3.4`),
  re-bake `geneva` + probe the provenance histogram. Ports for free.

### 3.3 — TERRAIN unverified
- **THE EXACT RESUME STEP.** `terrain.verify.mjs --tileset <geneva>` round-trip → rung 50 → 100.

## 4 — TRIP-WIRES
- **4.1 — If the swisstopo nDSM STAC join lands for ANY CH city** → port to Genève (§3.2).
- **4.2 — If canton GE's INTERLIS `Typ.Nutzungsziffer` slot is found populated** → FAR becomes structured DATA
  via the per-canton harvest (§3.1 cheaper path).
- **4.3 — If a GE RDPPF SOAP `extract` is decoded** → confirm whether it carries any numeric AZ/height.

## 5 — WHAT IS ALREADY BUILT (do not redo)
- National swisstopo AV parcel routing (GE live-verified 2026-07-26); the national zone-ID + cited-refusal
  pack (`chZoning.ts`); the bake + terrain REGIONS rows for `geneva`.

## 6 — VERIFIED SOURCES
| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| geodienste `ms:grundnutzung` (GE) | zone code + label + main-use | VERIFIED-LIVE (national) | canton GE in the `full` cohort |
| `ge.ch/terecadastrews/RdppfSVC.svc` | ÖREB/RDPPF cadastre | VERIFIED-LIVE | WCF SOAP service page + WSDL |
| STAC `ch.swisstopo.swissalti3d` | DTM COG tiles | VERIFIED-LIVE | HTTP 200, EPSG:2056 |

## 7 — DEAD ENDS
- Expecting a structured FAR/height in the national geodienste WFS → there is none (Outcome B).

## 8 — THE SMALLEST NEXT STEP that moves the number
`terrain.verify.mjs` the `geneva` tileset (§3.3) — the cheapest single move (TERRAIN 50 → 100 = +5 pts on
that axis), no new sourcing.
