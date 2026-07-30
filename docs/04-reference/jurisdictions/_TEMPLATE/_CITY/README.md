<!-- CITY DOSSIER TEMPLATE (C63 §5). Copy this `_CITY/` folder to
     jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/, replace every <PLACEHOLDER>,
     delete this comment. Folder name MUST be «code»-«slug» and MUST equal the pack
     `jurisdictionId` (jurisdictions/README.md join-key rule). -->
# <PLACE> (<code> <slug>, <REGION>, <COUNTRY>) — city dossier

**Level:** municipality · **id:** `<cc>-<subdiv>` region · `<code>` (INE/INSEE/DICOFRE/LAU) ·
**Pack id (== folder identity):** `<cc>-<code>-<slug>`
**Last updated:** <DATE> · **Maintainer:** <NAME/UNASSIGNED> · **Status:** <SCAFFOLD | IN PROGRESS | LIVE>

> This dossier is the evidence container C63 §5 mandates. Its scorecard face is **[`COMPLETION.md`](./COMPLETION.md)**
> (the 7-axis completion measure). The pack is CODE; this folder is its PROVENANCE.

## Required file set (C63 §5)

| File | Purpose | Feeds axis |
|---|---|---|
| [`COMPLETION.md`](./COMPLETION.md) | **the 7-axis completion scorecard (C63 face)** | — (composes all 7) |
| [`RATE.md`](./RATE.md) | structured dimensional-fill rate | LEGISLATION |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · TRIP-WIRES · resume steps | all |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height status | HEIGHTS/LOD |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | fail-safe risk log (honesty guardrails) | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | how to raise the rate | LEGISLATION |
| `sources/SOURCES.md` | per-field citations | LEGISLATION |
| `sources/VERIFICATION.md` | human sign-off (L-449; gates LEGISLATION/ENVELOPE `human-reviewed`) | LEGISLATION · ENVELOPE |
| `findings/` | substantive L-NNN investigation records | — |

<!-- The RATE / NEXT / ENVELOPE / HEIGHT / RISK-REGISTER / RATE-IMPLEMENTATION-PLAN / sources templates
     live one level up in `jurisdictions/_TEMPLATE/`. Copy them alongside this file. -->

## 1 — What governs here
- **Governing-instrument chain:** `parcel → <instrument> → <classification> → <article>`.
- **Rule KIND (ADR-0270 / C58 §2.2):** <setback | alignment | block-derived-alignment | tiered-occupation | coverage-and-far>.
- **Setback- vs alignment-governed:** <which, and why>.

## 2 — Pack status
| Zone / clau | Kind | Disposition (`pack`/`refusal`/`unregistered`) | Confidence | Note |
|---|---|---|---|---|
| `<zone>` | `<kind>` | `<disposition>` | `<structured/constructed/…/null>` | <…> |

## 3 — Open questions / unverified
> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.
- <…>

---
*Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md), `jurisdictions/README.md`, `JURISDICTION-PLAYBOOK.md`.*
