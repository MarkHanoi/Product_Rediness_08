# 🇪🇸 Spain — Founder Blockers (offline actions to advance the RATE)
> Living doc · orchestrator-maintained · reflects [MASTER-ROI-TRACKER](../../../03-execution/plans/MASTER-ROI-TRACKER.md) §0.5/§1. Lists ONLY what the FOUNDER can do offline. Code-only moves noted as "no founder action needed."

**Status:** 🟡 founder-can-act-now

## Founder action items
| # | Blocker | Type | Status | Exact action | Where / link | Unblocks (axis → effect) |
|---|---|---|---|---|---|---|
| 1 | Madrid legislation extraction template is authored (Barcelona-format) but the numeric values are the human-gated ~65%. | legislation-sourcing | open | **Fill the Madrid legislation extraction template** from the **PGOUM Compendio 2024**: FAR/edificabilidad, height, setbacks, coverage — **per zone, article-cited**. | [RATE plan §Phase-A](./RATE-IMPLEMENTATION-PLAN.md) · tracker §0.5 (Madrid row) | LEGISLATION (25, heaviest axis) → Madrid off `not-assessed` toward measured |
| 2 | The MDS metro-heights code landed (`3d687f22`) but the re-bake needs a bucket to write to. | credential | open | **Provide a Cloudflare R2 write credential** so the MDS metro-heights re-bake + `buildings` upload can be realised. | tracker §0.5 (Spain row) · §2 (rank 7) | HEIGHTS/LOD → 6 metro capitals (Madrid/Valencia/Sevilla/Málaga/Zaragoza/Bilbao) flip estimated→measured |

## Code-only moves (no founder action — for reference)
- MDS Edificación measured-height join **LANDED** (`3d687f22`) — 6 capitals priority-stamped + uncapped; buildings stay *estimated* until the re-bake + R2 upload runs (needs credential #2).
- Madrid legislation extraction template authored (docs, in-flight); Barcelona = done template (only rendering envelope pack, 4 packs).

## Locked decisions (this session)
- **Barcelona = done template** — the only city with a rendering envelope pack (founder, prior).
- **Madrid = lead legislation city** after Barcelona (founder, 2026-07-30, tracker §0.5).
