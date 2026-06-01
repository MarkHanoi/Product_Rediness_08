# PRYZM — Documentation Gaps and Next Phases

> **Stamp**: 2026-06-01 · **Status**: ACTIVE TRACKER
>
> Enterprise-grade documentation requires more than what's currently here. This doc enumerates the gaps, sequences the work, and pairs each gap with success criteria.

## §1 — Goal

End-state PRYZM documentation should match the standard of Autodesk Forma, Stripe, Linear: **complete, consistent, in sync with code, navigable in under 60 seconds for any audience**.

Definition of "perfect":

- ✅ Every contract / ADR / spec is **discoverable** from `docs/README.md` in ≤ 3 clicks.
- ✅ Every package + plugin + app has a README.
- ✅ Code identifiers and doc identifiers match (no `XStore` in code if doc says `XService`).
- ✅ Every binding rule is in a contract; every rationale is in an ADR; every algorithm is in a spec.
- ✅ End-user docs are separate from engineering docs and live in `apps/docs-site/`.
- ✅ No legacy "PRYZM 3" references in marketing / user-facing material.
- ✅ No `*-AUDIT-YYYY-MM-DD.md` files alongside live docs — only in archive.
- ✅ Every audience (leadership · engineer · plugin author · IT admin · end user) has a clear reading path.

## §2 — Phase 0 — completed in this session (2026-06-01)

✅ 547 files migrated into the 3-layer pyramid (`01-strategy/` · `02-decisions/` · `03-execution/` · `04-reference/` · `05-guides/` · `archive/`).
✅ Cross-references rewritten (3 sed passes; ~1300 refs touched).
✅ Top-level `docs/README.md` with mental model + folder map + authority order.
✅ Per-folder READMEs at every new section (01–05 + contracts/adrs/specs/plans/status/archive).
✅ `NAMING-CONVENTIONS.md` codifying file naming, doc identifiers, brand rules.
✅ Brand decision documented: **PRYZM** (not "PRYZM 3") — see [NAMING-CONVENTIONS.md §1](./NAMING-CONVENTIONS.md).
✅ Master architecture + capabilities synthesis ([03-execution/plans/master-architecture-and-capabilities.md](./03-execution/plans/master-architecture-and-capabilities.md)).

## §3 — Phase 1 gaps — per-package + per-plugin READMEs

The biggest single doc gap. There are **78 packages + 47 plugins + 13 apps = 138 workspace members**, and most don't have a README beyond what's in `package.json description`.

| Subgroup | Count | Have README? | Action |
|---|---:|---|---|
| `packages/` (active) | 78 | ~20 do | Write 58 new READMEs |
| `plugins/` | 47 | ~5 do | Write 42 new READMEs |
| `apps/` | 13 | ~6 do | Write 7 new READMEs |

**Template** (one per package):

```markdown
# @pryzm/<package-name>

> **Layer**: L<N> · **Owner**: <team> · **Stamp**: <date>

## §1 — Purpose
One paragraph — what this package does, why it exists.

## §2 — Public API
The exports from `src/index.ts`. Brief description per symbol.

## §3 — Internal structure
Sub-folder map + key files.

## §4 — Dependencies
Which `@pryzm/*` packages this depends on (in the layer model).

## §5 — Tests
How to run the test suite; what's covered.

## §6 — Contracts + specs
Which C-contracts and SPEC-* this package implements.

## §7 — Open issues
Known gaps + planned work.
```

**Execution plan**: spawn 4–6 parallel multi-agent Explore + Write passes, ~15 packages each. Estimated 2–3 turns.

## §4 — Phase 2 gaps — code ↔ doc alignment audit

Per-subsystem alignment: does the spec match the code? Does the contract still describe what's there?

| Subsystem | Contract | Audit needed |
|---|---|---|
| Composition root | C02 | composeRuntime() 14 slots all typed? |
| Command bus | C03 | every handler path matches the documented signature? |
| Rendering | C04 | single THREE owner enforced? single rAF enforced? |
| Persistence | C05 | `.pryzm` round-trip + delta path matches spec? |
| Plugin SDK | C07 | `@pryzm/sdk` v1.0.0 publish status + iframe sandbox match? |
| Collab | C08 | Yjs CRDT semantics vs LWW reality |
| AI host | C09 | 45+ workflows in `packages/ai-host/` — every one mapped to docs? |
| Element creation | C11 | 17+ element types — every one has C11 §11 entry? |
| Hosted elements | C15 | door/window in wall opening-void logic matches contract? |
| Sheets | C24 | `plugins/sheets/` + the new `packages/drawing-primitives/src/sheet/` substrate aligned? |
| IFC | C25 | every Pset + Qto we ship reflected in C25 §3 coverage table? |
| Revit | C26 | IFC4X3-RV variant exporter shim documented? |
| Inspect | C27 | INS-α-2..α-10 substrate aligned with C27 §3-§5? |
| Data | C28 | `packages/data-engine` + Apartment Data Panel reflected in C28 scope? |
| PDF | C29 | `packages/pdf-export` aligned with C29? |
| Drawing Set | C30 | `DrawingSetStore` aligned with C30 §3? |

**Execution plan**: 16 multi-agent audits, ~3 per turn. Each agent:
1. Reads the contract.
2. Reads the implementing code.
3. Reports drift (what code does that contract doesn't say + vice versa).
4. Proposes contract amendments (in DRAFT) + spec amendments (in DRAFT).

Estimated ~6 turns.

## §5 — Phase 3 gaps — missing content

### §5.1 — User guides

The `05-guides/user/` folder has 1 file (`apartment-layout.md`). For an enterprise-grade SaaS product we need:

- [ ] `getting-started.md` — install, sign in, create first project
- [ ] `drawing-basics.md` — walls + doors + windows + slabs
- [ ] `importing-ifc.md` — IFC import workflow
- [ ] `exporting-ifc.md` — IFC export + Pset coverage
- [ ] `apartment-generation.md` (✅ exists as apartment-layout.md, may need rename)
- [ ] `family-creation.md` — using the component editor
- [ ] `collaboration.md` — multiplayer + sharing + BCF
- [ ] `marketplace.md` — browsing + installing plugins
- [ ] `pdf-export.md` — sheet export + drawing set
- [ ] `troubleshooting.md` — common issues + log capture

### §5.2 — Developer guides

The `05-guides/developer/` folder has process + demos. Missing:

- [ ] `getting-started.md` — clone, install, run dev server
- [ ] `architecture-walkthrough.md` — the 9-layer model in practice (companion to architecture.md)
- [ ] `add-a-new-command.md` — C16 cookbook (citing handlers, batch, undo, plan-view)
- [ ] `add-a-new-element-type.md` — C11 + C15 cookbook (the §11 obligation matrix)
- [ ] `add-a-new-contract.md` — when + how + numbering
- [ ] `add-a-new-adr.md` — Michael Nygard template walkthrough
- [ ] `add-a-new-spec.md` — when a spec is justified
- [ ] `debugging-the-rendering.md` — frame budget, OTel spans, picking
- [ ] `running-benches.md` — the 17 NFTs + how to add a new one
- [ ] `writing-a-plugin.md` — using `@pryzm/sdk` to author a plugin
- [ ] `local-self-host.md` — bring up the full stack locally

### §5.3 — Enterprise / IT admin guides

The `05-guides/enterprise/` folder has 1 file (`operations/status-page-and-on-call.md`). Missing:

- [ ] `self-host-install.md` — Helm + Terraform walkthrough
- [ ] `sso-setup.md` — Google + Microsoft + SAML
- [ ] `byok.md` — bring-your-own-key setup
- [ ] `plan-tiers.md` — Solo / Studio / Mid-firm / Enterprise quotas
- [ ] `backup-and-dr.md` — disaster recovery runbook
- [ ] `audit-log.md` — ISO 19650 audit trail capture
- [ ] `compliance.md` — GDPR + SOC 2 surfaces

### §5.4 — Reference material

- [ ] `04-reference/glossary.md` — BIM-specific terms (currently missing)
- [ ] `04-reference/api/` — auto-generated TypeDoc output for the public SDK
- [ ] `04-reference/file-formats/family-format.md` — `.pryzm-family` spec
- [ ] `04-reference/file-formats/ifc-dialect-notes.md` — PRYZM's IFC4X3 dialect (Pset coverage, custom property naming, RV variant)

### §5.5 — Contract gaps

- [ ] **C19** Site context model — formal contract for Site / Building / Apartment aggregate schemas (currently a DRAFT in PG0)
- [ ] **C20** Building aggregate — formal contract for multi-apartment floor-plate semantics
- [ ] **C21** Climate ingestion — EPW + NOAA + cache + invalidation
- [ ] **C22** Privacy / PII tier — data tier separation for site context
- [ ] **C23** Provenance — every AI-generated artefact must trace its inputs

(C19–C23 are the reserved-but-empty slots in the contract suite. They were noted in PG0 / GS0 work but never authored.)

### §5.6 — ADR gaps

- [ ] Migration ADR for the 2026-06-01 docs restructure (this very work — needs an ADR to seal it)
- [ ] ADR for the "PRYZM not PRYZM 3" brand decision
- [ ] ADR for the new auto-numbering convention (ADR-NNNN unified)

## §6 — Phase 4 — global sweeps

After Phases 1–3 land:

### §6.1 — "PRYZM 3" → "PRYZM" sweep

Run a sed across all current docs + marketing material, removing the version suffix in user-facing prose. Keep "PRYZM 3 architecture" / "epoch 3" only where historical context is the point.

Estimated ~3000 references to touch. Single PR.

### §6.2 — Cross-link verification

Build a link-checker CI gate. Every relative link in docs/ must resolve. Failures block merge.

### §6.3 — Reading-path verification

Manually walk the reading order from `docs/README.md §5` and verify:

- Each link works.
- Each linked doc opens onto a relevant section.
- No more than 3 clicks to any leaf.

### §6.4 — Docs-site sync

`apps/docs-site/` (Astro Starlight) is the public-facing docs. Sync the engineering-doc graph with the public docs:

- Public-friendly versions of `05-guides/user/*` get pulled into docs-site.
- Public reference (`04-reference/file-formats/`, `04-reference/api/`) gets pulled in.
- The marketplace page (`apps/marketplace-web/`) pulls plugin descriptors + family catalogue.

## §7 — Phase 5 — CI gates for documentation

Make documentation correctness lint-gateable:

| Gate | What it checks | Severity |
|---|---|---|
| `check-docs-links.ts` | All relative links in docs/ resolve | Hard-fail |
| `check-adr-immutability.ts` | RATIFIED ADRs only allow Status-line edits | Hard-fail |
| `check-contract-numbering.ts` | C-numbers are monotonic; no duplicates | Hard-fail |
| `check-spec-numbering.ts` | SPEC-numbers are monotonic | Hard-fail |
| `check-package-readme.ts` | Every `packages/*/` has a README.md | Soft-fail → Hard at 100% coverage |
| `check-plugin-readme.ts` | Every `plugins/*/` has a README.md | Soft-fail → Hard at 100% |
| `check-app-readme.ts` | Every `apps/*/` has a README.md | Soft-fail → Hard at 100% |
| `check-naming-conventions.ts` | Filenames + identifiers match the conventions | Soft-fail |
| `check-pryzm-brand.ts` | No "PRYZM 3" in marketing/user-facing docs | Hard-fail in docs-site; soft elsewhere |
| `check-doc-stamps.ts` | Every canonical doc has a `> **Stamp**:` line | Soft-fail |
| `check-archive-immutability.ts` | archive/ is one-way | Hard-fail |

## §8 — Sequenced execution plan

| Phase | Turns | Deliverable | Estimated Δtime |
|---|---|---|---|
| Phase 1 — per-package READMEs (138 files) | 4–6 | One README per package/plugin/app | 4 sessions |
| Phase 2 — code↔doc audits (16 subsystems) | 4–6 | DRAFT amendments to C-contracts + specs | 5 sessions |
| Phase 3.1 — user guides (10 files) | 2 | Complete user/ folder | 2 sessions |
| Phase 3.2 — developer guides (11 files) | 2 | Complete developer/ folder | 2 sessions |
| Phase 3.3 — enterprise guides (7 files) | 1 | Complete enterprise/ folder | 1 session |
| Phase 3.4 — reference gaps (glossary + APIs + format specs) | 2 | Complete 04-reference/ | 2 sessions |
| Phase 3.5 — contract gaps (C19–C23) | 3 | 5 new contracts in DRAFT | 3 sessions |
| Phase 3.6 — ADR gaps (3 sealing ADRs) | 1 | 3 new ADRs | 1 session |
| Phase 4.1 — PRYZM-3 sweep | 1 | Single big sed PR | 1 session |
| Phase 4.2 — link checker + reading-path | 1 | Manual verify + fixes | 1 session |
| Phase 4.3 — docs-site sync | 2 | Public docs site updated | 2 sessions |
| Phase 5 — CI gates | 2 | 11 lint gates wired into CI | 2 sessions |

**Total**: ~26 sessions to reach Autodesk-grade enterprise documentation across PRYZM.

## §9 — How we sequence

1. Phase 1 (per-package READMEs) goes first because it's the broadest gap and unlocks everything else (you can't write a code↔doc audit if the per-package doc doesn't exist).
2. Phase 2 (code↔doc audits) goes second — finds drift, proposes fixes.
3. Phases 3.x (guides + reference) parallelise.
4. Phase 4 (sweeps) waits until Phases 1–3 finish so the sweep covers the new docs too.
5. Phase 5 (CI gates) waits until all sweeps are done — the gate codifies the steady state.

## §10 — Living doc

This file is itself a status tracker. Each phase that completes flips its row to ✅ in §8. New gaps discovered during execution append to the relevant section. Updated each refresh in the same way as [03-execution/status/autonomous-session-runs-log.md](./03-execution/status/autonomous-session-runs-log.md).
