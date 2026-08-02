# ADR-0289 — The Urban Geometry Engine: one library of derived urban measurements, many ordinances

**Status:** **PROPOSED — NOT BUILT.** Needs a single owner and a founder decision before any code.
**Date:** 2026-08-02 · **Proposed by:** the Murcia city agent, at the founder's request
**Builds on:** **ADR-0275** (the *amplada de vial* is a construction with a provenance ladder) ·
**ADR-0285** (computing an observable criterion is implementation, not modification) ·
**ADR-0286** (every derived value exposes legal source, computational source and tier) ·
**ADR-0287** (resolvers refuse when uncertainty changes the legal outcome) · **ADR-0271** ·
**ADR-0270** (rule KIND) · **ADR-0284**
**Evidence:** `jurisdictions/es/es-mc/30030-murcia/findings/MURCIA-DERIVED-VARIABLE-INVENTORY.md` ·
`jurisdictions/es/SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md` · `SPAIN-CADASTRAL-DISSOLVE-PROBE`
**Contracts:** C58 §1.1/§1.4/§1.9/§1.12 · C12 §8 (no new fetch in the geometry layer) · C63

> **The founder's brief, verbatim:** *"Build the geometry library now. Don't hard-code street width.
> That architecture pays off in Murcia... and Barcelona... and Córdoba... and Valencia."*

---

## 1 · Context — we have done this right once, by accident of discipline

`packages/site-parcel-data/src/geometry/streetWidth.ts` already states its own regional contract:

> *"Nothing in this module is Barcelona-specific: it takes rings and returns metres. A new region
> supplies (a) its own parcel/block source that can produce a block ring, (b) its own height table
> keyed on street width, and (c) optionally its own declared-width override list — none of which
> touch this file."*

Murcia's SIG-MU2 work (2026-08-02) was the first test of that claim by a second city, and **it
held**: `resolveMurciaStreetWidth` supplied (a) and `esMurciaAnchoDeCalle` supplied (b), and
`measureStreetWidths` / `blockEdgesFacingParcel` / `governingStreetWidth` were used **unmodified**.

**That is the pattern to institutionalise — before the next five variables each grow a private copy
in a different city's folder.** The Murcia inventory finds **six** further derivable variables, and
Arts. 4.5.4 / 4.5.5 / 4.5.6 are a family that every Spanish PGOU expresses in some form.

⚠ **The counter-pressure is real and should be named.** Five city agents work in parallel worktrees.
Whichever of them needs `cornerParcel()` first will write it in their own city's provider if there
is nowhere else to put it, and the second will not find it. **This ADR exists to give it a home
before that happens, not because the geometry is hard.**

---

## 2 · Decision (proposed)

Create **`packages/urban-geometry`** (L1, pure) — one library of **derived urban measurements**,
consumed by every jurisdiction's rule pack and by no jurisdiction's rule pack privately.

### 2.1 · The strict boundary — what belongs and what never does

| belongs | never belongs |
|---|---|
| measurements over rings: distances, lengths, adjacency, orientation | any ordinance table, band or threshold |
| the measurement's own **error bar** | any decision about which band a value falls in |
| typed refusals when geometry cannot answer | any jurisdiction name, clau code or calificación |
| determinism, purity, OTel spans | any I/O, fetch, clock or RNG |

**The library returns METRES AND SHAPES. The rule pack decides what they MEAN.** This is exactly the
split that let Murcia reuse Barcelona's module, and it is the only invariant that keeps the library
from becoming a second place where law lives (ADR-0284: derived geometry is permissible, derived law
is not).

### 2.2 · The proposed surface

| function | status today | what it does | who needs it |
|---|---|---|---|
| `streetWidth()` | ✅ **EXISTS** — `measureStreetWidths`, shipped, two cities | frontage-to-frontage distance per block edge + `spread_m` error bar | BCN, MUR, (MAD, COR, VLC) |
| `frontageEdges()` | ✅ **EXISTS** — `blockEdgesFacingParcel` | which block edges a parcel actually fronts | all |
| `governingFrontage()` | ⚠ **EXISTS BUT IS MIS-SHAPED** — `governingStreetWidth` hard-codes *narrowest wins* | pick the governing frontage | **all — and they disagree** (§3.1) |
| `cornerParcel()` | ❌ new | does the parcel front two non-parallel streets, and which is wider | MUR Art. 4.5.4 · BCN chaflán · MAD |
| `frontageLength()` | ❌ new (trivial) | length of the parcel edge coincident with the alineación | MUR (parcela mínima) · most segregation rules |
| `blockDepth()` | ⚠ **PARTIAL** — `blockDerivedDepth` / `blockConcentricBand` exist but are PGM-Art.-242-shaped | block dimensions + façade lengths + orientation | MUR Art. 5.5.3 (*tres fachadas ≥ 50 m*) · BCN |
| `continuousAlignment()` | ❌ new | is the alineación continuous along this frontage, or broken | MUR · BCN nucli antic |
| `buildableDepth()` | ⚠ **EXISTS as a CLIP** — `depthBandClip` | apply a depth band from a frontage | all (the depth itself is usually stated) |
| `enclosedSpaceWidth()` | ❌ new | narrowest width of a plaza / open-space polygon | MUR Art. 4.5.5 |

⚠ **Note how much already exists.** This is mostly a **consolidation and generalisation** ADR, not a
green-field one — which is the argument for doing it now, while it is cheap.

---

## 3 · The hard parts — designed for, not assumed away

### 3.1 · ⚠ `governingFrontage()` — the cities genuinely DISAGREE, and today one of them is wrong

This is the single most important design point in this ADR.

| jurisdiction | rule | article |
|---|---|---|
| Barcelona | **narrowest** street governs (conservative; the module says so) | PGM Art. 327 |
| **Murcia** | **WIDER** street governs on a corner: *«se tomará la altura correspondiente a la calle de mayor ancho»* | **Art. 4.5.4** |
| Murcia | on **opposite** frontages, EACH street gets its own height and the depth splits | **Art. 4.5.6** |
| Murcia | on a **plaza**, the **narrowest** width of the plaza governs | **Art. 4.5.5** |

**Murcia is today running Barcelona's policy and therefore UNDER-GRANTS on corner parcels.** It does
not over-state, so it is not an L-616 defect — but it is a fidelity defect, and it exists *because*
the policy is hard-coded inside a shared function.

⇒ **`governingFrontage()` must take a POLICY, not embed one.** Proposed shape:

```ts
type FrontagePolicy = 'narrowest' | 'widest' | 'per-frontage';
governingFrontage(result, edgeIndices, policy): Frontage | Frontage[] | null
```

`'per-frontage'` returns MANY, because Art. 4.5.6 genuinely produces two heights on one parcel —
a shape `governingStreetWidth` cannot express at all today. ⚠ That is an **ADR-0270 rule-KIND**
change downstream, not just a different number, and it should not be smuggled in as a refactor.

### 3.2 · ⚠⚠ THE ASYMMETRY — the block ring is the real problem, and it is not evenly distributed

Every function above needs **a block outline**. Cities get one in fundamentally different ways, and
this is the hard part the founder correctly flagged:

| city | block-ring source | success | consequence |
|---|---|---|---|
| **Murcia** | ⭐ the municipality **publishes block-level alineación polygons** (`Murcia:pgou_alineaciones`) | **direct — no dissolve** | every function above is reachable today |
| Barcelona | `dissolveParcelsToBlockRing` over Catastro | **2/2** | works |
| Madrid | same | **2/4** | half the city has no ring ⇒ no derived variable at all |
| Córdoba | same | **0/3** | none of this is reachable |
| València | (alineaciones work in flight) | — | TBD |

**Design consequence, and it is the crux:** the engine must take a **`BlockRingSource` port**, not a
dissolve. Three implementations, ranked, with the tier travelling *with the ring*:

1. `published-block-polygon` — Murcia's case. Highest fidelity: the ring **is** the legal alineación.
2. `dissolved-cadastral` — Barcelona/Madrid. The ring is a *reconstruction*; ADR-0275's provenance
   ladder already prices it.
3. `unavailable` — Córdoba. **The engine must REFUSE, and the refusal must be typed
   `no-block-ring`** so a card can say *"we cannot measure this street because the block outline is
   not derivable here"* rather than *"no data"* (L-422/457/467/469).

⚠ **Do not attempt to paper over (3) with a buffered-parcel approximation.** A ring that is not the
alineación produces a width that is not the *ancho entre alineaciones* the ordinance names — a
plausible number computed from the wrong datum, which is the L-616/ADR-0270 failure. **Córdoba's 0/3
is a data-acquisition blocker, not an engineering one, and this ADR must not disguise it as solved.**

⇒ **A corollary worth stating loudly:** Murcia's route — *does the municipality publish alineación
polygons directly?* — should be **probed for every Spanish city before anyone invests in improving
the dissolve**. It may be that several cities have a published-alineación route nobody looked for,
exactly as Murcia's primary-source PDF turned out to be one correctly-formed request away.

### 3.3 · Provenance and refusal are part of the contract, not a wrapper

Per ADR-0286 every returned value carries `{ value, spread, provenance, blockRingSource }`; per
ADR-0287 the CONSUMER owns the band-edge decision using the returned `spread`. The library must
never decide a band, and must never return a value without its error bar — Murcia's 44.6 %
band-edge refusal rate is only defensible *because* `spread_m` reaches the decision.

---

## 4 · What this does NOT claim

- **It does not raise Murcia's score.** Every derivable variable left in Murcia is worth
  **≤ +0.15 pp of ENVELOPE axis** (inventory §3). This ADR is justified by **portability and
  correctness**, not by Murcia's number, and anyone planning against it should read that section
  first.
- **It does not fix Córdoba or half of Madrid.** Those are blocked on the block ring (§3.2), which
  is data acquisition.
- **It does not touch any ordinance table.** No band, threshold or article moves into this package.
- **It is not a licence to refactor `streetWidth.ts` in place.** The shipped path serves two cities
  and a signed determination; the migration must be additive, with `governingStreetWidth` kept as a
  `policy: 'narrowest'` shim until every caller is moved.

---

## 5 · Open questions for the owner

1. **Package or folder?** A new L1 `@pryzm/urban-geometry`, or promote `site-parcel-data/geometry/`
   in place? The latter is cheaper and avoids a workspace/lockfile change; the former makes the
   "no ordinance data here" boundary enforceable by `eslint-plugin-boundaries`.
2. **Who owns `governingFrontage()`'s policy per jurisdiction** — the rule pack, or a jurisdiction
   registry? (Leaning: the rule pack, next to the table it feeds.)
3. **Does Art. 4.5.6's two-heights-on-one-parcel case justify a new `EnvelopeTier`**, or does it
   reuse the `tiered-occupation` shape ADR-0273 already introduced for PGM Art. 350.2?
4. **Is Murcia's Art. 4.5.3 divergence** (inventory §0.2 — prescribed arithmetic mean over the
   *tramo* vs our per-edge median) **a Murcia fix or an engine feature** (`aggregate: 'mean-over-tramo'`)?
   It is likely the latter, and likely not unique to Murcia.

---

*Owner: UNASSIGNED — this ADR should not be implemented until one is named. Proposed 2026-08-02.*
