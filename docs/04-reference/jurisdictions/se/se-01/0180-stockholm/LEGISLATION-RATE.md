# LEGISLATION-RATE — Stockholm (kommunkod 0180)

> Structured legislation/data-fill rate (feeds C63 Axis 2). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
> Naming: [`../../../_TEMPLATE/NAMING-CONVENTION.md`](../../../_TEMPLATE/NAMING-CONVENTION.md).

## Headline: inherits the NATIONAL prior — no Stockholm-specific probe run

**No Stockholm-specific structured-fill audit has been executed.** Stockholm inherits Sweden's national
prior (see [`../../RATE.md`](../../RATE.md)):

| Scenario | Rate | Basis |
|---|---|---|
| Post-2022 plans (optimistic) | **~40 %** | NGP STAC/OAPIF + Planbestämmelsekatalog structured provision codes |
| Land-area-weighted (conservative) | **~20–30 %** | pre-2022 scanned plans dominate land area |

Stockholm is the national capital with the densest post-2022 detaljplan activity, so its true rate likely
sits at the upper end of the band — **but this is NOT probed and MUST NOT be reported as a measured value.**
The national feed (NGP) is geo-blocked from non-SE IPs; a live per-plan count for Stockholm needs an
SE-resident proxy. Until then the Axis-2 score in `RATE.md` stays `not-assessed` (`pending-implementation`) —
this prior is the coarse input, never the L-449-verified count.

**Resume:** live-probe a Stockholm post-2022 detaljplan via NGP from an SE IP; count structured provision
codes (use/FAR-or-coverage/height) per plan; record in `sources/SOURCES.md`; sign `sources/VERIFICATION.md`.

*Cross-refs: `../../RATE.md`, C58, C63 §3 Axis 2.*
