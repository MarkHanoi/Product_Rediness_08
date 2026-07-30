<!-- P0 SCAFFOLD TEMPLATE — copy this whole folder to jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/
     then replace every <PLACEHOLDER>. Delete this comment when you do.
     The standard is docs/04-reference/standards/JURISDICTION-PLAYBOOK.md. This is a MUNICIPALITY README;
     a country or region README is the same shape, minus the parcel/pack-specific rows. -->
# <PLACE> (<CODE> <slug>, <REGION>, <COUNTRY>) — what is true now

**Level:** municipality · **ISO/statistical id:** `<cc>-<subdiv>` region · `<code>` municipality (INE /
INSEE / DICOFRE / LAU) · **Pack id (must equal folder identity):** `<cc>-<code>-<slug>`
**Last updated:** <DATE> · **Maintainer:** <NAME/UNASSIGNED> · **Status:** <SCAFFOLD | IN PROGRESS | LIVE>

## 1 — What governs here
- **Governing-instrument chain:** `parcel → <instrument> → <classification> → <article>`.
- **Rule KIND (ADR-0270 / C58 §2.2):** <setback | alignment | block-derived-alignment |
  tiered-occupation | coverage-and-far>. ⚠ The wrong KIND is a wrong SHAPE, not a wrong number — no
  confidence chip corrects it. State it explicitly.
- **Setback-governed vs alignment-governed:** <which, and why>.
- **Legal-structure trap watch (P1):** is any share of the land governed by *derived* plans the base
  plan does not contain? <yes/no — the % if measured; this is where Barcelona's 62.8% trap lives>.

## 2 — Pack status
| Zone / clau | Kind | Disposition (`pack` / `refusal` / `unregistered`) | Confidence | Note |
|---|---|---|---|---|
| `<zone>` | `<kind>` | `<disposition>` | `<structured/constructed/…/null>` | <…> |

Refusal vocabulary in use: <legal · coverage-gap · construction-incomplete · regime-undetermined>.

## 3 — Granularity (C58 §1.11)
State the granularity of EACH number: parcel / block / sector / ámbito / municipality. A sector-level
FAR presented as a parcel FAR is a category error, not an imprecision. <…>

## 4 — The number
**<X>%** of <private-buildable | all> clicks return a full, cited envelope. **Denominator named:**
<exactly which set>. **<Y>%** get a true answer OR a correct cited refusal. (P8 — see `NEXT.md` §2.)

## 5 — Files in this folder
- `RATE.md` — the composite master completion scorecard (7 C63 axes — the "master RATE"; see `../NAMING-CONVENTION.md`).
- `LEGISLATION-RATE.md` — the structured legislation/data-fill rate (feeds the LEGISLATION axis).
- `LOD-RATE.md` — the building/terrain LOD rate (feeds the HEIGHTS/LOD axis).
- `RATE-IMPLEMENTATION-PLAN.md` — the phased climb to raise the master RATE.
- `NEXT.md` — where we stopped, blockers, TRIP-WIRES, resume steps.
- `sources/SOURCES.md` — per-field citations (the trust gate).
- `sources/VERIFICATION.md` — the human sign-off.
- `findings/` — the substantive L-NNN investigation records.
- `archive/` — superseded handoffs + one-shot sourcing prompts.

## 6 — Open questions / unverified
> Research notes that cannot yet be cited go HERE under this explicit heading — never in `SOURCES.md`.
- <…>
