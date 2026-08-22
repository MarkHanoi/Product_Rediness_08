# ADR-0352 — A room minimum is a LEGAL statement, so it is keyed by jurisdiction and never travels without its instrument

- **Status:** Accepted
- **Date:** 2026-08-22
- **Lane:** JURIS11
- **Trigger (founder, verbatim, 2026-08-22):** *"please — do a big audit — the minima should be
  defined by the building regulations of the country — document in contracts, specs and adr — check
  jurisdiction folder and bring this data in the algorithm — for each country"*.
- **Follows:** [`d11c225d`](../../04-reference/ISSUE-LOG.md) (§BEDROOM-MINIMA-ARE-JURISDICTIONAL,
  L-4210) — the founder's ruling that `master` 12 → 8 m² and `bedroom` 11.5 → 7.5 m². That commit
  named this defect (*"THE REAL DEFECT IS THAT THIS TABLE HAS ONE COLUMN … Recorded, NOT solved:
  L-4211"*). **This ADR is L-4211's answer** — and it also records that the ruling itself never
  reached the gate that refused him (§2).
- **Adds:** `packages/ai-host/src/workflows/apartmentLayout/rules/habitability/{types,standards,
  coverage,resolve,index}.ts`, `apps/editor/src/ui/apartment-layout/resolveHabitabilityBinding.ts`,
  `packages/ai-host/__tests__/habitabilityMinima.test.ts`,
  `apps/editor/__tests__/habitabilityJurisdictionIds.test.ts`.
- **Amends in place:** `apartmentLayout/rules/programRules.ts` (the ROOM_RULES header — a false
  provenance claim, deleted), `apartmentLayout/types.ts`, `proceduralLayout.ts`, `generate.ts`,
  `tgl/{bubbleGraph,enumerate,runDeterministicLayout}.ts`, `packages/ai-host/src/index.ts`,
  `packages/ai-host/package.json` (a `./habitability` **exports** subpath — no dependency change, so
  `pnpm-lock.yaml` is untouched), `apps/editor/src/ui/apartment-layout/gatherLayoutPayload.ts`,
  `packages/ai-host/__tests__/tglBubbleGraph.test.ts` (three literal-asserting tests repaired).
- **Commits:** `0c14d0d6` (module + wiring), `3856e6a8` (37 assertions + the anti-drift gate).
- **Spec:** [SPEC-HABITABILITY-MINIMA](../../03-execution/specs/SPEC-HABITABILITY-MINIMA.md).
- **Contracts:** **C83 §6.1** (amended — this discharges the *layout* half of the migration that
  paragraph records as owed, and finds THREE more rival tables it did not name), **C19 §"out of scope"**
  (amended — the *"Future contract (TBD)"* row for jurisdiction building-code databases now points
  here), **C58 §1.4 / §CONTEXT-DATA-HONESTY** (the cite-or-refuse discipline, applied to a second
  corpus), **C62** (the confidence / typed-unknown vocabulary this composes), **C60 §2** (state a
  fact once and assert every copy against it — the anti-drift gate), **C66 §1.1** (nothing may be
  described as regulation-compliant for a country it has not been checked against).
- **Issue-log:** L-4400 … L-4417.
- **⚠ Numbering:** `ls docs/02-decisions/adrs/ADR-0352*` → *No such file* at the moment of writing;
  `ls adrs/ADR-*.md | wc -l` → **284**. 0352 taken on that basis. The repo carries pre-existing
  duplicate ADR numbers (see ADR-0351's note); this is not one of them.

---

## §1 — The decision

**A minimum habitable room area is a statement about what the law of a place requires of someone's
home. PRYZM will therefore never state one without also stating what imposes it — or stating plainly
that nothing does.**

Concretely, four rules, each enforced by construction rather than by convention:

1. **Keyed by jurisdiction.** A room minimum resolves as
   `(jurisdiction, roomType) → { minAreaM2, minShortSideM, provenance, confidence }`. There is no
   API that returns a room minimum without a jurisdiction argument being at least *offered*.
2. **Provenance travels with the number.** There is no path in the module that yields a bare
   `number` with no `RoomMinimumProvenance` attached. A value with no cited instrument is
   `confidence: 'pryzm-default'` and **must say so wherever it is used, including in the refusal
   sentence the layout engine prints**. That was the founder's actual complaint: a foreign number
   wearing the word *"mandatory"*.
3. **Exactly one fallback, and it is named.** `PRYZM_BASELINE`. It declares **no** jurisdiction key,
   so it can never *win* a match — it is only ever the terminal rung of the ladder, and every
   resolution reports which rung answered.
4. **Cite or say UNKNOWN.** `null` means *"no instrument in this repo states a minimum for this room
   type here"*. It is never zero, never "unconstrained", and never a licence to interpolate from a
   neighbouring country.

---

## §2 — ⭐ The finding that outranks the feature: the founder's own ruling never reached the gate

`d11c225d` edited `ROOM_RULES.master.minAreaM2` from 12 to 8, after his real 81 m² Barcelona plate
produced ZERO layouts with the refusal *"master 9.3 m² vs 12 m² minimum"*.

**The gate that emits that sentence reads a different table.**
`tgl/enumerate.ts`'s §DIAG-MIN-AREA-GATE called `dimensionsFor(type).areaMin` from
`dimensions/roomDimensions.ts`, whose `master.areaMin` is **12** and `bedroom.areaMin` is **9**,
untouched since `9396069c`. So the 12 in his refusal was still 12 the moment after his fix shipped.
**Committed ≠ reachable.**

The measurement that proves it was a by-product: re-pointing that gate at the habitability authority
made the `dimensionsFor` import **unused** — root `tsc` TS6133. The comfort framework was doing
exactly one job in that file, and that job was deciding *"not buildable"*.

### §2.1 — And the two tables were never reconcilable by picking one

`roomDimensions.ts` is PRYZM's **comfort** framework — `areaComfortableMin/Max`, aspect bands,
`usableWallMin`. Its own header claims *"the framework's minima are AT OR ABOVE programRules's"*, an
invariant the founder's ruling **inverted** for `master` and `bedroom`. A comfort preference is not
a habitability law and must not decide "not buildable". So:

- the **HARD** min-area reject keys on the habitability authority (jurisdictional, instrument
  attached);
- `roomDimensions` is **untouched** and keeps its real consumers — `validateRoomShape.ts` and
  `subdivide.ts` — where it expresses quality, which is what it is for.

### §2.2 — There are FIVE rival minima tables in this repo, not two

| # | Table | `bedroom` | `living` | Cited as | Jurisdiction-aware? |
|---|---|---:|---:|---|---|
| 1 | `apartmentLayout/rules/programRules.ts` `ROOM_RULES[*].minAreaM2` | 7.5 | 14 | *"UK Building Regs / HQI mandatory"* (**false** — see §3) | now, via this ADR |
| 2 | `apartmentLayout/dimensions/roomDimensions.ts` `ROOM_DIMENSIONS[*].areaMin` | 9 | 14 | framework §5.4 | no |
| 3 | `apps/editor/src/ui/house-layout/houseExecDiagnostics.ts` `AREA_MIN` | 9 | 14 | *"Mirror of ROOM_DIMENSIONS"*, hand-copied | no |
| 4 | `packages/constraint-solver/src/ConstraintEngine.ts` `MIN_AREA_M2` | 7.5 | 11 | *"UK Part M"*, rendered as a **regulation** | no |
| 5 | `SPEC-ARCHITECTURAL-PROGRAM-RULES.md` §2 | 9 | 18 | a NORMATIVE SPEC claiming supremacy over the code | no |

C83 §6.1 already names **#4** as an owed migration. It does not name #1–#3, and **#5 had never been
counted**. **Five tables, five answers, one question** — the same shape CLAUDE.md records for the
three rival `commandManager` counters. This ADR closes #1, re-points the hard gate off #2 and deletes
#5's numeric columns; **#3 and #4 remain open** and are logged (L-4415, L-4416).

⭐ **#5 deserves its own line.** It is a SPEC, it is NORMATIVE, and its header says *"when code
disagrees with this table, the code is wrong"* — so under the repo's conflict order it was declaring
the founder's own ruling of 2026-08-22 to be a bug. Its `area`/`short` columns were **deleted, not
corrected**: a document that states a jurisdictional number cannot help but rot, and correcting it
would only have reset the clock (L-4417).

---

## §3 — What the old provenance actually said, and why every clause mattered

`ROOM_RULES`'s header read: *"Numeric minima below are the UK BUILDING REGULATIONS / HQI mandatory
values."* Three of its four claims were false:

- **"Building Regulations"** — the bedroom pair (11.5 / 7.5 m², 2.75 / 2.15 m) is the **Nationally
  Described Space Standard**, not the Building Regulations.
- **"mandatory"** — NDSS is a **planning** standard that binds only where a local authority has
  adopted it in its Local Plan. HQI is a **defunct Housing Corporation funding** standard. BS 8300
  (the bathroom rows) is an **accessibility design** standard. None of the three is mandatory, even
  in England.
- **"UK"** — the only true clause, and the entire defect, in a product whose first market is
  Catalonia.

A wrong citation is worse than none: it is the thing that made *"below the 12 m² minimum"* sound
like law to the person reading it.

---

## §4 — ⛔ NO SECOND RESOLVER. The rejected alternative, and why

The obvious implementation is a small `latLonToCountry()` helper next to the layout engine. **It was
rejected outright.**

PRYZM already has exactly one geography resolver: `resolveRegisteredJurisdictionAt(lat, lon)` in
`@pryzm/site-parcel-data/rulepacks/registry.ts`. It carries the §JURISDICTION-SPECIFICITY
finest-claim-wins rule, and — decisively — an explicit **`'ambiguous'` arm that REFUSES rather than
picking**, because *"picking one is a confident answer under the wrong ordinance"*. A second resolver
would not have that arm, would not know that `BARCELONA_BBOX` contains four other municipalities
(the L-652 defect), and would drift from the first the day either changed.

So the binding is produced by that resolver, at the composition surface, and the layout engine
consumes plain strings.

## §5 — …and NO import from the layout engine to the zoning registry either

`registry.ts` pulls 40+ rule packs and OpenTelemetry. Importing it into
`apartmentLayout/rules/habitability/` would break the purity `programRules.ts` declares (*"ZERO
imports except the RoomType vocabulary"*) and bloat the layout bundle with the whole zoning corpus.

The chosen shape:

```
apps/editor (L7)  ── resolveRegisteredJurisdictionAt ──▶  @pryzm/site-parcel-data (L2)
        │
        └── HabitabilityBinding (plain strings) ─────▶  @pryzm/ai-host/habitability (pure)
```

**A string coupling with no gate is drift with a delay**, so
`apps/editor/__tests__/habitabilityJurisdictionIds.test.ts` asserts, in CI, that every jurisdiction
key the habitability registry declares is a real registered `jurisdictionId` (or a **declared**
exception with a written reason), and that the mirrored `HabitabilityExtent` vocabulary is identical
to the registry's `JurisdictionExtentResolution`. This is C60 §2 identity discipline: state a fact
once, and assert every copy against it.

### §5.1 — The regional-instrument problem, and the trade-off taken

The resolver returns the **finest** claim. For a Barcelona parcel that is `es-08019-barcelona`, not
`es-ct-catalunya` — but Decret 141/2012 governs the whole of Catalonia. Deriving *"this municipal id
is in Catalonia"* would be a second geography resolver by another name.

**So a regional instrument ENUMERATES the municipal registrations it governs, as data.** A Catalan
municipality registered later and not added to that list falls to the named PRYZM baseline **and says
so** — the fail-safe direction: a disclosed default, never a foreign law asserted. The enumeration is
gated (every literal is checked against the live registry), so a typo is a CI failure rather than a
mis-cited parcel.

---

## §6 — What was seeded, and what was REFUSED

| Jurisdiction | Instrument | Confidence | Binding force | Rooms |
|---|---|---|---|---|
| `es-29067-malaga` | PGOU Texto Refundido, NNUU Título XII **Art. 12.2.35** (2018-02) | **`primary-in-repo`** | mandatory | master 12 · bedroom 8 · kitchen 7 · open_plan 16 (+3.0 m) · bathroom 3 · ensuite 3 · wc 1.5 |
| Catalonia (7 keys) | **Decret 141/2012** (DOGC 6245), Annex 1 | `instrument-cited` | mandatory | master 8 · bedroom 6 |
| `gb-eng` | **NDSS** ¶10 (2015-10-01) | `instrument-cited` | **conditional** | master 11.5 / 2.75 · bedroom 7.5 / 2.15 |
| — | `PRYZM_BASELINE` | `pryzm-default` | guidance | **derived from `ROOM_RULES`**, never retyped |

⭐ **The Málaga row is the argument.** Its text was already in this repo, and it requires a **12 m²**
principal bedroom — the exact number the founder ruled OUT for Catalonia. **Both are correct law.**
One column cannot express that, and no amount of care in choosing "the" value would have.

⛔ **Twelve countries were REFUSED a number.** `coverage.ts` carries all fifteen
`docs/04-reference/jurisdictions/<cc>/` folders as machine-readable rows with a `form`, a `gapKind`
(`not-fetched` vs `fetched-not-extracted` — **opposite fixes**), a named instrument to chase, and an
evidence path. Not one value was invented. **An invented habitability minimum is an invented legal
claim about someone's home**, and there is nowhere in the data shape to put a number without an
instrument, an article and a date.

---

## §7 — The audit's finding: this was a BUILD, not a WIRE

Two measurements over `docs/04-reference/jurisdictions/` (2026-08-22):

- a habitability-vocabulary sweep across the whole tree → **3 files**;
- `find {be,ch,de,dk,fi,fr,gb,it,nl,no,pt,sa,se,us} -type f \( -name '*.txt' -o -name '*.pdf' \)` →
  **0 files**.

**Fourteen of the fifteen country folders hold no primary legal text at all.** The jurisdictions tree
and the fifteen `server/jurisdiction/` proxies are a **planning/envelope** corpus — zoning, cadastre,
buildable envelope, heights. They were never a habitability corpus, and between them they contain one
habitability figure, in Málaga, by accident of it living inside a PGOU.

*"Bring this data into the algorithm"* therefore had no data to bring for 14 of 15 countries. Saying
so is the single most valuable output of the audit; the alternative — quietly seeding plausible
numbers — is the failure mode this ADR exists to make structurally impossible.

---

## §8 — Consequences

**Accepted:**

- The hard min-area gate changes threshold for six room types (the deltas are tabulated in
  L-4409). Two get **stricter** (`kitchen` 5.5 → 6, `dining` 8 → 9) as a consequence of ROOM_RULES
  becoming the single habitability baseline. This is disclosed, not hidden; it is the price of one
  authority instead of two, and it is measured: **zero new test failures** (A/B by revert-and-rerun,
  9 failures at `HEAD~1`, the same 9 after).
- Two Spanish jurisdictions now disagree inside one country. That is correct and permanent.
- `ES-CT` and `GB-ENG` ship at `instrument-cited`, i.e. **not verified against primary text**. Every
  sentence built from them carries that warning inline. This is weaker than a determination and
  stronger than a UK number in Spain.

**Owed (logged, not solved):**

- The Málaga `salón-comedor` figure scales with bedroom count (16/18/20/24); this table has no
  bedroom-count axis and carries the floor (L-4408 note in the spec, §6).
- Rival tables **#3** (`houseExecDiagnostics.AREA_MIN`) and **#4** (`ConstraintEngine.MIN_AREA_M2`)
  are untouched — L-4415, L-4416. #4 is the one C83 §6.1 already records as owed, and it is the more
  urgent of the two because it renders its numbers **as regulations, in the user-facing rule panel**.
- `minShortSideM` is regulated in only two of the seeded rows. Everywhere else the width applied is
  PRYZM's, and the sentence says so.
