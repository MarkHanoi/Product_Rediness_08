# RATE-IMPLEMENTATION-PLAN — València (INE 46250)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

The three cheap axes are already assessed; this plan drives the four human-gated axes off `not-assessed`.

| Phase | Axis (weight) | Action | Gate |
|---|---|---|---|
| P1 | DATA-SOURCES (15) | confirm the per-city MDS height bbox | probe |
| P2 | TERRAIN (10) | run `terrain.verify.mjs` round-trip for `valencia` → lift rung 50→100 | decoder pass |
| P3 | HEIGHTS/LOD (10) | land the per-city MDS re-bake + probe the provenance histogram | `tagged` fraction |
| P4 | PARCEL (15) | run `computeParcelConfidence` over an N-parcel sample in the 46250 bbox | sample distribution |
| **P4.5** | **(no axis — gate only)** | **Planning GIS Intelligence: Madrid-style endpoint reconnaissance** | **recon verdict** |
| P5 | LEGISLATION (25) | source the governing instrument + zones → cite `sources/SOURCES.md` → sign `VERIFICATION.md` | L-449 |
| P6 | ENVELOPE (20) | author `es-46250-valencia` rule pack once P5 lands | C58 certifiability |

The expensive axes (LEGISLATION 25 · ENVELOPE 20) are the human-gated sourcing cost — the whole
differentiator. They are LAST because they cannot be automated.

## P4.5 — Planning GIS Intelligence (added 2026-07-31)

**Why it exists.** Madrid's reconnaissance *inverted* its implementation strategy: it looked like a
PDF-centric city, and the probe found public ArcGIS services carrying zoning, planning areas, and
machine-readable NZ1 envelope geometry — turning it from "manual legal extraction" into "GIS-first
plus legal compilation". València has had no equivalent probe. Running P5/P6 first risks paying the
expensive human-gated cost against the wrong strategy.

**This phase scores no points and must not move the RATE.** It is a *gate*: its output decides
whether P5 is an ordinance-extraction project or a GIS-linkage project. Budget 1–2 days.

Deliverables — identify every planning service · every layer · every field · every coded value ·
every spatial relationship · every planning hierarchy · **whether parcel joins are spatial or
key-based** · whether any machine-readable rule geometry exists.

**Start from the known Spanish signals rather than a blank slate** — layer/field heuristics
`CALIFICACION`, `ZONIFICACION`, `ORDENANZA`, `NORMA`, `AMBITO`; Madrid's proven pair `AMB_TX_ETIQ`
(zone code) / `AMB_TX_DENOM` (official designation); and València's derived-plan instruments `PRI`
and `PEPRI` as a direct probe target for the refusal path.

**Instrument the probe.** Record which heuristics hit and which missed — not just the final answer.
València is the cheapest available test of whether Spanish planning-GIS knowledge actually transfers
between cities, and that result governs how the remaining Spanish rollout is planned.

**Caveat on the current axis stars.** Any València "official GIS / planning ordinance" confidence
recorded today is a **Spain-wide prior, not a 46250-specific finding**. Until P4.5 runs, treat GIS
zoning, buildable envelope, machine-readable rules, and rule hierarchy as **Unknown** — a
partial-confidence rating here reads as "nearly confirmed" and is exactly the failure-vs-empty
conflation this repo has been bitten by before.

*Source: [`findings/SOURCE-founder-valencia-recon-first-2026-07-31.md`](./findings/SOURCE-founder-valencia-recon-first-2026-07-31.md);
Madrid precedent in [`../../es-md/28079-madrid/findings/`](../../es-md/28079-madrid/findings/).*

*Cross-refs: C63 §4, C58, `./RATE.md`.*
