# ADR-0350 — *Mediciones* is the floor 4D, 5D and 6D stand on; two of the three are NOT BUILT, and the product says so

- **Status:** Accepted
- **Date:** 2026-08-21
- **Lane:** DATA1
- **Supersedes:** nothing. **Amends in place:**
  `apps/editor/src/ui/dataworkbench/DataWorkbench.ts` (seventh bucket + tab ids),
  `apps/editor/src/ui/dataworkbench/buckets/AuditBucket.ts` (the tab that measured nothing),
  `apps/editor/src/ui/dataworkbench/HierarchyTreePanel.ts` (auto-setup outcome + empty state),
  `packages/core-app-model/src/index.ts` + `package.json` (`./quantities` subpath).
  **Adds:** `packages/core-app-model/src/quantities/**` (5 modules + 1 suite),
  `apps/editor/src/ui/dataworkbench/buckets/MedicionesBucket.ts`,
  `apps/editor/src/ui/dataworkbench/__tests__/medicionesHonesty.spec.ts`.
- **Commits:** `ac3c3745` (engine), `329305a9` (bucket), `5a61e7ce` (hierarchy + DOM suite).
- **Contracts:** C66 §1.1 (a capacity/figure that has not been measured is a CLAIM — applied here
  to quantities and prices), C84 EI-11 (what the user sees and what the system exports must be the
  same code), C86 §10.1 PR-1 (`openingOutline` is THE one outline producer), C03 (read-model, no
  mutation), C79 §5.2.0 / C71 §4.4 (absent ≠ empty), P6, P8.
- **Issue-log:** L-2000 … L-2007.
- **⚠ Numbering:** this ADR was drafted as 0343, renumbered to 0344 when the Analysis lane minted
  `ADR-0343`, and renumbered again to **0350** when a third lane minted `ADR-0344` inside the same
  hour. `ls adrs/ | sed …| uniq -d` shows **seven pre-existing duplicate ADR numbers** (0014, 0069,
  0073, 0075, 0098, 0110, 0117) — "take the next number" does not survive a live fleet, and this
  file is the eighth near-miss. **0350 was chosen with deliberate headroom, not sequentially.**
- **Related:** **ADR-0343** (Analysis surface / composable widget model, a different lane, same
  day) records **L-2133** — the same "the tab called Quantities computes no quantity" finding,
  reached independently. That row was written while this lane's fix was in the working tree and
  says so. The two are not in conflict: ADR-0343 owns the Analysis *widget* surface, this ADR owns
  the *medición* read-model. **If a widget ever shows a quantity, it must call `computeTakeoff()`,
  not re-derive one.**

---

## 1 · Context — what the founder asked, and what was actually there

> "Please make the **Data tab sound**. Also add **4D and 5D and 6D** tabs for **cost** in Data.
> Also **all studies really should be there as part of mediciones**." — founder, 2026-08-21

*Mediciones* is not "measurements". It is the Spanish construction term for the **measured schedule
of work** — the quantity take-off / bill of quantities that a cost estimate is built from. He is a
Barcelona architect; the request is for a BOQ, priced, with the studies attached to it.

**Measured before writing anything (lane DATA1, 2026-08-21):**

| Surface | What it actually did |
|---|---|
| AUDIT › **Quantities** (`AuditBucket.mountQuantitySchedules`) | Rendered `scheduleStore.getAll()` — schedule **DEFINITIONS**: `name`, `scheduleType`, `fields.join(', ')`. Heading read *"Schedule of Quantities"*. **Zero quantities computed.** Its only button opened the *Intent Visibility Settings* panel. |
| `ScheduleExtractor` (L2) | Reads element stores and emits **per-element rows** for a schedule view. Never sums, never carries a unit. **The Walls schedule has no area column at all** — so no wall area, gross or net, existed anywhere in the product. |
| `QuantityToolbar` (10 buttons: takeoff, area, volume, CSV, Excel, IFC…) | Constructed **nowhere** outside its own spec. No handler is registered for any of its 10 command types. |
| `packages/*` for cost / schedule / carbon / lifecycle | **None.** `ai-cost` is AI token spend; `frame-scheduler` is render frames. |

So: **4D and 6D did not exist in any form, and 5D had no foundation, because the take-off was not
real.** A cost tab built on that would have been a currency symbol in front of nothing.

---

## 2 · Decision

### 2.1 — The order of work is the architecture

**5D is a layer on quantities. 4D is a layer on quantities.** Therefore the take-off is built first
and is the *only* thing 4D/5D/6D may read. `computeTakeoff()` is the single producer; no surface
re-derives a quantity of its own. This is C84 EI-9 ("one answer per question") applied before a
second implementation can exist rather than after.

### 2.2 — One bucket, four tabs, and the built ones are first

A seventh `MEDICIONES` bucket, defaulting to **Take-off**:

| Tab | State | What it renders |
|---|---|---|
| **Take-off** | **BUILT** | The BOQ: 8 chapters (EN + ES), per line a unit, a measured quantity, the element ids it measured, the measurement basis in words, approximation qualifiers, secondary measures, CSV export. |
| **5D Cost** | **BUILT** | Rate + source per line, entered by the user or imported. Total + mandatory coverage sentence. |
| **4D Time** | **NOT BUILT** | A panel that says NOT BUILT and names the four missing pieces. No timeline, no table. |
| **6D Carbon** | **NOT BUILT** | A panel that says NOT BUILT and names the four missing pieces. No kgCO₂e figure. |

**The two unbuilt tabs are declared in the product, not hidden from it.** Hiding them would erase
the only evidence that the capability is owed — the same ruling `LifecycleBucket` already carries
for the Occupancy slot (§FIX-EMPTY-OCCUPANCY-SLOT, L-1285).

### 2.3 — The opening deduction is computed by the code that cut the hole

A wall's void area comes from **`openingOutline()`** in `@pryzm/geometry-wall` — THE one outline
producer (C86 §10.1 PR-1), the same function `LayeredWallOpeningBuilder` uses to cut the mesh —
integrated by `outlineSignedArea()`.

Consequences, measured on the test fixtures:

- a round-arch void 1.0 × 2.0 m deducts **1.8907 m²** (the arch), not **2.0000 m²** (its bounding box);
- a circular void 1.0 m across deducts **0.7814 m²**, not **1.0000 m²**;
- both are *marginally under* the ideal (1.8927 / 0.7854) because the producer returns the
  **tessellated polyline** — the inscribed polygon. **That is the correct answer**: it is the area
  of the hole that was actually cut. A take-off returning the ideal would disagree with the model
  it claims to measure.

Likewise a **curved** wall is measured along its tessellated arc, not its chord: on the fixture,
**4.5911 m** against a 4.0000 m chord — a chord would under-measure by 12.9 % on one wall.

### 2.4 — Absent is never zero, and no rate is never €0

Two prohibitions, encoded in types rather than in review comments:

1. **A family that cannot be measured emits NO line.** It appears in `TakeoffResult.coverage` as
   `NOT_MEASURED` with a stated reason. There is no `quantity: 0` fallback and no code path to one.
   `unreadableStores` separates "the store was not reachable" from "the store was read and is
   empty" — those are different answers to an architect (C79 §5.2.0, C71 §4.4).
2. **An unpriced line is `rate: null` / `amount: null`.** Never `0`. The total sums only priced
   lines and is returned inseparably from `CostSummary.coverageStatement`, generated in L2 so a
   second UI cannot render the total without it. A rate quoted in the wrong unit is **refused, not
   converted** — €/m² against a `ud` quantity is a different number, not an approximation.

### 2.5 — PRYZM ships zero rates and zero carbon factors

There is no default price table, no €/m² heuristic, no "typical Barcelona" seed, and no code path
that could produce one. Rates come from the user or from a price database they hold a licence to
(BEDEC/ITeC, Base de Precios, SPON'S, RSMeans). PRYZM redistributes none of them.

**Why this is a decision and not an omission:** a cost figure gets believed and quoted. A
plausible-looking total that was not derived from a sourced rate is more damaging than no total,
because it survives being copied into a document. The same reasoning blocks 6D (§4.3).

Rate books are stored in **`localStorage`, keyed by project id**, and the panel says so on its own
face: not in the project file, not synced to collaborators, not covered by undo. Making rates
project data is real work (schema, command, persistence, undo) and is **not claimed**.

---

## 3 · Coverage as measured — what the take-off does and does not do

| Family | State | Basis / reason |
|---|---|---|
| Walls | MEASURED | m² of elevation face (`wallProfile` ring, else L × H; curved along the arc) − Σ opening voids from `openingOutline()`. Secondary: gross face, deducted area, net volume, baseline length. |
| Doors / Windows | COUNTED_ONLY | `ud` by leaf count, void profile and nominal size. Ironmongery, finish, fire rating, glazing spec NOT measured. |
| Floors / Ceilings | MEASURED | m² of plan area by resolved finish. |
| Roofs | MEASURED | m² of **PLAN** area — slope development NOT applied, and the coverage note says so. |
| Slabs | MEASURED | m³ = plan area × thickness, by material and thickness. |
| Columns | COUNTED_ONLY | `ud` by profile; length and gross volume as secondary. |
| Beams | MEASURED | linear m by profile; gross volume as secondary. |
| Handrails | MEASURED | linear m **in plan** — rake development NOT applied, stated. |
| Curtain walls | MEASURED | m² = baseline length × height. Mullion lm not broken out. |
| Stairs / Plumbing / Furniture | COUNTED_ONLY | `ud` by shape / fixture type / furniture type. |
| Room finishes | MEASURED | Floor + ceiling m² by resolved finish; **wall finish** = perimeter × height − voids in that room's bounding walls. A room whose bounding walls are **UNDETERMINED is EXCLUDED and counted**, never measured gross. |
| Excavation, foundations, steel MASS, reinforcement, insulation layers, painting, electrical/HVAC, preliminaries | **NOT_MEASURED** | Each names its own reason. Steel kg is blocked by the absence of a material→density table; insulation is blocked by system-type LAYERS not being broken out. |

**The single largest buildable gap is per-layer quantities.** Wall and floor system types already
carry layers with thicknesses; breaking them into per-layer m²/m³ lines would unlock insulation,
membranes, render, plasterboard — and is the prerequisite for 6D (§4.3).

---

## 4 · What is NOT built, and exactly what it needs

### 4.1 — 4D (time / sequencing)

**Have:** a real element-traceable take-off; levels and a site→building→level→unit→room hierarchy
(the natural work-breakdown spine); a command bus with undo.

**Missing:**
1. **A phase/task element.** There is no schedule entity of any kind in `packages/schemas` — no
   task, no phase, no dependency. Minting one triggers C67 + C68.
2. **A phase field on elements.** Only slabs carry a stray `phase` string, and nothing reads it.
3. **Durations.** A duration is a quantity ÷ an output rate (m²/day). PRYZM ships no output rates,
   for the same reason it ships no prices.
4. **A time filter in the viewport.** Visibility is intent-based (P7); a date-scoped filter is a
   new visibility axis, not a UI toggle.

### 4.2 — 6D (sustainability / embodied carbon)

**Have:** volumes and areas per material group; a material library with stable ids (the join key a
factor table needs); system types carrying layers.

**Missing:**
1. **A carbon factor per material.** Checked, not assumed: the material catalogue carries colour,
   roughness, metalness, opacity — and **no carbon column**.
2. **Densities.** Volume → mass needs kg/m³. Also absent; the same gap blocks steel kg in §3.
3. **A licensed factor database** (ICE Bath, ÖKOBAUDAT, EPD España). PRYZM cannot redistribute one;
   the user supplies it, exactly as they supply prices.
4. **Layer-level quantities** (§3). Carbon lives in the insulation and the concrete, not in "a wall".

**The honest sequence** is: break out system-type layers → add a user-supplied factor table keyed
exactly as 5D's rate book is → multiply. Steps 1 and 2 are not done.

### 4.3 — Why 6D was not shipped as "5D with a different multiplier"

It would have been ~40 lines: reuse `RateBook`, rename `rate` to `factor`, print kgCO₂e. It was
**deliberately not done**, because the resulting tab would have been fully functional and
permanently empty — the user has no factor source to import, so every line would read "no factor"
forever. A capability that can only ever refuse is worse than a stated gap
(MEMORY §refusing-half-needs-its-escape-hatch). 5D does not have this problem: an architect *can*
type a rate they were quoted this morning.

---

## 5 · Consequences

- **AUDIT › Quantities is renamed "Schedules"** and its panel says *"These are definitions, not
  quantities: nothing on this tab is measured from your model"*, with a link into MEDICIONES.
- **Two panels now recompute on visit** rather than mounting once at construction (L-2004). A
  quantity is a snapshot; a stale quantity is worse than an absent one because it is still signable.
- **`@pryzm/core-app-model` gains a `./quantities` subpath** and root-barrel re-exports. No new
  workspace package, so no lockfile churn and no new unclassified package for the layer gate.
- **No new command, no new store, no mutation.** The engine is a read-model (C03); it cannot be
  the cause of an undo entry.
- **Open — L-2007:** "Generate hierarchy" is 2 + N separate undo entries (9 presses for the
  founder's 7 levels). Collapsing it needs `commandManager.beginGenerationBatch()`, whose only
  precedent reaches it through a window cast. Deliberately not smuggled in.

---

## 6 · Verification actually run

| What | Command | Result |
|---|---|---|
| Engine arithmetic | `pnpm --filter @pryzm/core-app-model exec vitest run src/quantities/QuantityTakeoff.test.ts` | **23 / 23 passed** |
| The four panels, at the DOM | `npx vitest run apps/editor/src/ui/dataworkbench` | **3 files, 33 / 33 passed** |
| Whole-repo types | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` | **exit 0** |

Three expectations FAILED on the first engine run. All three were **this ADR author's arithmetic**,
not the engine's: the quadratic-Bézier arc length was re-derived in closed form
(∫₀¹ √(16 + (4−8t)²) dt = **4.5911743**) and matched the code to 3 decimals, and the two
tessellated void areas were confirmed to sit correctly *below* their ideal values. **The failing
expectations were corrected against independent arithmetic, never against the code's output.**

**Not established:** none of this was exercised in a browser against the founder's real 7-level,
17-room project. The panels are asserted at the DOM under happy-dom with stubbed stores; the store
shapes are the real ones, but "it renders correctly in his project" is a claim this lane cannot make.
