# Risk register — Zürich (BFS 0261)

> The honesty guardrails: every way this city's data could silently mislead, and the fail-safe that keeps it
> honest. A risk is CLOSED only when the fail-safe is in place. Not scored; it protects `honestyOk` (C63 §3.1).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk (how it could silently lie) | Axis affected | Fail-safe (what keeps it honest) | Status |
|---|---|---|---|---|
| R1 | Footprint-fallback parcel presented as cadastral | PARCEL | CH routes to `swisstopo-av` (real Grundstück + EGRID, all-canton); NOT a footprint. C57 §L-640 cap N/A. | CLOSED |
| R2 | Fabricated 9 m height rendered as measured | HEIGHTS/LOD | swisstopo nDSM is measured-CAPABLE but UNBAKED → region keeps the honest OSM/`assumed` default, never a stamped fake (§SWISS-NDSM-STAC-BUILD); L-647 tier renders `assumed` distinctly. | OPEN (capability, not measurement) |
| R3 | **`VERIFICATION.md` sign-off is internally CONTRADICTORY** — top says "✅ SIGNED OFF 2026-07-26 · CH_FAR_CERTIFIED ON"; the per-parcel "Zürich BZO sign-off" line is UNSIGNED with open items (URLs NOT CONFIRMED; crosswalk not human-CONFIRMED) | LEGISLATION · ENVELOPE | LEGISLATION/ENVELOPE stay `not-assessed` — the scorecard does NOT credit a contradictory sign-off as `human-reviewed`; the number waits for the reconciliation (`NEXT.md §3.1`). No completeness laundered from an ambiguous gate. | **OPEN** |
| R4 | Guessed BZO regime → fabricated height (W2bIII 8.5 m 91/99 vs 9.0 m 2016) | ENVELOPE · HEIGHTS | `resolveZurichBzoRegime` REFUSES `regime-ambiguous` on any parcel it cannot place; the OFF-state refusal surfaces BOTH heights. A refusal, never a guess. | CLOSED (fail-safe live) |
| R5 | `estimated-ruleset` values shown as authoritative `structured` | LEGISLATION · ENVELOPE | Pack ships at `confidence: 'estimated-ruleset'` (transcribed, not a live feed) — labelled below `structured`; C58 tier surfaced in the render. | CLOSED |
| R6 | Treating the national ~20–25 % (or the ~85 % context number) as the Zürich Axis-2 score | LEGISLATION | `LEGISLATION-RATE.md` states the ~25–35 % city semi-structured band explicitly; the ~85 % is a DIFFERENT (context-data) ruler, flagged in `../../RATE.md`. | CLOSED |
| R7 | Claiming TERRAIN is verified | TERRAIN | Rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. | OPEN (rung-capped) |
| R8 | Over-claiming zone-GIS as `live` | DATA-SOURCES | City BZO WFS rated `documented` (0.5) — the `/api/ch/zurich-bzo` proxy + CSP wiring is unlanded (`resolveZurichBzoZone` → `endpoint-unreachable`). | CLOSED (rated documented) |

## Trip-wires
- If the `VERIFICATION.md` sign-off is reconciled + signed → R3 CLOSES, Axis 2/4 can move to `human-reviewed`.
- If the docid-6808 regime doc lands → the `regime-ambiguous` refusal fraction drops (R4 scope shrinks).
- If the swisstopo nDSM join bakes → R2 closes (measured heights replace the `assumed` default).

---
*Authority: C63 §3.1 (honesty companion) · §CONTEXT-DATA-HONESTY · C58 (fidelity tiers). Protects: `RATE.md honestyOk`.*
