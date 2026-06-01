# SPEC-37 — Federated Clash Detection

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead + Geometry kernel lead |
| Phase | Phase 4 (M37–M42) |
| Sprint | S76–S77 |
| References | `12-` §3; `[strategic ADR-032]` |

---

## §1 Why this SPEC exists

Federated clash detection (architectural ↔ structural ↔ MEP ↔ civil) is the daily contractor workflow. Today it requires Navisworks ($2,205/yr/seat) + manual model-export pipeline. The clash report is the artefact contractors and BIM coordinators spend most time on. PRYZM 2 with multi-discipline federation (SPEC-34) and MEP systems (SPEC-38) can ship clash detection **server-side, real-time, on the live federated model** — eliminating Navisworks for PRYZM-native projects.

## §2 The contract (binding)

### §2.1 Clash classification

| Class | Definition | Default action |
|---|---|---|
| **hard** | Solid intersection > tolerance (default 1 mm) | block release transition past S3 |
| **soft** | Approach within clearance threshold (per discipline rule) | flag for review |
| **clearance** | Maintenance / access clearance violation (e.g. door swing into pipe) | flag for review |
| **penetration** | Element penetrates another (legal: e.g. duct through wall, with sleeve) | auto-resolve if matching penetration record exists |
| **duplicate** | Same element instanced twice in federation | auto-resolve |

### §2.2 Rule DSL per `[strategic ADR-032]`

ADR-032 ratifies a JSON-schema-typed declarative DSL (not Python sandbox; not SPARQL). Example:

```json
{
  "id": "wall-vs-mep-duct",
  "class": "hard",
  "left": { "discipline": "architectural", "type": "wall" },
  "right": { "discipline": "mep-hvac", "type": "duct" },
  "predicate": { "intersect": { "tolerance": 0.001 } },
  "exception": { "penetrationRecord": "wall-duct-sleeve" },
  "severity": "blocker"
}
```

50 default rules ship at S77 D5 covering arch-vs-arch, arch-vs-struct, arch-vs-MEP (HVAC / electrical / plumbing / sprinkler / gas), struct-vs-MEP.

### §2.3 LLM-assisted auto-classification

Per SPEC-31 §3 AI back-pressure curve: when no rule matches, the AI host classifies the clash with reason text. Rate-limited; falls under §3 emission policy.

### §2.4 Approval workflow

Each clash row: `open | assigned | resolved | rejected | wont-fix`. Assignable to discipline lead. Re-clashes on every release per CDE state transition (SPEC-32).

## §3 Architecture

```
apps/clash-engine/        ← Node, headless, BVH-accelerated (extracts @pryzm/picking BVH)
  src/RuleEngine.ts       ← rule DSL evaluator
  src/Federator.ts        ← unions N project chunks into one BVH
  src/ClashRunner.ts      ← per-rule pass; produces ClashRow[]
  src/AutoClassifier.ts   ← LLM-assisted (per SPEC-31 §3)

packages/clash-types/     ← shared types for editor + engine
plugins/clash-browser/    ← UI list + filter + group + status + screenshot capture
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S76 D1 | `apps/clash-engine/` skeleton + ADR-032 ratified |
| S76 D3 | `Federator` unions N chunks; BVH on union |
| S76 D5 | first 20 rules (arch-only); `RuleEngine` evaluator |
| S76 D7 | `clash-browser` UI — list + filter + screenshot |
| S76 D9 | bench: 10K-element clash run < 60 s p95 |
| S77 D1 | rule pack expansion: arch-vs-struct (15 rules) |
| S77 D3 | rule pack: arch-vs-MEP (HVAC + electrical) (15 rules) |
| S77 D5 | LLM `AutoClassifier` integration (per SPEC-31 §3) |
| S77 D7 | approval workflow (assign / resolve / reject) + re-clash on release |
| S77 D9 | bench: 50K-element 3-discipline < 5 min p95 |

## §5 NFT targets

| Workload | Target |
|---|---|
| 10K-element clash run (single discipline) | < 60 s p95 |
| 50K-element 3-discipline clash | < 5 min p95 |
| Re-clash after single-element edit | < 5 s p95 (incremental BVH) |
| Per-rule evaluation cost | < 10 ms per element-pair p95 |
| Auto-classifier LLM call | per SPEC-31 §3 emission curve |
| Clash browser cold-load (1,000 clashes) | < 2 s p95 |

## §6 Anti-patterns forbidden

- Re-running the full clash on every CRDT op. Re-clash is per CDE release transition + on-demand.
- Storing clash results in the model CRDT (clashes are derived; storing them couples derived state to mutable state).
- Allowing rules in arbitrary code (sandbox escape risk; ADR-032 mandates declarative DSL).
- Skipping the duplicate-detection pre-pass (federated models often double-count instances).

## §7 Cross-references

- `[strategic ADR-032]` rule language
- SPEC-13 visibility (clash overlay rendered through visibility-intent)
- SPEC-31 §3 AI back-pressure (auto-classifier rate-limited)
- SPEC-32 CDE (state-triggered re-clash)
- SPEC-38 MEP systems (provides MEP element types for clash)
