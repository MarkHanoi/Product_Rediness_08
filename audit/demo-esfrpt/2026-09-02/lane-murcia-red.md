# LANE MURCIA-RED — the 8-failed murcia suite: PRE-EXISTING since 2026-08-04, not today's wave

**Date:** 2026-09-02 · **Suite:** `apps/editor/__tests__/murciaSiteDispatch.test.ts` (8 failed /
1 passed at HEAD `23890d56`) · **Verdict: PRE-EXISTING — first red 2026-08-04, four weeks before
the E9 wave. No fix made (per brief rule e).** · **No commit made.**

## Verdict in one line

A click on the founder's Murcia parcel (Churra, 38.0061 N, −1.138028 W) is routed to the
**Molina de Segura** research-pending refusal, because `MOLINA_DE_SEGURA_BBOX` overlaps the
northern band of `MURCIA_BBOX`, the parcel sits inside the overlap, and `siteDispatch.ts` checks
`isInMolinaDeSegura` **before** `isInMurcia`. `/api/es/murcia-pgou` is never called; every
disposition assertion downstream fails. The E9 national-jurisdiction wiring (`c5d0109c`) is
**exonerated** — the red predates it by four weeks and the resolver behaves correctly at this
coordinate.

## Bisect — executed in DETACHED scratch worktrees, foreground, proofs verbatim

| SHA | date | murcia suite | evidence |
|---|---|---|---|
| `2c528a62` (docs/cordoba) | 08-04 14:00 | **9 passed (9)** — LAST GREEN | worktree run: `Tests  9 passed (9)` |
| `8b1d859b` (feat es-cn/telde) | 08-04 14:32 | **FIRST RED (broken-import)** | static: adds the `isInMolinaDeSegura` dispatch branch to `siteDispatch.ts` AND the barrel export in `site-parcel-data/src/index.ts` (+72), but `git ls-tree 8b1d859b -- …/providers/molinaDeSeguraBbox.ts …/rulepacks/esMolinaDeSegura.ts` → **empty**: the re-exported modules do not exist at this SHA, so any import of `@pryzm/site-parcel-data` fails at collection |
| `dafc9493` (feat es-mc: Lorca/Molina/Alcantarilla/Las Torres) | 08-04 14:42 | **8 failed \| 1 passed — FIRST MECHANISM-RED** | worktree run: `expected 'molina-de-segura-research-pending' to be 'RR'` — the exact HEAD token |
| `8febc2a6` (pre-wave boundary, 09-01) | 09-01 23:06 | 8 failed \| 1 passed | worktree run: same token `'molina-de-segura-research-pending'` |
| `23890d56` (HEAD) | 09-02 | 8 failed \| 1 passed | foreground repro, same token |

Worktrees: `C:/ClaudeWorktrees/murcia-bisect-{8feb,dafc,parent}` — `git worktree add <sha>
--detach` + `pnpm install --frozen-lockfile --prefer-offline`, removed after. No `git stash`
anywhere.

**First-red SHA: `8b1d859b` (2026-08-04). First coherent (routing) red: `dafc9493`
(2026-08-04).** The pair is one interleaved es-mc lane — `8b1d859b`'s title says telde but its
diff carries the es-mc dispatch branch and barrel exports ahead of the modules `dafc9493`
supplies ten minutes later, so neither SHA alone is a coherent tree.

**Owner:** the es-mc research-pending lane (`dafc9493`, "Lorca/Molina de Segura/Alcantarilla/Las
Torres de Cotillas — cited refusals, no rulepack", 2026-08-04) — it introduced the Molina row +
bbox + dispatch branch whose bbox swallows Murcia's own pedanía band. The ES-SIU lane's guess
(the "Murcia disposition registry… sibling lanes committed to today, `b78f5337`/`db91ae55`") is
wrong twice: those SHAs are 2026-08-04/05, not today's, and neither is the mechanism.

## Mechanism, exactly

1. `MURCIA_BBOX` = 37.71–38.12 × −1.39…−0.85 (OSM relation 340611, rounded outward).
   `MOLINA_DE_SEGURA_BBOX` = 38.00–38.28 × −1.28…−1.13 (Nominatim, rounded outward).
   **Overlap band: lat 38.00–38.12 × lon −1.28…−1.13** — real Murcia-municipality land (the
   northern pedanías: Churra, El Puntal…), including the founder's parcel and the suite's
   query centroid (§L-521 parcel-area centroid ≈ 38.0062, −1.1379 — inside the band either way).
2. `apps/editor/src/ui/site/siteDispatch.ts` `applyZoning()` is an ORDERED if-chain;
   the §RESEARCH-PENDING Molina branch (line ~2176) sits ABOVE the §MURCIA-ENVELOPE branch
   (line ~2217). In the overlap band Molina fires first, dispatches
   `buildRefusedEnvelope('molina-de-segura-research-pending', …)` and RETURNS.
   `applyMurciaZoningThenFallback` has exactly one call site — below — so no Murcia code runs
   and `/api/es/murcia-pgou` is never fetched (the suite's ROUTES assertion fails with
   `expected undefined to be defined`).
3. Why no suite caught it on 08-04: `molinaDeSeguraSiteDispatch.test.ts` probes (38.15, −1.2),
   which is OUTSIDE `MURCIA_BBOX` (maxLat 38.12) — the one point class that cannot collide; and
   the murcia suite was not re-run by that lane. The 1 murcia test that still passes ("NEVER
   draws an extrudable volume") passes vacuously — a research-pending refusal also carries no
   numbers.
4. `murciaBbox.ts`'s own header names the correct disambiguator and the trap: the bbox "is NOT
   the municipality test of record… The AUTHORITATIVE municipality answer comes from Catastro
   itself (`cp`+`cm` → INE 30030). Route from that where it is available." The dispatch chain
   routes from bboxes alone, so ANY overlapping municipal boxes make the answer an ordering
   accident. Same class as the resolver defect L-12871 closed nationally ("bbox = pre-filter
   only") — this is its SUB-NATIONAL sibling, unfixed.

## The E9 suspect — exonerated by direct probe

`resolveNationalJurisdiction(38.0061, −1.138028)` at HEAD →
`{"ok":true,"iso3":"ESP","regionCode":"ES","basis":{"kind":"polygon-containment","dataset":
"natural-earth-vector / ne_10m_admin_0_countries",…,"nearestRivalIso3":"MAR",
"nearestRivalDistanceM":325391,"toleranceM":1500}}` and `resolveParcelCandidates` returns
`[{id:'catastro', kind:'cadastral'}]` — the ES claim keeps the Spanish cadastre in the pool; no
casing/shape mismatch. And the red reproduces byte-identically at `8febc2a6`, which predates
`c5d0109c` entirely. **Nothing in production regressed by the deployed E9 commit on this axis.**

## Consequences the owner should weigh (not acted on here, per brief)

- **The product defect is live and user-visible since 2026-08-04:** any parcel in Murcia's
  northern pedanías band (lat ≥ 38.00, lon −1.28…−1.13) — including the founder's own parcel —
  gets the Molina de Segura "not researched" card instead of the Murcia PGOU path (SIG-MU1's
  signed RL renders, the derived-plan refusals, the cited RR card). That is a coverage
  REGRESSION on signed land, and on the founder's demo parcel.
- **The CI implication is its own finding:** the editor `test:ci` surface has carried this red
  since 08-04, yet SHAs since then are deployed (405e2156 live). Un-verified inference — either
  the required job has been red-and-ignored (push-to-main + `bypass_ci_gate` deploys), or some
  run-level skip exists that this lane did not find. Whoever owns CI health should read the
  actual run history rather than this line.
- **Root-fix direction (for the owner):** order-independent municipal routing — resolve the INE
  code (Catastro `cp`+`cm`, already documented in `murciaBbox.ts` as the test of record) or
  point-in-municipal-polygon BEFORE the research-pending bbox branches; bbox stays a pre-filter.
  The five es-mc boxes (Lorca/Molina/Alcantarilla/Las Torres/Cartagena) + Murcia should route
  by INE, not by chain position — the L-12871 invariant applied one level down. An interim
  band-aid (carving the overlap out of `MOLINA_DE_SEGURA_BBOX`, or moving the Murcia branch
  above the four research-pending ones) would fix the founder's parcel but leave the class —
  every future overlapping municipal box re-creates it.
- The ISSUE-LOG should carry an L-row for this (append-only; left to the orchestrator with the
  other doc edits — this lane's brief is findings-only, no commit).

## Files touched by this lane

- `audit/demo-esfrpt/2026-09-02/lane-murcia-red.md` — this file. **Nothing else** (no fix: the
  red is pre-existing before `8febc2a6`, so brief rule (e) applies).
