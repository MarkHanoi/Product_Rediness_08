# LEGISLATION-RATE — Helsinki (kuntanumero 091)

> Structured legislation/data-fill rate (feeds C63 Axis 2). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
> Naming: [`../../../_TEMPLATE/NAMING-CONVENTION.md`](../../../_TEMPLATE/NAMING-CONVENTION.md).

## Headline: inherits the NATIONAL prior — no Helsinki-specific probe run

**No Helsinki-specific structured-fill audit has been executed.** Helsinki inherits Finland's national prior
(see [`../../RATE.md`](../../RATE.md)):

| Scenario | Rate | Basis |
|---|---|---|
| Ryhti live regions (if `_ix_` collections carry index + attributes) | **~55–65 % (est.)** | `kaavatietomalli` OGC API — endpoint VERIFIED-LIVE; item schema unconfirmed |
| Non-Ryhti regions | **~30–35 %** | asemakaava PDF/legacy |

Helsinki sits in Uusimaa, a Ryhti-live region with the richest municipal open-GIS estate in Finland, so its
true rate likely sits at the upper end — **but the Ryhti item-level property schema is unconfirmed and this
MUST NOT be reported as a measured value.** Until a per-plan structured-code count is run, the Axis-2 score in
`RATE.md` stays `not-assessed` (`pending-implementation`) — this prior is the coarse input, never the
L-449-verified count.

**Resume:** resolve the Ryhti item-level property schema for a Helsinki asemakaava (the binary GeoJSON
payload); count structured provisions (use / density [tehokkuusluku] / height [kerrosluku]) per plan; record
in `sources/SOURCES.md`; sign `sources/VERIFICATION.md`.

*Cross-refs: `../../RATE.md`, C58, C63 §3 Axis 2.*
