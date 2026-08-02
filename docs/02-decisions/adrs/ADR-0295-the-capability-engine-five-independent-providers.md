# ADR-0295 — The envelope engine is a CAPABILITY ENGINE: five independent providers, not regional packs

**Status**: **ACCEPTED** 2026-08-02 · founder-authored · **refines**
[ADR-0294](./ADR-0294-the-zone-resolver-is-container-agnostic-and-carries-confidence.md) ·
[ADR-0293](./ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md)
**Related**: [C64](../contracts/C64-ENVELOPE-COMPILER.md) ·
[R/P SCORING](../../04-reference/standards/R-P-REGIONAL-SCORING.md) ·
[REGIONAL-INTAKE-LIST](../../04-reference/standards/REGIONAL-INTAKE-LIST.md)

---

## Context — three regions, measured, pointing at one decomposition

| Region | What it has | What it lacks | Old verdict |
|---|---|---|---|
| **Murcia** | grammar ✅ routing ✅ **alignment ✅ (679 lines, unread)** | — | *"cannot draw"* — **WRONG, it draws** |
| **Córdoba** | grammar ✅ routing ✅ | ⛔ **alignment**, governing **~74 % of rows** | *"P failure"* — **wrong link named** |
| **Castilla y León** | routing ✅ **classification best in Spain** | grammar (FAR only, 2.5 %) | *"strongest P in Spain"* — **wrong by my own error** |

⭐ **Each was mis-diagnosed because "region" was the unit.** A region is not a thing that succeeds or
fails. **It is five capabilities that succeed or fail independently.**

---

## Decision — five providers, scored separately, composed without branching

```
Parcel geometry → Zoning geometry → Legal grammar → Alignment geometry → Constraint overlays
```

Every capability is scored **AUTHORITATIVE · INFERRED · PARTIAL · ABSENT**, and every node carries
**source · authority · confidence · citation · digest · fallback**.

⛔ **NO REGION-SPECIFIC BRANCHING INSIDE THE ENGINE.** A region supplies providers; it is not a code
path.

### ⭐ 1 · ALIGNMENT IS A GEOMETRY, NOT A PARAMETER

Height, depth and setbacks are **scalars**. **Alignment is a line a planning authority drew.** Treating
it as an inferred property makes one of the grammar's **primary inputs** an approximation.

**It is the highest-leverage unresolved dependency in Spain**: Murcia serves 679 in-force lines,
Málaga's `LINALIN_T` sits behind a locked account, Córdoba serves none while ALIGNMENT governs ~74 %
of its rows, Barcelona **constructs** it from the block ring.

### ⭐ 2 · A LEGAL RULE IS NOT AN ENVELOPE — add the missing result types

**CyL's DSU case is the proof.** LUCyL DT 4ª self-executes at **≤3 plantas**, and SIUCyL draws the
boundary for **355/368 subjects** — ⛔ **but RUCyL art. 90.2 hands occupation, depth and setbacks to a
Plan General those municipalities lack, and neither instrument converts plantas to metres.**

> ⛔ **`BuildableEnvelope` has no carrier for *"storey ceiling known, footprint undetermined"*, and
> putting `3` in `maxFloors` would let the massing path extrude a volume from a law that states no
> metres.**

⇒ **Result types become: `Envelope` · `StatutoryCeiling` · `RoutingOnly` · `GrammarOnly` ·
`ClassificationOnly` · `ConstraintOnly`** — not one success/failure object.

### 3 · Refusals are machine-readable and typed

`NO_GRAMMAR · NO_ALIGNMENT · NO_DEPTH · NO_HEIGHT · NO_CONSTRAINTS · NO_CURRENCY · LEGAL_AMBIGUITY ·
PARTIAL_STATUTORY_ONLY` — each **cited to its evidence**. ⭐ *Aragón's validator already proves the
shape: `evidenceFor()` throws on an unknown id, so **an uncited refusal cannot ship**.*

### ⭐ 4 · A NEGATIVE-KNOWLEDGE REGISTRY — because our worst errors are PESSIMISTIC

**Balears, Murcia, Córdoba, Madrid, Aragón, Canarias were ALL under-stated at some point.** Overclaims
get caught because users notice them; **underclaims survive indefinitely because they look safe.**

Every proved absence records: **search performed · synonyms searched · services inspected ·
confidence · evidence.** Crawlers consult it before repeating work.

⛔ **AND THREE STATES, NEVER TWO: `ABSENT` ≠ `UNKNOWN` ≠ `UNREACHABLE`.** A service that errors is
UNKNOWN. A reCAPTCHA or locked account is UNREACHABLE.

### ⭐ 5 · SENTINELS MUST BE MAPPED BEFORE ANY FILTER IS APPLIED

Murcia: **`f_fin IS NULL` returns 0 in-force rows. `f_fin = 2999-12-30` is the "still in force"
sentinel.** HTTP 200, filter-applied proof **passed**, decomposition **summed exactly**.

⛔ **THE NAIVE ANSWER IS A FALSE NEGATIVE THAT KILLS A LIVE LEAD, AND NO SELF-CONSISTENCY CHECK CAN
SEE IT.** Caught only by contradiction with an independently-sourced figure (69 in-force LineStrings).

Known sentinels: Aragón `0`-as-null · Balears `DFIVIGEN = 99999999` · Canarias `'I'` (~75–80 % of every
parameter column, **meaning unresolved**) · Murcia `2999-12-30` · CyL `v_ind_edif = 0` on 1,715 rows.

### ⭐ 6 · GRAMMAR IS AN ONTOLOGY, NOT A LEXEME

`BUILDABLE_DEPTH · MAX_HEIGHT · MAX_STOREYS · ALIGNMENT_RULE · FRONT/SIDE/REAR_SETBACK · OCCUPATION ·
FAR · MINIMUM_PLOT · TYPOLOGY` — every language maps in.

⛔ **NO ENGINE SEARCHES FOR `fondo` AGAIN.** Málaga writes `profundidad edificable`, Córdoba
`profundidad máxima edificable`, Balears `profunditat`. A `fondo`-shaped search **misses 27.6 % of
València's documents**. ⚠ And `fondo` is also Spanish for **"background"** — it false-positived on
Aragón's basemap layers, *in the probe written to avoid that class of error.*

⚠ **Datums are NOT synonyms**: `altura de cornisa` ≠ `altura total`; `AltMaxMV` (street) ≠ `AltMaxMP`
(parcel). **Merging them is the ambiguity that makes Madrid's `NM_ALTURA` legally uninterpretable.**

---

## Consequences

⭐ **The roadmap stops being *"finish Galicia"* and becomes *"close capability gaps."*** Each missing
component is **explicit, measurable and independently improvable** — and a municipality can be told
exactly which single layer would unlock it.

⚠ **What does NOT change:** ADR-0293 still binds — **uncertain provenance is symmetric and a caveat
holds it; a missing downward constraint is asymmetric and can only OVER-GRANT.** ⛔ **Constraint
overlays are ABSENT in every region measured, INCLUDING BARCELONA, WHICH SHIPS.** Every envelope in
production today is an **upper bound with a missing ceiling**, and that is counsel Q4.
