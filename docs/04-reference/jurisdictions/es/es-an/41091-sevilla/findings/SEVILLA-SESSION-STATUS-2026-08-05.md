# Sevilla — session status, 2026-08-05

> `SEVILLA_ENVELOPE_VERIFIED = true` — LIVE, deployed, testable today.

## Where things stand right now

15/15 live `zona_orden` zone codes transcribed and cited from the PGOU-2006 Texto Refundido.
**5 zones compute a real envelope today: `AD`, `UA`, `IS`, `IA`, `SA`.** The other 10 correctly
refuse — their governing article ties depth/setback to something not reducible to a flat number
(occupation-% caps, height-dependent separations, parcel-size-bracketed tables, or a fully graphic
plan-only figure).

**Verified test coordinate (real, proven end-to-end):** `37.377903, -5.915929` (`AD`,
Cerro-Amate district).

## What shipped this session

- `fix(sevilla): retry transient ArcGIS failures instead of surfacing service-error` (`8558d3ed`)
  — a dropped connection / 5xx / 429 from Sevilla's live zoning service used to surface as a hard
  refusal even for the 5 already-working zones. Now retried up to 3 attempts, bounded backoff,
  never retrying a real semantic error. Deployed and live.
- `fix(sevilla): add missing knownFacts to source-data-unavailable refusal` (`3d6dbbb3`) — a build
  gate fix, unrelated content bug caught by root `tsc`.
- `docs(sevilla): correct 5 stale 'zero transcribed' claims + full blocker audit` (`b78f5337`) —
  the refusal-card copy and several code comments still said *"PRYZM has not transcribed a single
  PGOU-2006 ordinance parameter"* — true two days earlier, false since the 15-zone pack shipped.
  Fixed (comments/copy only, no logic changed). Full audit of the 10 remaining refusals in
  [`SEVILLA-REMAINING-BLOCKERS-2026-08-05.md`](./SEVILLA-REMAINING-BLOCKERS-2026-08-05.md) — 12
  blockers total, this being #1 (closed).

## The follow-up engine-work pass — correctly built nothing, and that's the right outcome

A dedicated pass attempted, in order: **ST-A** (wire its setback to real cadastral parcel area),
**CJ/A/IC height** (does the M/CH/CT floor-count finding transfer?), and **the SB/M/ST-C/CH
geometry/occupancy solver**.

- **ST-A: the brief's own premise was wrong.** Art. 12.12.3 §2.3 ties the setback brackets to
  neighbouring *parcels* ("parcelas colindantes"), not the street — building it as briefed would
  have shipped a real bug (a fabricated or zero-value front setback) straight to production, since
  the gate is already live. Correctly declined.
- **CJ/A/IC height: 0 of 3 resolved.** The M/CH/CT "se fija en número de plantas" finding does not
  transfer — CJ cites a differently-named plan entirely, IC's convention is ambiguous. Honest,
  documented non-result.
- **The geometry solver: declined outright.** Its own inputs (height, mainly) are still legally
  unresolved — building a solver on top of unresolved inputs would be exactly the
  authored-but-unwired debt this repo already tracks elsewhere.

Full detail, article citations, and the reasoning behind each: see
[`SEVILLA-REMAINING-BLOCKERS-2026-08-05.md`](./SEVILLA-REMAINING-BLOCKERS-2026-08-05.md).

## What's still genuinely open

- The `altura_max` field's unit (metres vs. floor-count) is real progress, not closed: 3 zones'
  own articles confirm a floor-count convention textually, but the live ArcGIS field itself still
  carries no domain/metadata, and the convention isn't uniform across all zones. Closing this
  fully would unlock height on up to 3 more zones at once.
- 4 zones need a genuine geometry/occupancy solver (`SB`, `M`, `ST-C`, `CH`) — shared engineering
  work with Córdoba's own MC-zone footprint blocker, not Sevilla-specific.
- 2 zones (`MP`, `CT`) are blocked on a **policy decision**, not missing data — the geometry
  already exists and is wired, sitting behind a preview-only flag
  (`isUncertifiedPreviewModeActive()`).
