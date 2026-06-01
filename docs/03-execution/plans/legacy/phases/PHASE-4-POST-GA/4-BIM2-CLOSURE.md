# Phase 4 — BIM 2.0 Contractual Closure
## Y4 Q1 + Q2 · Months 37–42 · Sprints S73–S84

> **Authority**. Subordinate to: SPECs 32–40 → strategic ADRs 031–038 → `13-AEC-WISHLIST-SUPPLEMENT.md` → `12-BIM-2-AND-3-POST-GA-ROADMAP.md` → this phase doc.
>
> **Coalescing-window invariant**: 250 ms per ADR-010 (unchanged from pre-GA).

---

## Executive Summary

**Goal**: at end of M42, PRYZM 2 is the **only web BIM platform** that satisfies every line of an ISO 19650 / PAS 1192 / Singapore BCA / GSA RFP without external tools. This unlocks UK + EU + Singapore + Australia government-mandated work (TAM ~$3.2B/yr per Stantec 2024).

**The 9 binding deliverables of Phase 4** (each with its own SPEC):
1. **CDE module** with ISO 19650 status codes + approval workflow (SPEC-32)
2. **Stakeholder Review Wedge** — free unlimited reviewer seats per project (SPEC-33)
3. **Hybrid Data Sovereignty** — local / cloud-region / hybrid / self-host (SPEC-34)
4. **Browser Security & Enterprise Hardening** — BYOK + CSP/COOP/COEP + SOC2 (SPEC-35)
5. **COBie 2.4 Export** with NIBS validator pass (SPEC-36)
6. **Federated Clash Detection** — server-side BVH on N projects (SPEC-37)
7. **MEP Systems** — HVAC + Electrical + Plumbing-System + Sprinkler + Gas (SPEC-38)
8. **EIR / BEP / TIDP / MIDP** document chain with CDE gate enforcement (SPEC-39)
9. **buildingSMART IFC4 Certification** — RV + DTV awarded by independent lab (SPEC-40)

**Phase 4 exit gate (non-negotiable)**: buildingSMART certification GREEN by S84. Without it, Phase 4 marketing positioning collapses and Phase 5 acquisitions become unfundable.

---

## §0 Reading Conventions

ADR citation: `[strategic ADR-NNN]` for ADRs 001–050; `[ADR NNNN-slug]` for sprint-scoped ADRs at `docs/02-decisions/adrs/`. SPEC: `SPEC-NN §X.Y`. Bare references forbidden.

---

## §1 Track Allocation

### Track A — Server / standards / engine (Agent A + 2 senior engineers + 1 IFC cert specialist + 1 MEP domain expert)

| Item | Sprint |
|---|---|
| `apps/cde/` skeleton + state machine + signer (SPEC-32) | S73 |
| `tests/buildingsmart/` self-test suite + cert package (SPEC-40) | S73→S84 (background) |
| `packages/cobie-mapper/` + 18 GA-family mappings (SPEC-36) | S75 |
| `packages/sovereignty/` + regional cluster deploy (SPEC-34) | S75 |
| `packages/encryption/` BYOK envelope crypto + KMS adapters (SPEC-35) | S76 |
| `apps/clash-engine/` + rule engine + 50 default rules (SPEC-37) | S76–S77 |
| `plugins/mep-{hvac,electrical,plumbing-system,sprinkler,gas}/` (SPEC-38) | S78–S80 |
| `packages/iso-19650-docs/` EIR parser + BEP generator (SPEC-39) | S81 |
| SOC 2 Type 2 evidence pipeline (SPEC-35) | S82 |

### Track B — Editor / UI / DX (Agent B + 1 enterprise sales-engineering hire)

| Item | Sprint |
|---|---|
| CDE UI + status badges + revision diff (SPEC-32) | S73–S74 |
| `apps/viewer/` + redline + vote UI (SPEC-33) | S74 |
| sovereignty mode selector UI + region picker (SPEC-34) | S75 |
| CSP / COOP / COEP enforcement; CSP report-only ramp (SPEC-35) | S76 |
| COBie mapping editor + live preview (SPEC-36) | S75 |
| clash-browser UI (SPEC-37) | S76–S77 |
| MEP system viewers + panel-schedule UI (SPEC-38) | S78–S80 |
| ISO 19650 doc chain UI (EIR upload, BEP editor, TIDP/MIDP) (SPEC-39) | S81 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| ADR-031 ratified | S73 D1 |
| ADR-035 ratified (cert scope) | S73 D1 |
| ADR-032 ratified (clash DSL) | S76 D1 |
| ADR-033 ratified (MEP propagation) | S78 D1 |
| ADR-034 ratified (COBie fallback) | S75 D1 |
| ADR-036 ratified (reviewer pricing) | S74 D1 |
| ADR-037 ratified (sovereignty default) | S75 D1 |
| ADR-038 ratified (BYOK custody) | S76 D1 |
| Independent buildingSMART lab engaged | S79 D1 |
| Annual pen-test + remediation | S82 |
| SPEC-31 §4 Phase-4 largest-fixture re-bench | S84 |
| Phase 4 demo recording (8 min) on real public-sector pilot | S84 D7 |
| `apps/bench/reports/M42-phase4.md` | S84 D7 |

---

## §2 Sprint-by-Sprint Detail

### S73 — CDE foundations + IFC certification kickoff
- **Track A**: SPEC-32 lands; ADR-031 + ADR-035 ratified; `apps/cde/` skeleton; 6 tables; state machine S0→S5 happy path; revision signer (extends ADR-021 keys). buildingSMART self-test starts on official RV fixture set.
- **Track B**: CDE UI in `apps/editor/src/cde/`; status badges; revision history viewer; submit-for-approval flow.
- **Bench**: `cde-status-transition.bench.ts` — 1,000 transitions/s, p95 < 10 ms.
- **Exit**: `[ ]` SPEC-32 §2.1 state machine ships; `[ ]` IFC4 RV pass rate ≥ 90% (target 100% by S84).

### S74 — CDE comments + tags + Stakeholder Review Wedge (SPEC-33)
- **Track A**: SPEC-33 lands; ADR-036 ratified; `cde_comments` + `cde_tags` + `cde_releases` tables; tag-based release semantics.
- **Track B**: `apps/viewer/` skeleton (read-only); `plugins/redline/` strokes + area marks + text marks; `plugins/review-vote/` approve/reject/revise UI; reviewer magic-link flow.
- **Bench**: `cde-release-diff.bench.ts` — 10K-element release diff < 5 s p95; `viewer-cold-load.bench.ts` — < 2 s p95.
- **Exit**: `[ ]` reviewer can open published release, redline, vote on revision; `[ ]` author sees rollup.

### S75 — COBie + Hybrid Sovereignty
- **Track A**: SPEC-36 + SPEC-34 land; ADR-034 + ADR-037 ratified; COBie xlsx generator + 18 family mappings + NIBS validator integration; `packages/sovereignty/` + first 3 regional clusters (UK + EU-FR + US-East); CDE-state hook auto-triggers COBie generation.
- **Track B**: COBie mapping editor UI + live preview; sovereignty mode selector UI; region picker.
- **Bench**: `cobie-export.bench.ts` — 5K-element < 30 s p95, NIBS validator pass.
- **Exit**: `[ ]` 5K project produces valid COBie .xlsx; `[ ]` 3 regional clusters serving traffic; `[ ]` per-region sync latency < 250 ms.

### S76 — Browser Security + Federated Clash (architectural)
- **Track A**: SPEC-35 + SPEC-37 land; ADR-032 + ADR-038 ratified; `packages/encryption/` envelope crypto + AWS KMS adapter; `apps/clash-engine/` skeleton + Federator + 20 architectural rules.
- **Track B**: strict CSP / COOP / COEP rolled to staging in report-only mode for 7 days; clash-browser UI v1 (list + filter + screenshot).
- **Bench**: `clash-engine.bench.ts` — 10K-element clash < 60 s p95.
- **Exit**: `[ ]` BYOK working with AWS KMS; `[ ]` CSP report-only deployed; `[ ]` 10K clash green.

### S77 — Federated Clash (MEP + auto-classification)
- **Track A**: rule packs (arch-vs-struct, arch-vs-MEP-HVAC, arch-vs-MEP-electrical, arch-vs-MEP-plumbing); LLM `AutoClassifier` per SPEC-31 §3 emission curve.
- **Track B**: clash approval workflow (assign-to-discipline, comment, mark-resolved); re-clash on release.
- **Bench**: `clash-engine-large.bench.ts` — 50K-element 3-discipline < 5 min p95.
- **Exit**: `[ ]` 50K 3-discipline clash green; `[ ]` AI emission stays within SPEC-31 §3 curve.

### S78 — MEP HVAC
- **Track A**: SPEC-38 lands; ADR-033 ratified; `plugins/mep-hvac/` (store, handlers, producer, committer, tool); duct geometry; system graph; ASHRAE 1.A sizing v1; equipment connection (AHU + VAV + Diffuser + Return); fitting library.
- **Track B**: HVAC system viewer (colour + flow arrows + sizing badges); HVAC system panel.
- **Bench**: `produce-hvac-system.bench.ts` — 200-fitting < 1.5 s p95.
- **Exit**: `[ ]` user creates supply-air system from AHU through 200 fittings to diffuser, sized correctly.

### S79 — MEP Electrical + cert lab engagement
- **Track A**: `plugins/mep-electrical/`; cable tray + conduit; circuit logic; panel-schedule generation; load calc v1; **buildingSMART independent lab (TUM or KIT) engaged**.
- **Track B**: panel-schedule viewer (re-uses sheet engine); per-circuit overlay.
- **Bench**: `produce-electrical-system.bench.ts` — 50-circuit < 800 ms p95.
- **Exit**: `[ ]` 50-circuit panel schedules; `[ ]` cert lab agreement signed.

### S80 — MEP Plumbing-System + Sprinkler + Gas
- **Track A**: `plugins/mep-plumbing-system/` + `plugins/mep-sprinkler/` + `plugins/mep-gas/`; pipe geometry; flow direction; sizing v1 per standard.
- **Track B**: cross-MEP system viewer.
- **Bench**: `produce-plumbing-system.bench.ts` — 100-fitting < 1.2 s p95.
- **Exit**: `[ ]` all 5 MEP plugins shipping; `[ ]` cross-MEP viewer green.

### S81 — EIR / BEP / TIDP / MIDP
- **Track A**: SPEC-39 lands; `packages/iso-19650-docs/`; EIR parser (LLM-assisted); BEP generator; TIDP/MIDP scheduler; CDE gate enforcer.
- **Track B**: EIR upload, BEP draft + edit, TIDP/MIDP table editor, status-gate enforcement UI.
- **Bench**: `eir-to-bep.bench.ts` — 50-page EIR → BEP draft < 30 s p95.
- **Exit**: `[ ]` cannot enter S2 without approved BEP; `[ ]` cannot enter S4 without TIDP rows delivered.

### S82 — SOC 2 + pen-test + cert lab assessment
- **Track A**: SOC 2 Type 2 evidence pipeline live (Drata integration); annual pen-test (independent firm); fix all critical/high before D9; cert-lab assessment delivers preliminary report.
- **Track B**: FedRAMP Moderate gap analysis; ATO sponsorship outreach starts.
- **Exit**: `[ ]` 0 critical pen-test findings open; `[ ]` SOC 2 evidence freshness < 24 h.

### S83 — Cert remediation + 4D bridge skeleton
- **Track A**: complete buildingSMART submission (RV + DTV); fix every red item from preliminary tests.
- **Track B**: 4D bridge skeleton — `packages/four-d-bridge/` MS Project XML + Asta P3 XER + Synchro JSON importers; Gantt sidebar; programme-to-element link table.
- **Bench**: `four-d-link-resolution.bench.ts` — 1,000-element programme link < 200 ms p95.
- **Exit**: `[ ]` cert lab final RV + DTV pass rate ≥ 99%.

### S84 — Phase 4 closeout: cert green, large-fixture re-bench, M42 demo
- **Joint**: independent lab confirms buildingSMART certification GREEN — **non-negotiable Phase 4 exit gate**.
- SPEC-31 §4 Phase-4 checkpoint: 10K-wall × 50-level + 5,000-MEP-element + federated clash run completes within all M36 baselines + 10% headroom.
- 8-min M42 demo screencast: full ISO 19650 workflow on a real public-sector pilot project (1 case study customer secured by S78 D1 deadline).
- Press release: "PRYZM 2 is the first web BIM tool with buildingSMART IFC4 certification + ISO 19650 native CDE + COBie 2.4 export + federated MEP clash."

---

## §3 NFT Targets (Phase 4, binding)

| Workload | Target |
|---|---|
| 10K-element + 5K-MEP federation, 3 disciplines, full clash | < 60 s p95 |
| 50K-element + 10K-MEP federation, 3 disciplines, full clash | < 5 min p95 |
| COBie export, 5K-element | < 30 s p95, valid .xlsx |
| EIR → BEP draft, 50-page EIR | < 30 s p95 (LLM-assisted) |
| ISO 19650 status transition | < 10 ms p95 |
| 200-fitting HVAC system bake | < 1.5 s p95 |
| 50-circuit electrical panel bake | < 800 ms p95 |
| 100-fitting plumbing system bake | < 1.2 s p95 |
| Viewer cold-load (10K-element model) | < 2 s p95 |
| Per-region sync latency | < 250 ms p95 |
| BYOK key rotation | < 5 min |
| CSP violations on production | 0 |

K3-F: > 10% regression on any of the above halts forward Phase 4 work.

---

## §4 Phase 4 Cut List (per `[strategic ADR-018]` extension)

12 sprints. Cut order if behind by > 3 sprints at S78 D9 retro:

1. **4D bridge skeleton (S83)** → defer to Phase 5 §4.3 S85.
2. **MEP Gas + Sprinkler (S80 partial)** → defer to Phase 5.
3. **FedRAMP gap analysis (S82)** → defer to Phase 5.
4. **(Last resort) buildingSMART DTV submission (S83)** → keep RV only; DTV in Phase 5.

**Non-negotiable items at Phase 4 exit**:
- CDE (S73–S74)
- Stakeholder Review Wedge (S74)
- Hybrid Sovereignty (S75)
- COBie (S75)
- Browser Security baseline (S76)
- Federated clash architectural + MEP (S76–S77)
- MEP HVAC + Electrical (S78–S79)
- EIR/BEP/TIDP/MIDP (S81)
- buildingSMART **RV** certification (S73–S84)

---

## §5 Phase 4 Exit Criteria

- `[ ]` All 9 SPECs (32–40) shipped per their §4 sprint rollouts.
- `[ ]` All 8 strategic ADRs (031–038) ratified.
- `[ ]` buildingSMART RV + DTV certification GREEN by independent lab.
- `[ ]` SOC 2 Type 2 evidence pipeline live and fresh.
- `[ ]` 1 public-sector pilot customer in production using full ISO 19650 workflow.
- `[ ]` 50 paying customers, $5M ARR (UK + Singapore launch).
- `[ ]` Phase 4 NFT targets (§3) GREEN.
- `[ ]` SPEC-31 §4 Phase-4 largest-fixture checkpoint within +10% of M36 baseline.
- `[ ]` `apps/bench/reports/M42-phase4.md` filed.
- `[ ]` 8-min M42 demo recorded.
- `[ ]` Phase 5 acquisition conversations open with Pascal team + 1 render company + 1 BIM consultancy.
