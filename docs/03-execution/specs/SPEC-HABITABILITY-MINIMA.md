# SPEC — Habitability Minima: the jurisdiction resolution ladder, the data shape, and the per-country audit

| Field | Value |
|---|---|
| Status | **Normative.** §2–§5 are BUILT and gated (commits `0c14d0d6`, `3856e6a8`). §6 is the AUDIT — a measurement, re-runnable, not a plan. |
| Version | 1.0 (2026-08-22, lane JURIS11) |
| Ratified by | [ADR-0352](../../02-decisions/adrs/ADR-0352-habitability-minima-are-jurisdiction-keyed-and-carry-their-instrument.md) |
| Governed by | **C58 §1.4 / §CONTEXT-DATA-HONESTY** (cite or refuse; a failure and an empty are different values) · **C62** (confidence + typed-unknown vocabulary) · **C60 §2** (state a fact once, assert every copy) · **C66 §1.1** (nothing is "compliant" for a country it was not checked against) · **C83 §6.1** (the boundary this partially discharges) |
| Cross-refs | [SPEC-APARTMENT-LAYOUT-GENERATOR](./SPEC-APARTMENT-LAYOUT-GENERATOR.md) · [SPEC-ARCHITECTURAL-PROGRAM-RULES](./SPEC-ARCHITECTURAL-PROGRAM-RULES.md) · [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](./SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md) · [ENVELOPE-CAPABILITY-MATRIX](../../04-reference/jurisdictions/ENVELOPE-CAPABILITY-MATRIX.md) (the sibling matrix, for the ENVELOPE corpus) |
| Issue-log | L-4400 … L-4417 |

> **The one question this spec answers:** *when PRYZM tells an architect a room is "below the
> minimum", whose number is it quoting, and can that be checked?*

---

## §1 — The rule, stated once

**A minimum habitable room area is a legal statement about someone's home.** Getting it wrong in the
permissive direction is worse than refusing to answer; getting it wrong in the restrictive direction
is what produced zero layouts on the founder's real Barcelona plate (L-4210). Therefore:

1. **Cite or say UNKNOWN.** Never interpolate between countries. Never let one country's figure
   stand in for another's.
2. **Provenance travels with the number.** No API in this subsystem returns a bare `number`.
3. **Exactly one fallback, named `PRYZM_BASELINE`, never silently substituted.** Every resolution
   reports the rung that answered.
4. **An unknown reads UNKNOWN.** `null` is not zero and is not "unconstrained".

---

## §2 — The data shape

`packages/ai-host/src/workflows/apartmentLayout/rules/habitability/`. Pure data + pure predicates;
the only import is the `RoomType` vocabulary.

```
HabitabilityStandard
  standardId          'es-29067-malaga-pgou-2018'
  displayName         'Málaga — PGOU Normas Urbanísticas Art. 12.2.35'
  countryCode         'es'                     (ISO 3166-1 alpha-2, lowercase)
  extent              'municipal'              (mirrors JurisdictionExtentResolution — §4.3)
  jurisdictionKeys    ['es-29067-malaga']      (registry jurisdictionId literals — §4.2)
  rooms               Partial<Record<RoomType, RoomMinimum>>   ← SPARSE ON PURPOSE
  notCovered          string[]                 ← silence stated, so it is not read as permission

RoomMinimum
  minAreaM2           number | null            ← null = the instrument states NONE
  minShortSideM       number | null            ← independent of the above
  provenance          RoomMinimumProvenance
  instrumentRoomTerm  'dormitorio'             ← the ordinance's OWN word, so the mapping is checkable
  mappingNote         string | null            ← set when the mapping is a JUDGEMENT, not a translation

RoomMinimumProvenance
  instrument          the citation as it would appear in a planning submission
  article             'Art. 12.2.35.1.2 c)' | null
  instrumentDate      '2018-02'
  sourcePath          repo-relative path to the primary text | null
  sourceToChase       ALWAYS populated — a verified number still needs a re-check path
  confidence          'primary-in-repo' | 'instrument-cited' | 'pryzm-default'
  bindingness         'mandatory' | 'conditional' | 'guidance'
```

### §2.1 — `confidence`, and why the first two must never be flattened

| Value | Means | Consequence |
|---|---|---|
| `primary-in-repo` | The instrument's own text is on disk at `sourcePath` and the number was read from it. | Falsifiable. Quotable as a determination. |
| `instrument-cited` | The instrument is NAMED (title + article + date); its text is **not** here. | A **candidate**. Every sentence built from it carries *"NOT been verified against its primary text — treat it as a candidate"*. |
| `pryzm-default` | No instrument at all. | **Never a legal claim.** The sentence says so twice. |

`confidence === 'primary-in-repo'` **⟺** `sourcePath !== null`, asserted in CI. A top-confidence
claim with no cited file is unfalsifiable, which is the state this subsystem exists to refuse.

### §2.2 — `bindingness` is not decoration

The UK NDSS is **not** building regulation; it binds only where a local planning authority has
adopted it in its Local Plan. Printing its 11.5 m² as *"the minimum required"* in a borough that has
not adopted it is the same class of error as printing it in Barcelona. So NDSS ships `conditional`,
Málaga and Catalonia ship `mandatory`, and the PRYZM baseline ships `guidance`.

---

## §3 — The resolution ladder

Input: a `HabitabilityBinding` — `{ jurisdictionId, countryCode, regionKey, resolution }` — all
plain strings, produced at the composition surface (§4).

```
1. jurisdictionId   'es-29067-malaga'      → tier 'jurisdiction'
2. regionKey        'es-ct'                → tier 'region'
3. countryCode      'gb'                   → tier 'country'
4. PRYZM_BASELINE                          → tier 'pryzm-baseline'   (terminal; never matched by key)
```

### §3.1 — ⭐ The ladder is applied PER FIELD, not per room

`minAreaM2` and `minShortSideM` each take the **finest instrument in the chain that actually states
them**, and each carries its own provenance.

This is a legal choice, not an implementation convenience. Under a per-**room** rule, a municipal
ordinance that states an area and is silent on width would knock a real *regional* width out and
substitute a PRYZM default — **a regulation lost to a default**, the permissive-direction error.

Consequence, visible in the shipped data: Málaga regulates bedroom **area** (8 m²) and states no
bedroom **width**. `resolveRoomMinimum('bedroom', málaga)` returns
`{ areaIsRegulated: true, shortSideIsRegulated: false }`, and the sentence discloses the mix.

### §3.2 — `ABSENT` is byte-identical, and it is not "the UK"

An omitted binding resolves to `PRYZM_BASELINE`, whose values are **derived from `ROOM_RULES`**, so
an un-migrated call site is byte-identical to the pre-L-4400 engine. That is what makes the optional
argument safe to roll out one seam at a time. Absent means *"PRYZM does not know where this is"* —
never "anywhere", never "unconstrained", and never the previous default of England.

### §3.3 — The baseline is DERIVED, never retyped

`PRYZM_BASELINE.rooms` is built from `ROOM_RULES` at module load. When the founder next rules on a
PRYZM default he edits `ROOM_RULES` and the fallback follows in the same commit. A hand-copy would go
red on the first divergent ruling — asserted for every `RoomType` in CI.

> ⚠ **The edge is ONE-WAY.** `habitability/standards.ts` imports `programRules.ts`; `programRules.ts`
> must **never** import `habitability/`. A circular barrel resolves to `undefined` at module load and
> produces the white screen this repo has already paid for.

---

## §4 — Where geography becomes a jurisdiction

### §4.1 — ⛔ There is ONE resolver and this subsystem does not add a second

`resolveHabitabilityBinding(lat, lon)` (`apps/editor/src/ui/apartment-layout/`) calls
**`resolveRegisteredJurisdictionAt(lat, lon)`** — the same §JURISDICTION-SPECIFICITY resolver the
zoning/envelope dispatch uses, with finest-claim-wins and an explicit **`'ambiguous'` arm that
REFUSES rather than picking**.

Its three non-resolved outcomes are carried as *different facts*, because they have different fixes:

| `resolution` | Means | What the user is told |
|---|---|---|
| `resolved` | one registration is strictly finest | the instrument, or a disclosed default if it is silent |
| `none` | no registration claims this point | the PRYZM baseline, labelled |
| `ambiguous` | two registrations tie | the PRYZM baseline, labelled — PRYZM will not guess which ordinance governs |
| `not-asked` | no site origin pinned (or the 0,0 sentinel) | the PRYZM baseline, labelled |

### §4.2 — The key vocabulary, and the gate that stops it drifting

Where a registered zoning jurisdiction exists, a standard's key **is that registration's
`jurisdictionId` literal**. Where none exists (England; the `es-ct` regional alias) the key is the
`docs/04-reference/jurisdictions/` folder key, and it must appear on a **declared exception list with
a written reason** in `apps/editor/__tests__/habitabilityJurisdictionIds.test.ts`.

That test is the anti-drift gate. It asserts, in CI:
- every key is a real registration or a declared exception;
- every declared exception is *still* genuinely absent from the registry;
- the mirrored extent vocabulary is element-for-element identical to the registry's;
- a **property** quantified over every shipped registration: the adapter's answer equals the
  registry's answer at the centre of every registered extent.

### §4.3 — The regional-instrument enumeration, and its known limitation

The resolver returns the **finest** claim, so a Barcelona parcel resolves to `es-08019-barcelona`,
not to Catalonia. A regional instrument therefore **enumerates the municipal registrations it
governs, as data** (Decret 141/2012 lists seven keys).

> ⚠ **KNOWN LIMITATION, DISCLOSED.** A Catalan municipality registered for zoning *later* and not
> added to that list falls to the named PRYZM baseline **and says so**. That is the fail-safe
> direction — a disclosed default, never a foreign law asserted — but it is a manual step, and it is
> the price of not minting a second geography resolver (ADR-0352 §5.1).

---

## §5 — What the user is told

`provenanceSentence(resolved, placeLabel)` has **no arm that omits the instrument**.

- **Regulated:** *"Minimum 12.0 m² for "dormitorio" under Plan General de Ordenación Urbanística de
  Málaga … Art. 12.2.35.1.2 c) (2018-02) — a mandatory requirement in Málaga — PGOU Normas
  Urbanísticas Art. 12.2.35."*
- **Regulated but unverified:** the above, plus *"⚠ This value is cited from the named instrument but
  has NOT been verified against its primary text in this repo — treat it as a candidate, not a
  compliance determination."*
- **Area regulated, width not:** plus *"(The 2.15 m minimum width applied alongside it is a PRYZM
  default — this instrument states no width for this room.)"*
- **Unregulated:** *"⚠ The 8.0 m² figure is a PRYZM engineering default, NOT a regulation of
  \<place\>. No habitability standard is loaded for \<place\>, so PRYZM is not telling you what the
  law there requires."* — the negative stated twice, deliberately.

### §5.1 — And the verdict changes with the authority

The strip slicer used to end its refusal *"…below the N m² minimum this room type requires. **This
layout is not buildable as drawn.**"* — a flat legal claim. It now asserts unbuildability **only when
the figure is a regulation**; against a PRYZM default it drops to `severity: 'warning'` and says
*"PRYZM is NOT telling you this is illegal where you are building — only that it falls short of our
own default."* Telling an architect their plan is unbuildable on the strength of our own preference
is the same error inverted, and it is still an error.

### §5.2 — Where it is enforced in the algorithm

| Seam | File | Was | Now |
|---|---|---|---|
| bubble-graph absolute area floor | `tgl/bubbleGraph.ts` | `rule.minAreaM2` | `roomMinima(type, opts?.habitability).minAreaM2` |
| **HARD min-area reject** | `tgl/enumerate.ts` §DIAG-MIN-AREA-GATE | `dimensionsFor(type).areaMin` ⛔ | `roomMinima(type, input.habitability).minAreaM2` |
| strip-slicer band widths + shortfalls | `proceduralLayout.ts` | `ROOM_RULES[t]` | `resolveRoomMinimum(t, habitability)` |
| the decline sentence | `generate.ts` `declineToLimitation` | bare pairs | pairs + one attribution per distinct room type |

**The sizing allocator and the hard reject now read the SAME authority.** Before this they did not —
see §6.4.

---

## §6 — THE AUDIT (measured 2026-08-22, lane JURIS11 — re-run it, do not trust it)

### §6.1 — The two commands, and the number that matters

```bash
# (a) habitability vocabulary across the WHOLE jurisdictions tree
rg -il "superficie útil mínima|superficies útiles mínimas|dormitorio|habitabilit|habitatge|\
Mindestgröße|surface habitable minimale|woonoppervlak|habitabilidade|área mínima" \
   docs/04-reference/jurisdictions/                                        # -> 3 files

# (b) ANY primary legal text at all, in the fourteen non-Spanish country folders
find docs/04-reference/jurisdictions/{be,ch,de,dk,fi,fr,gb,it,nl,no,pt,sa,se,us} \
     -type f \( -name '*.txt' -o -name '*.pdf' \)                          # -> 0 files
```

**(b) is the finding.** Fourteen of the fifteen country folders hold **no primary legal text at
all** — not an unextracted one, none. The `jurisdictions/` tree and the fifteen
`server/jurisdiction/` proxies are a **planning/envelope** corpus (zoning, cadastre, envelope,
heights). They were never a habitability corpus.

⛔ **So "bring this data into the algorithm" was a BUILD, not a WIRE**, for 14 of 15 countries. The
one exception exists by accident: Málaga's habitability article lives *inside* a PGOU that was fetched
for its zoning.

### §6.2 — Per-country coverage

Legend — **form**: `structured` = a machine-readable standard ships · `prose-corpus` = the
instrument's text is here, unextracted · `absent` = nothing here.
**gap**: `not-fetched` (a SOURCING task) vs `fetched-not-extracted` (an EXTRACTION task — far
cheaper). ⛔ These have opposite fixes and are never collapsed.

| # | Country | form | Instrument seeded | Confidence | gap | Named source to chase | Evidence in repo |
|---|---|---|---|---|---|---|---|
| 1 | **es** Spain | **structured** | Málaga PGOU Art. 12.2.35 (2018-02) · Catalunya Decret 141/2012 | `primary-in-repo` · `instrument-cited` | partially-extracted | Autonomic + municipal, **never national**. Catalonia: fetch Decret 141/2012 from portaljuridic.gencat.cat. Andalucía, Madrid, València, Múrcia, Canarias, Balears, Aragón: one instrument each. | `es/es-an/29067-malaga/.../12-TITULO-XII.txt` (**read**) · `es/es-an/41091-sevilla/.../06_TR_NORMAS.txt` (**delegates**, see §6.3) |
| 2 | **gb** United Kingdom | **structured** | NDSS ¶10 (2015-10-01), **England only** | `instrument-cited` | not-fetched | GOV.UK "Technical housing standards — nationally described space standard". **Then separately** Scotland (Building (Scotland) Regs / HfVN) and Wales (DQR). | — |
| 3 | **be** Belgium | absent | — | UNKNOWN | not-fetched | **Three regional instruments**: Vlaamse Codex Wonen · Code wallon de l'Habitation durable · Code bruxellois du Logement + arrêté 4.9.2003. Chasing "Belgium" as one jurisdiction is the same error as chasing "Spain" as one. | — |
| 4 | **ch** Switzerland | absent | — | UNKNOWN | not-fetched | **Cantonal, partly communal** — e.g. Zürich ABV / PBG. There is no federal Swiss habitability minimum. | — |
| 5 | **de** Germany | absent | — | UNKNOWN | not-fetched | The 16 **Landesbauordnungen**, tracking Musterbauordnung §48 (Aufenthaltsräume). ⚠ Expect a SHAPE mismatch: German law mainly regulates room HEIGHT and window area, not floor area. | — |
| 6 | **dk** Denmark | absent | — | UNKNOWN | not-fetched | **Bygningsreglement BR18**, published as machine-readable HTML at br18.dk — the cheapest row in the table to close. | — |
| 7 | **fi** Finland | absent | — | UNKNOWN | not-fetched | Ympäristöministeriön asetus asuin-, majoitus- ja työtiloista (finlex.fi). | — |
| 8 | **fr** France | absent | — | UNKNOWN | not-fetched | Décret n° 2002-120 (logement décent) + Code de la construction et de l'habitation (legifrance). ⚠ Dwelling-level, not per-room — same shape mismatch as Germany. | — |
| 9 | **it** Italy | absent | — | UNKNOWN | not-fetched | **DM Sanità 5 luglio 1975**, plus the per-comune Regolamento Edilizio. National floor + municipal variation — the same two-tier shape as Spain. | — |
| 10 | **nl** Netherlands | absent | — | UNKNOWN | not-fetched | **Besluit bouwwerken leefomgeving (Bbl)**, which replaced Bouwbesluit 2012 (wetten.overheid.nl). | — |
| 11 | **no** Norway | absent | — | UNKNOWN | not-fetched | **Byggteknisk forskrift TEK17** kap. 12 (dibk.no). | — |
| 12 | **pt** Portugal | absent | — | UNKNOWN | not-fetched | **RGEU** (DL 38382/1951), condições de habitabilidade — **named by this repo's own Portugal study and flagged there "ASSERTED-UNVERIFIED"**. Fetch from dre.pt. | `pt/findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md:372` (names it; holds none of it) |
| 13 | **sa** Saudi Arabia | absent | — | UNKNOWN | not-fetched | Saudi Building Code SBC 201 / SBC 801 + MOMAH اشتراطات البناء. ⚠ Expect an ACCESS problem on top of the sourcing one (L-606 geo-fencing). | — |
| 14 | **se** Sweden | absent | — | UNKNOWN | not-fetched | **Boverkets byggregler (BBR)** avsnitt 3 + SS 91 42 21. ⚠ Check which edition is in force — Boverket has been replacing BBR. | — |
| 15 | **us** United States | absent | — | UNKNOWN | not-fetched | **IRC R304** / IBC ch. 12 — **as adopted and amended per state and per city**. ⚠ There is NO national US figure: a US row needs a per-jurisdiction adoption lookup, not one document. | — |

> ⛔ **NAMING A SOURCE IS NOT HAVING IT.** Column "Named source to chase" is a work item. Thirteen
> rows read UNKNOWN and stay UNKNOWN until someone fetches the instrument and reads it.

### §6.3 — Per-room-type coverage of what IS seeded

`—` = the instrument is **silent** on this room type ⇒ that room falls to the named PRYZM baseline
**and the sentence says so**. Silence is not permission.

| RoomType | ES · Málaga (verified) | ES · Catalunya (candidate) | GB · England (cited, conditional) | PRYZM baseline (law nowhere) |
|---|---|---|---|---|
| `master` | **12** m² | **8** m² | **11.5** m² / 2.75 m | 8 m² / 2.40 m |
| `bedroom` | **8** m² | **6** m² | **7.5** m² / 2.15 m | 7.5 m² / 2.15 m |
| `kitchen` | **7** m² (independent) | — | — | 6 m² / 1.80 m |
| `open_plan` | **16** m² / **3.0** m | — | — | 20 m² / 3.20 m |
| `living` | — ⚠ see below | — | — | 14 m² / 3.20 m |
| `dining` | — ⚠ see below | — | — | 9 m² / 2.40 m |
| `bathroom` | **3** m² | — | — | 5 m² / 1.80 m |
| `ensuite` | **3** m² (mapped) | — | — | 3.5 m² / 1.50 m |
| `wc` | **1.5** m² | — | — | 1.2 m² / 0.90 m |
| `study` · `hall` · `corridor` · `utility` · `storage` · `balcony` · `stair` | — | — | — | per `ROOM_RULES` |

Three mapping decisions, each recorded on the record itself so a reader can check rather than trust:

1. ⚠ **Málaga's `salón-comedor` is NOT seeded onto `living`.** The ordinance regulates a *combined*
   living-dining room. Applying a combined figure to one half of a split pair **overstates** the
   requirement — the restrictive direction, which is what produced zero layouts in the first place.
   It is seeded onto `open_plan`, which is the same room the ordinance describes.
2. ⚠ **And its 16 m² is the FLOOR OF A SCALE** (16 / 18 / 20 / 24 by bedroom count). This per-room
   table has no bedroom-count axis, so a ≥3-bedroom Málaga dwelling is under-constrained here by up
   to 8 m². **Recorded, not solved.**
3. ⚠ **`ensuite` ← "baño" is a JUDGEMENT.** The ordinance knows *baño* (3 m²) and *aseo* (1,5 m²) and
   has no concept of an en-suite; PRYZM's `ensuite` is a full bathroom, so it takes the *baño*
   figure. Its separate fixture-COUNT rule (≥2 cuartos de aseo above 70 m² útiles) is not modelled.

**Sevilla** is the audit's other instructive row: its NNUU corpus IS in the repo and it *delegates* —
*"de dimensiones mínimas ajustadas a la normativa de aplicación"*. Extracting Sevilla means chasing
the instrument it defers to, not re-reading Sevilla. A `prose-corpus` row is not automatically a
cheap extraction.

### §6.4 — ⭐ FIVE rival minima tables, not one

| # | Table | `bedroom` | `living` | Cited as | Jurisdiction-aware |
|---|---|---:|---:|---|---|
| 1 | `apartmentLayout/rules/programRules.ts` `ROOM_RULES` | 7.5 | 14 | was *"UK Building Regs / HQI mandatory"* — **false on 3 of 4 clauses** | ✅ **now** |
| 2 | `apartmentLayout/dimensions/roomDimensions.ts` `ROOM_DIMENSIONS` | 9 | 14 | framework §5.4 (COMFORT) | ❌ — no longer the hard gate |
| 3 | `apps/editor/src/ui/house-layout/houseExecDiagnostics.ts` `AREA_MIN` | 9 | 14 | *"Mirror of ROOM_DIMENSIONS"*, hand-copied | ❌ **OPEN (L-4415)** |
| 4 | `packages/constraint-solver/src/ConstraintEngine.ts` `MIN_AREA_M2` | 7.5 | 11 | *"UK Part M"*, rendered **as a regulation** in the user-facing rule panel | ❌ **OPEN (L-4416)** |
| 5 | `docs/03-execution/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md` §2 | 9 | 18 | a NORMATIVE SPEC whose own header says *"when code disagrees with this table, the code is wrong"* | ✅ **columns removed 2026-08-22** — it now points at the resolver |

C83 §6.1 already records **#4** as an owed migration. It does not name #1–#3, and nobody had counted
**#5** at all. This spec closes #1, re-points the hard gate off #2, and strips the numeric columns
out of #5. **#3 and #4 remain open**, and #4 is the more urgent because it puts a UK number in front
of the user *with the word "regulation" attached*.

⭐ **#5 is the most instructive of the five.** It is a SPEC, it is NORMATIVE, and its own header
claims supremacy over the code — so under the repo's stated conflict order it was quietly declaring
the founder's 2026-08-22 ruling to be a bug. **A document that asserts a jurisdictional number
cannot help but rot**, which is why its `area`/`short` columns were deleted rather than corrected
(L-4417).

---

## §7 — How to add a country (the ONLY correct procedure)

1. **Fetch the primary text** into `docs/04-reference/jurisdictions/<cc>/…`. If you cannot fetch it,
   stop — update the `coverage.ts` row's `namedSourceToChase` and leave the country UNKNOWN.
2. **Read the article.** Record the instrument, the article, the date, and the repo path.
3. **Add a `HabitabilityStandard`** in `standards.ts`. Set `confidence: 'primary-in-repo'` **only if**
   `sourcePath` is non-null and you read the number from that file.
4. **Key it on the real registration id** where one exists (`listJurisdictionCoverage()`), otherwise
   add a declared exception with a reason to `habitabilityJurisdictionIds.test.ts`.
5. **Quote the instrument's own room term** and write a `mappingNote` for every mapping that is a
   judgement rather than a translation.
6. **Fill `notCovered`.** State what the instrument does not address, so silence is never read as
   permission.
7. **Flip the `coverage.ts` row** to `structured` and list the standard id. The two-way CI check
   fails if you do one without the other.
8. **Add a transcription check** to `habitabilityMinima.test.ts` — the one place literals belong.

⛔ **Never** add a number without completing steps 1–3. ⛔ **Never** copy a figure from a
neighbouring country, an average, or a "similar jurisdiction". An invented habitability minimum is an
invented legal claim about someone's home.

---

## §8 — What this spec does NOT cover

- **The envelope corpus.** Zoning, setbacks, FAR, heights — [C58](../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md)
  / [C64](../../02-decisions/contracts/C64-ENVELOPE-COMPILER.md) and the
  [ENVELOPE-CAPABILITY-MATRIX](../../04-reference/jurisdictions/ENVELOPE-CAPABILITY-MATRIX.md).
  Different corpus, different authority, different sources — and the audit's finding is precisely
  that envelope maturity does **not** carry over (Denmark is PRYZM's most complete zoning
  jurisdiction and is at zero here).
- **Whole-dwelling minima**, fixture COUNT rules, ceiling height, ventilation, daylight factors,
  patio dimensions. Real, regulated, and outside this per-room-type shape. Every seeded standard
  names its own instances in `notCovered`.
- **Whether an instrument APPLIES at a given address.** NDSS adoption is a Local Plan policy lookup
  PRYZM does not perform; that is why it ships `conditional`.
- **The `ConstraintEngine` rule panel** (rival table #4). Owed, logged, untouched here.
