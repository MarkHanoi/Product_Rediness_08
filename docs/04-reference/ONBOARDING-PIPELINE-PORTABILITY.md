# Onboarding pipeline — what actually ports vs what must be built per jurisdiction

> **Companion to `JURISDICTION-PLAYBOOK.md` §4.** The playbook lists "reusable assets that port across
> jurisdictions". This document **audits that list against the real code** (`registry.ts`,
> `zoneRefusal.ts`, `streetWidth.ts`, `blockDerivedDepth.ts`, the C57 adapter contract) so the P6
> (pack-authoring) estimate for the Nth jurisdiction is grounded, not hopeful. **An honest "this does
> NOT port because X" is the point** — a claimed reuse that fails on contact costs a jurisdiction a day.
>
> **Method:** every claim below is tagged **[VERIFIED in code]**, **[VERIFIED with a caveat]**, or
> **[REFUTED / narrower than claimed]**, with the file + line of evidence. Read: 2026-07-23, against
> `packages/site-parcel-data/`.

---

## 0 — TL;DR verdict on the playbook §4 "reusable assets" list

| Playbook §4 claim | Verdict | The honest one-liner |
|---|---|---|
| `streetWidth.ts` ports to any width-keyed jurisdiction | **VERIFIED with a caveat** | The *arithmetic* ports ("regional scope: deliberately none"). It is **gated by `dissolveParcelsToBlockRing`, which fails on most non-Barcelona blocks** (BCN 2/2, Madrid 2/4, Córdoba 0/3). The measurement ports; its INPUT does not. |
| The registry + three-outcome disposition (`pack`/`refusal`/`unregistered`) — a new place is a data addition | **VERIFIED**, within one limit | Adding a jurisdiction IS a data addition (`REGISTRATIONS[]`). But it assumes **zone-code-keyed** dispatch; the `parcel→instrument→article` chain (Barcelona's derived-planning 63%) does **not** fit `packsByZone`. |
| The refusal vocabulary (legal · coverage-gap · construction-incomplete · regime-undetermined) | **VERIFIED with a caveat** | The refusal *mechanism* ports fully; the refusal *copy* (`refusalFor`, `noRulePackRefusal`) is **per-jurisdiction by design and must NOT be standardised** — the code says so explicitly. |
| The rule-kind catalogue (C58 §2.2) | **VERIFIED** | `setback`/`alignment`/`block-derived-alignment`/`tiered-occupation`/`coverage-and-far` are jurisdiction-neutral shapes; choosing the kind per zone is P5. |
| `blockDerivedDepth.ts` does NOT port unexamined | **VERIFIED (CONFIRMED)** | The 30% / 30 m-cap / 11 m-floor IS Barcelona Art. 242. The *solver underneath* (`interiorFree` via `insetPolygonPerEdge` + bisection) is a reusable primitive for any "leave X% of block free" rule. |
| (implicit) the C57 parcel adapter is the porting seam | **VERIFIED — the strongest one** | A new country = a new adapter emitting the canonical `ParcelFeature`; the core is untouched (C57 §1.1). |

---

## 1 — What genuinely PORTS (the jurisdiction-agnostic spine)

### 1.1 — The C57 parcel-data adapter contract — the cleanest seam
`packages/site-parcel-data` + C57 §1.1–§1.5. A new jurisdiction supplies **one adapter** that
normalises its source (GML / ArcGIS-JSON / Shapefile / CityJSON, any EPSG) to a **WGS84
`ParcelFeature`** (ring + attributes + provenance). Everything downstream — the map UI, the C19
one-shot immutable commit, C58's rules engine — never sees the source format or CRS (C57 §1.1). The
same-origin proxy is a **clone of `server/overpassProxy.js`** (forward-once, LRU, non-fatal empty),
and a keyless source (Catastro) must look identical to a keyed one (Matriklen) to the client
(C57 §1.2). Coverage-miss degrades to manual draw; the provider returns `null`, never throws
(C57 §1.5). **Ports:** the canonical model, the proxy template, the commit path, the provenance
schema, the degrade behaviour. **Per-jurisdiction:** the adapter body, the endpoint URL, the secret,
the `source`/`license` values.

### 1.2 — The registry's three-outcome disposition — "a new place is a data addition"
`registry.ts`. `resolveZoneDisposition(jurisdictionId, zoneCode)` returns exactly one of
`pack` | `refusal` | `unregistered` (lines 66–73). The three-way split is load-bearing: `pack | null`
"collapses [that] the ordinance grants no envelope here / we have not encoded this zone yet — opposite
claims … the collapse is what put a fabricated setback triple on Collserola" (lines 18–31). A new
jurisdiction is a new `JurisdictionRegistration` in the `REGISTRATIONS[]` array (lines 161–194) — a
**data addition, no engine edit** [VERIFIED in code]. Two guarantees ride along and both port:
- **Load-time duplicate-throw** (`packMap`, lines 141–159): two packs claiming one clau throws at
  module load — "the only failure mode that cannot be mistaken for a working envelope".
- **Precedence: pack > legal-refusal > coverage-refusal** (lines 206–235): a legal refusal (about the
  ordinance) can never be displaced by a coverage refusal (about PRYZM), and a pack always wins over a
  refusal so a mistaken denial surfaces as a working envelope rather than a silent one.

⚠ **The one limit, stated honestly.** The registration is keyed on a **zone code** (`packsByZone:
Map<zoneCode, pack>`). This fits every jurisdiction that classifies by a clau/zone code — which is the
PGM zone layer, and Madrid/Valencia/most CCAA. It does **NOT** fit the `parcel → instrument →
classification → article` chain that **62.8% of Barcelona** actually needs (derived planning), where
the governing fact is *which plan*, not *which zone code*. That branch is a genuine model gap, not a
registration to fill (see `es-ct/08019-barcelona/NEXT.md` §3.1, TRIP-WIRE 4.5).

### 1.3 — The refusal vocabulary — mechanism ports, copy does not
`zoneRefusal.ts`. `buildRefusedEnvelope()` (lines 66–94) returns an envelope with **every numeric
field null/zero and `insetPolygon` empty, permanently** — "a refusal that carried a height would be
re-admitting the fabrication through the back door". `REFUSAL_STATUSES` (lines 113–116) is a **named
allow-list, not a boolean**: `not-applicable` (the ordinance answered "no envelope" — legal) vs `none`
(attempted, an input was unavailable — data path). These are "not interchangeable … stamping a
Catastro outage as `not-applicable` would assert a legal fact we have not established" (lines 58–64).
`isRefusedEnvelope` / `isTransientRefusal` are the predicates every consumer branches on. **All of this
ports.** ⚠ But `refusalFor` and `noRulePackRefusal` are **per-jurisdiction by explicit design**
(registry.ts lines 89–105): "the copy must name that jurisdiction's roadmap and speak about its
ordination types; a generic 'no data' string would be exactly the illegible honesty this decision
exists to avoid." **Do not standardise the refusal copy** — its absence is even meaningful (a
jurisdiction with no `noRulePackRefusal` keeps the honest estimated fallback for suburban fabric where
a setback triple is the *right* shape).

### 1.4 — The rule-kind catalogue + the geometry primitives
The C58 §2.2 rule kinds (`setback`, `alignment`, `block-derived-alignment`, `tiered-occupation`,
`coverage-and-far`) are jurisdiction-neutral shapes; P5 chooses one per zone. Underneath,
`insetPolygonPerEdge` (hardened for non-convex/degenerate rings, L-403) and the deterministic
fixed-budget bisection in `blockDerivedDepth.ts` (lines 48–) are **general primitives** — the "leave
X% of the block free" solver is reusable for any block-interior rule, only the ratio/cap/floor change.

---

## 2 — What must be BUILT per jurisdiction (no shortcut)

| Asset | Why it cannot port | Where the per-jurisdiction work lands |
|---|---|---|
| **The parcel adapter body** | Every cadastre is a different service/format/CRS/auth | C57 adapter (one per jurisdiction/source) |
| **The zone→pack map content** | Which claus, which numbers — the whole legal substance | `packages/site-parcel-data/src/rulepacks/<id>.ts` |
| **The classifier** (`refusalFor`) | How a zone code maps to legal-refusal vs buildable is the ordinance's own logic (Barcelona *enumerates*; another may pattern-match) | per-jurisdiction registration |
| **The refusal COPY** | Must name that jurisdiction's roadmap + ordering types (registry.ts §89–105) | per-jurisdiction |
| **Height / FAR / depth tables** | Per-zone legal numbers, human-verified (L-449 gate) | `SOURCES.md` + the pack |
| **The rule KIND per zone** | Wrong kind = wrong SHAPE (ADR-0270) | P5 decision, per zone |
| **The block-ring dissolve** | `dissolveParcelsToBlockRing` is tiling-dependent and fails per-jurisdiction (see §3) | the shared hidden blocker |
| **`blockDerivedDepth` rule constants** | 30% / 30 m / 11 m are Barcelona Art. 242; Saudi uses flat coverage % | new rule, reusing the solver |

---

## 3 — The finding that matters most: the hidden shared blocker

**`streetWidth.ts` AND `blockDerivedDepth.ts` both depend on a BLOCK RING**, and the block ring comes
from `dissolveParcelsToBlockRing`, which **fails on most non-Barcelona cadastral tilings**:
`open-or-disjoint` — **success BCN 2/2, Madrid 2/4, Córdoba 0/3** (SPAIN-CADASTRAL-DISSOLVE-PROBE,
quoted verbatim in `streetWidth.ts` lines 24–33). So the two most-cited "portable" geometry assets are
each **gated by a component that does not port**. The honest consequence for the Nth Spanish city:
- The *alignment + block-depth* machinery transfers unchanged **only where the dissolve succeeds**.
- Where it fails: no ring ⇒ no width ⇒ no height ⇒ the honest 0.5 m footprint slab, and no Art. 242
  depth either. This is a **coverage** limit, surfaced honestly, not a wrong number — but it means the
  P6 estimate for a new city must include *"does its cadastre dissolve?"* as a gate, not an assumption.

**This is the single highest-leverage generalization** (see §5) — fixing the dissolve lifts every
width- or block-depth-keyed jurisdiction at once.

---

## 4 — Mapping onto the P0–P9 pipeline (what each stage reuses)

| Stage | Reuses (ports) | Builds (per-jurisdiction) |
|---|---|---|
| **P0 Scaffold** | `jurisdictions/_TEMPLATE/` (copy verbatim) | fill the placeholders |
| **P1 Legal structure** | the `parcel→instrument→classification→article` question | the actual chain; the derived-plan-trap check |
| **P2 Source discovery** | the `VERIFIED-LIVE / document / absent` taxonomy; unfiltered-count-first discipline | the endpoints |
| **P3 Parcel + geometry** | **the C57 adapter contract + proxy template** (§1.1) | the adapter body + secret |
| **P4 Rule extraction** | the `SOURCES.md` per-field gate | the numbers, human-verified |
| **P5 Rule-kind mapping** | the C58 §2.2 kind catalogue; `insetPolygonPerEdge` + bisection primitives | which kind per zone |
| **P6 Pack authoring** | **the registry three-outcome seam** (§1.2) + refusal mechanism (§1.3) | the pack + its registration (a data addition) |
| **P7 Verification** | `VERIFICATION.md` template + the L-449 gate | the human sign-off |
| **P8 Measure resolution** | the "failure ≠ empty", named-denominator discipline | the number |
| **P9 Close & NEXT** | the `NEXT.md` template + TRIP-WIRES | the resume steps |

---

## 5 — Generalization worth making (a PROPOSAL — NOT applied here)

⚠ **No code was changed by this document**, and `registry.ts` / `index.ts` were deliberately **not
touched** — they are the L-598 collision hotspot where three pack-authoring agents are working
concurrently. The following are proposals for the orchestrator to apply serially:

1. **Lift the block-ring dissolve to a first-class, jurisdiction-parameterised step (highest leverage).**
   Today it is a Barcelona-tuned function that silently gates `streetWidth` and `blockDerivedDepth`
   across all of Spain (§3). Making its tiling assumptions explicit inputs (and measuring per-city
   success as a P3 gate) would turn "does the alignment machinery work here?" from a runtime surprise
   into a discovery-stage answer. *No `registry.ts` edit — this is `geometry/` + a probe.*

2. **Add a `parcel→instrument` dispatch mode to the registry, alongside `packsByZone`.** The current
   registration is zone-code-only (§1.2 limit); Barcelona's 63% derived-planning land and every
   Spanish city's derived-plan structure need instrument-keyed dispatch. *Diff sketch, for serial
   application only:* extend `JurisdictionRegistration` with an optional
   `instrumentDispatch?: (parcelInstrumentId) => ZoneDisposition`, consulted in
   `resolveZoneDisposition` **after** `packsByZone` and **before** the coverage refusal, preserving the
   existing precedence. This is additive and does not alter any current pack's behaviour — but it MUST
   be authored by whoever owns `registry.ts` next, not merged concurrently.

3. **Promote `streetWidth.ts`'s "supplies (a) block source, (b) width→height table, (c) declared-width
   override" note (lines 51–55) into the `_TEMPLATE` P5 checklist** so a new width-keyed jurisdiction
   is prompted for exactly those three inputs. *Docs-only — already reflected in `_TEMPLATE/README.md`.*
