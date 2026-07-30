# LEGISLATION-RATE — Copenhagen / København (kommune 0101)

> Structured legislation / data-fill rate (C58 comparable ruler; feeds C63 Axis 2). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Rate: `not-assessed` (`pending-implementation`) — but on a LIVE, keyless, `structured` national source

Denmark is the **ceiling exemplar** jurisdiction: zoning is resolved by `DkZoningProvider` +
`mapPlandataToZoningRecord` over the **keyless national Plandata WFS** (`server/plandataZoningProxy.js`),
returning zone/use code + `bebygpct` (FAR) + `maxbygnhjd`/`maxetager` (height/storeys) as machine-readable
fields — C58 fidelity-1 `structured`, no PDF read. The **national** number is ~96 % digital-data /
~87 % pure-structured byzone fill (`dk/RATE.md`, L-609/L-611, live-verified 2026-07-23).

**Why this cell is still `not-assessed`, not ~96 %:** the C63 Axis-2 ruler is *per-city verified-cited
clauses* (cited `SOURCES.md` rows ∩ signed `VERIFICATION.md` ÷ the clau inventory), and:

1. **No per-city clau audit** has been run for the 0101 extent — the ~96 % is the *country* prior, not
   Copenhagen's measured fill (borrowing it here would be the §CONTEXT-DATA-HONESTY country-borrow trap).
2. **The L-449 human sign-off is PENDING** — `dk/sources/VERIFICATION.md` still carries 2 open legal items
   (the §USABLE-FALLBACK instrument-precedence + byggefelt bindingness). C63 §1.6 forbids reporting
   `human-reviewed` without it, so no `structured` confidence may be laundered into a completion number yet.

**What would move it:** run the byzone click-weighted fill measurement scoped to the 0101 bbox, cite the
per-clau values in a city `sources/SOURCES.md`, and land the Danish-planner sign-off (`VERIFICATION.md`).

*Cross-refs: C58, C63 §3 Axis 2, `../../RATE.md` (national legislation-fill — legacy filename, pending
rename to `LEGISLATION-RATE.md` per L-649), `./RATE.md`.*
