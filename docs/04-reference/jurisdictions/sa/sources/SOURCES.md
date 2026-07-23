# Saudi Arabia (`sa`) — national per-field sources

**Status:** PARTIAL. The national footprint values are read from the primary decision (`published`
tier), but the per-field CLAUSE NUMBERS are not yet human-transcribed, and no `VERIFICATION.md`
sign-off exists — so the Riyadh pack ships `estimated-ruleset`, NOT `structured` (playbook §3.3 / L-449).

## A — VERIFIED (national values the Riyadh pack sets)
| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `setback.front` (formula) | `max(w/5, 3)` | m | 2024 MOMRAH decision, Ch. 4 §4.2 (villa p18, apt p22) | اشتراطات إنشاء المباني السكنية, قرار 1/4500943139, 1446 H (≈21 Jul 2024) | momah.gov.sa (200, PDF, 5,084,557 B) · mirror balady.gov.sa | `published` |
| `setback.side` / `setback.rear` (formula) | `max(w/5, 2)` | m | Ch. 4 §4.2 | same | same | `published` |
| front floor, wide street | `≥ 6` (subsumed by `max(w/5,3)`) | m | Ch. 4, villa p18 cl. 5 | same | same | `published` |
| `maxCoverage` (villa, ground) | `0.75` | ratio | Ch. 4, p18 | same | same | `published` |
| `maxCoverage` (apartment, ground) | `0.65` | ratio | Ch. 4, p22 | same | same | `published` |
| upper-floor coverage / annex | `0.75` / `0.70 of floor beneath` | ratio | Ch. 4, pp18/22 | same | same | `published` |
| `permittedUse` | `residential` | — | Ch. 3 (classes, pp12–15) | same | same | `published` |

> Two independent government hosts serve the identical decision (momah + balady) — a primary-source
> corroboration, not four news outlets descended from one. Extraction: PyPDF, Arabic glyphs reversed
> on extraction, digits transliterated; page-cited in `../SAUDI-PRIMARY-DECISION-EXTRACT.md`.

## B — UNVERIFIED / open (stays `null` in the pack)
| Field | Why not verified | What would verify it |
|---|---|---|
| `maxHeight_m`, `maxFloors` | Not national — municipal approved plan (Ch. 4 §4.1) + development-authority override (Ch. 1 §1). Reachable per-zone sources are geo-fenced. | An in-SA read of the Riyadh RCRC/ADA per-zone height table, OR a MOMRAH/Balady data agreement (Balady `NOOFFLOORS` field). |
| `plotRatioFAR` | Does NOT exist in the residential regime (0 hits for معامل البناء). | — (it is a genuine absence; the "FAR 3" figure is a commercial/hotel doc). |
| per-field clause NUMBERS | Read as page positions, not transcribed clause-by-clause; blocks the `structured` tier. | A human clause-by-clause transcription pass + `VERIFICATION.md` sign-off. |

⚠ Neighbour-waiver mechanic — appears only in secondary sources, NOT the primary decision. Research
note, never a shippable field.
