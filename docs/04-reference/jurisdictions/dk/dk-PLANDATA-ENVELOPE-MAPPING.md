# Denmark — PLANDATA → Buildable-Envelope Mapping (the L-449 signed source)

> **Status:** Legislation axis = **DERIVED (L-449 SIGNED, founder, 2026-07-30)** · Live cadastre /
> PLANDATA access = **DEFERRED** (Datafordeler admin bootstrap blocked — Danish **MitID** identity
> gate, the same access class as Swedish **BankID**). This is an *offline-legislation* jurisdiction:
> the rules are signed and shippable with **no** live-data dependency; the live data half is deferred,
> not broken.
>
> **This file is the canonical rule-pack source.** The executable form is
> `packages/site-parcel-data/src/rulepacks/dkPlandataEnvelope.ts`; the parcel-data half is
> `packages/site-parcel-data/src/parcelProviders/dkMatrikelParcelProvider.ts` (a deferred stub).
> Governing: **C58** (fidelity/provenance), **ADR-0269** (curate-then-serve), **L-449** (the human
> sign-off), **BR18** (bygningsreglementet.dk §168–186, the primary legal source).

---

## 1 — L-449 SIGNED (2026-07-30): the PLANDATA → envelope mapping

The founder signed this mapping against the BR18 primary source. Denmark publishes its planning
envelope as first-class, machine-readable WFS attributes on the adopted-plan features at
`geoserver.plandata.dk` (VERIFIED-LIVE 2026-07-23). The signed mapping from those attributes to a
buildable envelope is:

| Plandata WFS field (short) | Legal name | Maps to | Rule | Confidence |
|---|---|---|---|---|
| `maxbygnhjd` | *maks. bygningshøjde* (`maksbygningshojde`) | `maxHeightM` (m) | direct passthrough | 99% |
| `bebygpct` | *bebyggelsesprocent* (`maksbebyggelsesprocent`) | `farRatio` | **`FAR = bebyggelsesprocent / 100`** | signed |
| `maxetager` | *maks. antal etager* | `maxStoreys` | floor to an int (never over-stated) | signed |

> ⚠ The code keys on the **WFS short names** (`bebygpct` / `maxbygnhjd` / `maxetager`) — that is what
> the ingestion actually emits (`server/plandataZoningProxy.js`,
> `providers/mapPlandataToZoningRecord.ts`, verified against the GeoServer `DescribeFeatureType`).
> The long legal names above are the BR18/Plandata terms, not the emitted keys.

### The `FAR = bebyggelsesprocent / 100` legal basis (BR18 §168–186)

BR18 (bygningsreglementet.dk §168–186) defines *bebyggelsesprocent* as
**"etagearealets procentvise andel af grundens areal"** — gross floor area ÷ site area × 100. That
**is** a floor-area ratio expressed as a percentage, so:

```
FAR = bebyggelsesprocent / 100        e.g.  40 % → FAR 0.40      120 % → FAR 1.20
```

*bebyggelsesprocent* is **NOT** ground coverage: it maps to `plotRatioFAR` **only**. Coverage stays
`null` (Plandata's standard plan fields publish no separate coverage %; reusing the FAR number for
both would be a fabrication). Per-edge setbacks (*byggelinjer*) are a separate dataset → `null`.

---

## 2 — ⚠ HARD REQUIREMENT: the bebyggelsesprocent DENOMINATOR SCOPE

`bebyggelsesprocent` is a **ratio**, and BR18 (and Plandata's own guidance) make its **denominator
legally variable**. The same 40 % means three different things depending on what it is computed over:

| `densityScope` | Danish basis | What the % is *of* | Envelope treatment |
|---|---|---|---|
| `parcel` | *det enkelte matrikelnummer* / *grundens areal* | this parcel | **FAR = pct/100** (a real number the envelope may use) |
| `property` | *den enkelte ejendom* | the whole property (may span several matrikler) | **FAR WITHHELD** (null + cited reason) |
| `planningArea` | *området som helhed* / *under ét* | the whole plan area (shared budget) | **FAR WITHHELD** (null + cited reason) |

**A 40 % "whole-area" value is NOT 40 % per lot.** Ignoring the scope and treating every
bebyggelsesprocent as a parcel-FAR is exactly the *envelope-overstates-on-partial-data* failure class
(§CONTEXT-DATA-HONESTY; memory `envelope-solid-overstates-partial-data`). So this is a **hard
requirement**, not a nicety:

- The rule pack models an **explicit `densityScope: 'parcel' | 'property' | 'planningArea'`** and the
  envelope solid **USES** it. Height and storeys are absolute caps — scope-independent — so they
  always pass through; only the FAR ratio is scope-gated.
- **Parcel scope is the ONLY path that produces a FAR number.** `property` / `planningArea` /
  **unknown** (scope not encoded/ingested) → the FAR is **honestly withheld** (`plotRatioFAR: null`)
  with a cited reason, and the raw pct rides on as a *fact* — never as an allowance.
- **Unknown ≠ parcel.** If the scope attribute is not ingested, the FAR is withheld, because assuming
  per-parcel would silently mis-scale a whole-area value.

### Where the FAR denominator is chosen

The buildable-envelope solid multiplies FAR by the **parcel** area:
`farLimitedHeight.ts::computeFarLimitedHeight` — `maxGFA = maxFAR * parcelAreaM2` — consumed by
`ZoningRulesEngine.computeBuildableEnvelope`. That denominator is **hardwired to the parcel**, and the
engine is jurisdiction-agnostic (C58 §1.5 — it must carry no DK-specific branch). So the only FAR
value correct to feed it is a **parcel-scoped** one. The DK pack therefore emits `plotRatioFAR` **only**
at parcel scope; for any other scope it emits `null`, so FAR does not bind and the volume is honestly
**under-stated** rather than confidently **over-stated**. An L-449 `TODO` sits at that denominator line
for the day the engine grows a real `densityScope` parameter (then property scope could denominate by
property area, and planningArea could refuse there with the shared-budget reason).

---

## 3 — Offline legislation vs deferred live data (they are SEPARATE)

Per the founder's 2026-07-30 scope ruling, Denmark is **"offline legislation + deferred live data"**,
the same shape as Sweden:

- **Offline legislation (signed, shippable now):** the mapping above, implemented as the DK planning
  **rule pack** (`dkPlandataEnvelope.ts`). It needs **no** live data — the envelope math runs on the
  signed rules over whatever geometry it is handed.
- **Deferred live data (access-blocked, not a code gap):** the Matriklen cadastre and live PLANDATA
  sit behind **Datafordeler**, whose administrator/service-user bootstrap requires a **Danish MitID**
  identity PRYZM cannot obtain — the same access class that blocks Swedish **BankID**. So there are no
  live Datafordeler/PLANDATA credentials.
  - The **parcel provider** (`parcelProviders/dkMatrikelParcelProvider.ts`) is a **deferred stub** on
    the canonical interface: package-local `CadastralParcel` type, `/api/parcel/dk` proxy path,
    injectable fetch, never-throws, typed OTel span. Its `fetchParcelAtPoint` returns `null` (no live
    access attempted) → the registry falls back to the **OSM building footprint** (graceful, honestly
    labelled, never a fabricated parcel). The Datafordeler adapter is a **single method-body swap**
    behind the `// DEFERRED:` seam — no change to the buildability engine, rule pack, or model.

The two are proven separate in `__tests__/dkPlandataEnvelope.test.ts`: the signed envelope math
produces a real envelope with a stub/OSM-style ring and **no** live-data dependency, while the parcel
provider stub returns `null` without ever calling an injected fetch.

---

## 4 — What is signed vs still open (honesty)

**Signed (L-449, 2026-07-30):** the three-field mapping, `FAR = bebyggelsesprocent/100` on the BR18
basis, and the densityScope hard requirement.

**Still open (unchanged by this signing — see `sources/VERIFICATION.md`):**
- **§USABLE-FALLBACK instrument precedence** — a dimensionless local plan shadowed by the richer
  `kommuneplanramme` beneath it (a Danish-planner legal call).
- **Byggefelt bindingness semantics** (`bygvejledende` / `bygkunifelt` / `iomfangreg`) → whether a
  byggefelt footprint is a hard cap; gates any byggefelt→`maxCoverage` treatment.
- **The density-scope WFS attribute is not yet ingested.** The current mapper reads only `bebygpct`
  (scope-blind). Until the *beregningsgrundlag* attribute is wired, the scope is treated as **unknown
  → FAR withheld** by the rule pack. Confirming the exact WFS field name is a probe-don't-assume
  wiring step (`parseDkDensityScope` is ready for the documented value phrasings).

**Realistic Denmark completion target: ~70–80%**, pending ingestion validation — **NOT auto-100**.
The residual is data-quality / scope-encoding per municipality plus the access-deferred parcel/live
axes (a credential/access gap, not fabricatable — C58 §1.4), **not** a legislation gap.
