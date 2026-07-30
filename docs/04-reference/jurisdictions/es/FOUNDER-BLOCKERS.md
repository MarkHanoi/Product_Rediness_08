# 🇪🇸 Spain — Founder Blockers (offline actions to advance the RATE)
> Living doc · orchestrator-maintained · reflects [MASTER-ROI-TRACKER](../../../03-execution/plans/MASTER-ROI-TRACKER.md) §0.5/§1. Lists ONLY what the FOUNDER can do offline. Code-only moves noted as "no founder action needed."

**Status:** 🟡 founder-can-act-now

> **Reframe (2026-07-30):** Madrid legislation is **not** days of founder data-entry. An extraction agent can **draft** every value *from the PGOUM Compendio 2024*, article-cited; the founder's role collapses to **REVIEW + SIGN-OFF**. Legal values **never ship on an agent's word** — each stays `DRAFT` until founder-verified against the ordinance. This is the [[legislation-factory]] pattern: *founder approves, doesn't type.*

## Founder action items
| # | Blocker | Type | Status | Exact action | Deliverable | Unblocks (axis → effect) |
|---|---|---|---|---|---|---|
| 1 | Madrid legislation — **numeric values** (highest-weight axis, 25%) | legislation sign-off | 🔴 open | **Review the agent-drafted extraction** from the PGOUM Compendio 2024 (per Norma-Zonal grade: FAR/edificabilidad, height, floors, coverage, front/rear/side setbacks, `fondo edificable`) — **confirm or correct each value against the cited article.** Start with NZ 4 (dominant residential), then NZ 5/7/8. | Founder-signed Madrid legislation pack | LEGISLATION (25) → Madrid `not-assessed` → measured |
| 2 | Legislation QA / provenance | verification | 🔴 open | For every value: confirm the **article + paragraph citation** resolves and the unit is right; resolve any conflicting/ambiguous provision. "**Article-cited or it doesn't ship.**" | Verified, traceable pack | prevents wrong buildability numbers |
| 3 | Cloudflare R2 write credential | credential | 🟡 open | Provide a **write-scoped** R2 token (bucket · endpoint · Access Key ID · Secret) so the MDS metro-heights re-bake can upload PMTiles/buildings. *(A) already own R2 → scoped token; (B) I guide you from zero, ~10 min; (C) temp S3/Backblaze/MinIO.)* **Prefer write-only, one bucket, no-delete.** | Working R2 destination | HEIGHTS/LOD → 6 metro capitals estimated→measured |

## Deliverable templates
**A · Madrid legislation (per zone/grade):** `Zone · official designation · FAR · max height · max floors · coverage · front/rear/side setback · fondo edificable · Ordinance · Article · Paragraph · Confidence`. Every numeric value traceable to the ordinance.
**B · R2 credential:** `Bucket · Endpoint · Access Key ID · Secret Access Key` (or scoped API token).

## Code-only moves (no founder action — for reference)
- ✅ MDS Edificación measured-height join **LANDED** (`3d687f22`) — 6 capitals priority-stamped/uncapped.
- ✅ Madrid legislation extraction **template** authored (`383992a3`); ✅ Barcelona template + rendering envelope pack (4 packs).
- ⏳ After R2 cred: re-bake metro heights → upload PMTiles + buildings → publish tiles.
- ⏳ Agent-draft of Madrid values (from the Compendio) — *pending founder go; then founder reviews (#1).*

## Suggested next milestone — industrialize (don't hand-do city #3)
After Madrid reaches *measured*, build the **[[legislation-factory]]**: reusable extraction schema → article/unit validation rules → ingestion into the canonical rule model → version control. Then each new city is a **legal-extraction + founder-review** exercise, not software work. Also build the **municipal-legislation acquisition master table** (per city: ordinance · official GIS · API · update-frequency · machine-readable? · status) so no city is detective-work.

## Locked decisions (this session)
- **Barcelona = reference implementation** (only rendering envelope pack).
- **Madrid = first expansion city**; **Barcelona template reused** for every subsequent city.
- **Legislation = highest-weight axis (25%)**; heights become *measured* only after the R2-backed re-bake.
- **Legal values ship only on founder sign-off** — agent drafts, founder approves.
