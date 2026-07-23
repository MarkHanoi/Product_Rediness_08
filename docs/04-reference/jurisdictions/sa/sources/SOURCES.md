# Saudi Arabia (`sa`) — national per-field sources

**Status:** PARTIAL → UPGRADED. The national footprint values are read from the primary decision, and
as of L-606 (2026-07-23) the per-field **CLAUSE NUMBERS are now machine-transcribed** from the PDF
(column below). The ONLY remaining `structured`-tier gate is the human `VERIFICATION.md` sign-off
(playbook §3.4 / L-449) — until a person signs, the Riyadh pack ships `estimated-ruleset`, NOT
`structured`.

## A — VERIFIED (national values the Riyadh pack sets) — clause-cited
| Field (pack key) | Value | Unit | Governing clause | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `setback.front` (formula) | `max(w/5, 3)` | m | **§4-1 cl. 4** (villa) / **§4-2 cl. 4** (apt) / §4-3 cl. 4 (admin) | اشتراطات إنشاء المباني السكنية, قرار 1/4500943139, 1446 H (≈21 Jul 2024) | momah.gov.sa (200, PDF, 5,084,557 B) · mirror balady.gov.sa | `published` |
| `setback.side` / `setback.rear` (formula) | `max(w/5, 2)` | m | **§4-1 cl. 4 / §4-2 cl. 4** | same | same | `published` |
| front floor, wide street | `≥ 6` (subsumed by `max(w/5,3)`) | m | **§4-1 cl. 5** (villa, streets ≥ 30 m) | same | same | `published` |
| `maxCoverage` (villa, ground) | `0.75` | ratio | **§4-1 cl. 1** | same | same | `published` |
| `maxCoverage` (apartment, ground) | `0.65` | ratio | **§4-2 cl. 1** (comm) / §4-3 cl. 1 (admin) | same | same | `published` |
| upper-floor coverage / annex | `0.75` / `0.70 of floor beneath` | ratio | **§4-1 cl. 2–3 / §4-2 cl. 2–3** | same | same | `published` |
| `permittedUse` | `residential` | — | **§3-1..§3-4** (classes) | same | same | `published` |
| **NATIONAL height CEILING — villa** | **`≤ 14`** | m | **§5-1-5 cl. 3** (+ §2 definition of total height) | same | same | `published` |
| **NATIONAL floor CEILING — villa** | **`≤ ground+1+annex`** | floors | **§3-1** ("بحد أقصى دورين وملحق علوي") | same | same | `published` |
| **NATIONAL height CEILING — apartment** | **`≤ 23`** | m | **§3-2 / §3-3 / §3-4** (+ §2 high-rise def, §1-1 exclusion) | same | same | `published` |

> Two independent government hosts serve the identical decision (momah + balady) — a primary-source
> corroboration, not four news outlets descended from one. Extraction: PyPDF, Arabic glyphs reversed
> on extraction, digits transliterated; page-cited in `../SAUDI-PRIMARY-DECISION-EXTRACT.md`.

## B — UNVERIFIED / open (stays `null` in the pack)
| Field | Why not verified | What would verify it |
|---|---|---|
| `maxHeight_m`, `maxFloors` — the **EXACT** value | The national CEILING is verified (§A). Only the EXACT permitted value *beneath* the cap is municipal (approved plan §4 cl. 1) + development-authority override (§1 cl. 3). Reachable per-zone sources are geo-fenced. | An in-SA read of the Riyadh RCRC/ADA per-zone height table, OR a MOMRAH/Balady data agreement (Balady `NOOFFLOORS` field). ⚠ The CEILING itself is NOT open — it is cited in §A. |
| `plotRatioFAR` | Does NOT exist in the residential regime (0 hits for معامل البناء). | — (it is a genuine absence; the "FAR 3" figure is a commercial/hotel doc). |
| per-field clause NUMBERS | ✅ **NOW TRANSCRIBED** (L-606, machine, from the primary PDF — see §A). | ☐ The remaining gate is the **human `VERIFICATION.md` sign-off** (playbook §3.4 / L-449) — a person confirming the transcription against the document. This is the LAST step to `structured`. |

⚠ Neighbour-waiver mechanic — appears only in secondary sources, NOT the primary decision. Research
note, never a shippable field.
