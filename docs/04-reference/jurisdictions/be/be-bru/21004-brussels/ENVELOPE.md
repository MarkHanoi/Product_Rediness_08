# ENVELOPE — Brussels (NIS 21004)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | federal CADMAP/CadGIS (AGDP) | ⚠️ national WFS verified-live 2026-07-24 but NOT wired into `parcelProviders/registry.ts` (no `isInBelgium` predicate) |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ none for Brussels |
| **S3 — zone source** | PRAS (`PERSPECTIVE_FR:Affectations`) | ⚠️ endpoint documented, bot-blocked, NOT wired into `siteDispatch.ts` |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for Brussels |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

**Structural blocker (Brussels-specific).** The buildable envelope is governed by **RRU Titre I**, the
one region-wide numeric-leaning text in Belgium, but its gabarit/implantation rules are **context-relative
prose formulas** (`H = P + 3.00 + D`, where P = rue width, D = parcel depth) held in a PDF regulation — not
a queryable attribute. Producing a parcel-level envelope requires:

1. A **new engine KIND** — a reference-formula gabarit (architecturally the same family as Paris's ADR-0274
   and Porto's *moda da cércea*): compute the envelope from prospect distance + street width + neighbour
   depth, not a lookup. `~20–25 dev-days` (`../../findings/ §B.1`).
2. A **PRAS / RRU / RRUZ / PPAS precedence check** — RRU Titre I is only the regional default; a locally
   adopted RRUZ or PPAS overrides it for specific districts. The instrument that actually governs must be
   resolved before any rule is applied.
3. Two mandatory **adjacent gates**: **CBS+** (Coefficient de Biotope par Surface — ecological-potential
   coefficient) and **TOTEM** (life-cycle comparison required for demolitions > 1,000 m²).

Above all, any Brussels envelope carries a **standing caveat**: a sourced RRU numeric value is legally
subordinate to the discretionary *bon aménagement des lieux* compatibility test (CoBAT/RRU practice), which
the engine cannot itself evaluate. No solver coverage can be measured until a pack (and the KIND) exist.
**Do NOT reuse another municipality's numbers** (C58 §1.2). See `LEGISLATION-RATE.md` for the mechanism.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./LEGISLATION-RATE.md`, `../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §A.4 / §B.1`.*
