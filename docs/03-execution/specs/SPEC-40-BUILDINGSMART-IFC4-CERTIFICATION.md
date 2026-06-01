# SPEC-40 — buildingSMART IFC4 Certification (Reference View + Design Transfer View)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Standards lead + Architecture lead |
| Phase | Phase 4 (M37–M42) |
| Sprint | S73 (start) → S84 (close) — runs the full phase |
| References | `12-` §3; `[strategic ADR-008]`; `[strategic ADR-035]` |

---

## §1 Why this SPEC exists

buildingSMART IFC4 certification is the **single most market-credible** open-BIM badge. Certified tools appear on `https://www.buildingsmart.org/certification/`. UK government, EU public-sector, Singapore BCA, Australian NATSPEC, Spanish es.BIM, German BIM Cluster all reference certified-tool lists in procurement. PRYZM 2 GA ships IFC4 read+write (per `[strategic ADR-008]`); SPEC-40 is the **certification submission programme**.

Per `[strategic ADR-035]` the scope is **RV (Reference View) + DTV (Design Transfer View)** — the two most common certifications. Coordination View 2.0 is deferred to post-Phase-4 (CV 2.0 is being deprecated in favour of DTV).

## §2 The contract (binding)

### §2.1 Submission scope per `[strategic ADR-035]`

- **Reference View (RV) 1.2** — read + write certification. The minimum for federation use.
- **Design Transfer View (DTV) 1.0** — read + write certification. Required for cross-tool authoring round-trip.
- Coordination View 2.0 — explicitly out of scope (deferred / deprecated).

### §2.2 Phases of certification (per buildingSMART process)

1. **Self-test** — PRYZM team runs official test fixtures locally. (S73–S78)
2. **Provisional results submission** — to buildingSMART; cert lab reviews. (S79)
3. **Independent lab assessment** — TUM or KIT or similar runs assessment. (S80–S82)
4. **Remediation** — fix every red item. (S82–S83)
5. **Re-test + sign-off** — final independent run; certification awarded. (S84)
6. **Public listing** — buildingSMART website + PRYZM marketing. (M42)

### §2.3 Test fixture coverage

The buildingSMART RV + DTV fixture set covers ~200 test cases across:
- Geometric primitives (extrusion / sweep / boolean / brep).
- Spatial structure (Project / Site / Building / Storey / Space).
- Typing (IfcTypeObject + IfcRelDefinesByType).
- Properties (IfcPropertySet + IfcQuantitySet + IfcMaterialProperties).
- Presentation (IfcStyledItem + IfcCurveStyle + IfcSurfaceStyle).
- Annotation (IfcAnnotation + IfcGrid).
- Aggregation (IfcRelAggregates + IfcRelContainedInSpatialStructure).
- Materials (IfcMaterialLayerSet + IfcMaterialProfileSet).

Each fixture is a `.ifc` round-trip: import → re-export → byte-equivalence (within tolerance per buildingSMART rules).

### §2.4 CI integration

Every PR runs the full RV + DTV fixture set in CI. Any regression hard-fails. CI invokes the official buildingSMART fixture toolchain (Java jar; cached in CI image).

## §3 Architecture

```
tests/buildingsmart/
  fixtures/                ← 200+ official .ifc test fixtures (cached from buildingSMART)
  runner/
    rv-runner.ts           ← RV per-fixture pipeline
    dtv-runner.ts          ← DTV per-fixture pipeline
  reports/
    rv-report.html         ← per-fixture pass/fail summary (CI artefact)
    dtv-report.html

packages/ifc/
  src/import/              ← already shipped at GA via ADR-008
  src/export/              ← already shipped at GA via ADR-008
  src/certification/       ← per-fixture quirks + work-arounds (data-only, not in production code path)
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S73 D1 | submission package starts; ADR-035 ratified |
| S73–S78 | self-test full fixture suite; iterate import + export until pass rate ≥ 95% |
| S79 | provisional submission to buildingSMART; cert lab engagement (TUM or KIT) |
| S80–S82 | independent assessment; remediation cycles |
| S83 | re-test on independent lab |
| S84 | certification awarded; press; website listing; certified-tool-list submissions to UK GovS / BCA / NATSPEC / es.BIM / German BIM Cluster |

## §5 NFT targets (and gates)

| Workload | Target |
|---|---|
| RV import pass rate (200 fixtures) | ≥ 99% by S82, 100% by S84 |
| DTV import pass rate | ≥ 99% by S82, 100% by S84 |
| RV export pass rate | ≥ 99% by S82, 100% by S84 |
| DTV export pass rate | ≥ 99% by S82, 100% by S84 |
| Round-trip byte-equivalence (within tolerance) | 100% by S84 |
| Independent lab final report | GREEN — non-negotiable Phase 4 exit gate |

## §6 Anti-patterns forbidden

- Self-attesting certification. Independent lab is mandatory.
- Certifying RV without DTV (DTV is the more valuable badge for cross-tool authoring; do both or neither).
- Branch-only fixtures (every regression hard-fails on every PR).
- Skipping fixture set updates when buildingSMART releases new ones (subscribe to bS notifications; treat fixture updates as a bug fix sprint).

## §7 Cross-references

- `[strategic ADR-008]` IFC scope (provides the read/write substrate)
- `[strategic ADR-035]` certification scope
- SPEC-50 ICDD (consumes certified IFC4 in containers)
- SPEC-58 outcome pricing (certified output is a metered deliverable)
