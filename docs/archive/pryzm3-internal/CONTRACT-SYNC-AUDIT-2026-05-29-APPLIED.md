# Contract Sync Audit (2026-05-29) — APPLIED

> **STATUS — APPLIED 2026-05-29.** The amendments identified below were applied DIRECTLY to the canonical contract files in the same session, per the CLAUDE.md rule. This document is archived as the record of WHY each contract section changed; the canonical truth now lives in the contract files themselves.
>
> **Edits made:**
> - C09 §3.4 — extended with §3.4.1 (auto-pipeline chain + §CHAIN-TIMEOUT + §RELIABILITY + §POLL-TELEMETRY + §F-Sprint-5 + §HELP) and §3.4.2 (modal contract: §MODAL-DYNAMIC + §ROOM-AREAS + §WINDOW-SYMBOLS + §A11Y + §BUILD-TOAST).
> - C15 — added §3.0 referencing ADR-0055 P3b default-ON + the layered/openings P4 backlog.
> - C17 — apartment row updated to reflect auto-pipeline + §11 modal extensions.
> - C10 — added §2.4 (user-facing observability events: §VALIDATE-CACHE / §VALIDATE-TOAST / §BUILD-TOAST) and §2.5 (§POLL-TELEMETRY).
> - C05 — added §1.2.1a (§QUOTA-EVICT localStorage version-history eviction).
> - C06 — extended §1.1 invariants with the §SKEL-MATCH landing-skeleton parity rule.
> - Two new SPECs created: `SPEC-CEILING-LAYOUT-ENGINE.md` + `SPEC-LIGHTING-LAYOUT-ENGINE.md` (siblings of SPEC-TGL and SPEC-FURNITURE).
>
> ADR-0056 (V2 promotion) and the C03 cosmetic table call-out were assessed as optional and not applied.

---

**Companion to** `APARTMENT-LAYOUT-STATUS-2026-05-29.md`, `APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md`, `REMAINING-WORK-CONSOLIDATED-2026-05-29.md`.

**Scope.** Comparing the canonical PRYZM contracts (C00–C17 + `41-ELEMENT-PREVIEW-VISUAL-CONTRACT.md`) against the latest developments since 2026-05-20 (~70 commits, `21f1bbf..HEAD`).

**CLAUDE.md rule.** *"When code disagrees with a contract, the code is wrong — fix the code, or raise a superseding ADR; never write a new `*-AUDIT.md` derivative doc. Edit the canonical `C0N-*.md` in place."* This document is the audit; the follow-up is **direct edits to the contract files**, not a new derivative.

---

## §1 — In sync (no action needed)

| Contract | Evidence |
|---|---|
| **C09 §3.4 Apartment Layout Generation** | Already references SPEC-APARTMENT-LAYOUT-GENERATOR + SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE + the offline D-TGL fallback. Phase A/B + ID pre-minting + the runBatch is codified. |
| **C16 Command Authoring Protocol** | Doctrines CA-DOCTRINE-L / CA-DOCTRINE-S correctly govern the new D-CE / D-LE / D-FLE / floor-finish command emitters (level-oriented, semantic-first, pre-geometry registration). No drift. |
| **C17 §4.1 / §4.3 Batch Catalogue** | Catalogue rows for `CREATE_CEILINGS_BY_ROOM`, `CREATE_FLOORS_BY_ROOM_TYPE`, `CREATE_LIGHTING_BY_ROOM` already exist + marked ✅. |
| **C15 Hosted Element** | Door/window opening cascade still matches `buildLayoutCommands` (one `wall.createOpening` per door + `opening.elementId === door id`). |
| **C05 §1.2.2 In-memory project authority** | `§STORE-UNIFY` codified 2026-05-23; unchanged. |
| **C13 Project Lifecycle & Isolation** | Recent work didn't touch project boundaries — in sync. |
| **§41 Element Preview Visual Contract** | Covers 3D + 2D creation previews; new modal SVG thumbnails are declarative (not creation previews) — out of §41 scope. |

## §2 — Needs amendment (extend existing contract in place)

Sorted by impact.

### §2.1 — C09 §3.4 — biggest gap

C09 §3.4 currently contracts only `apartment` Phase A/B. The four follow-on engines that auto-fire after `apartment.layout-executed` — **D-CE**, **D-LE**, **D-FLE**, **floor-finish** — ship in `apps/editor` triggers and have no contract pin.

**Amendments needed (one edit, multiple sub-sections):**

- **Name the three follow-on engines** alongside D-TGL with the same "L2-pure, no THREE/DOM/RNG, spans at plane boundary" doctrine clause:
  - **D-CE** (`packages/ai-host/src/workflows/ceilingLayout/`).
  - **D-LE** (`packages/ai-host/src/workflows/lightingLayout/`).
  - **D-FLE** (`packages/ai-host/src/workflows/furnishLayout/`).
- **Auto-fire chain** (`97417be`, `7a7b147`, `03577b7`, `e0a4b44`): event chain `apartment.layout-executed → (floor.layout-executed + ceiling.layout-executed) → furnish.layout-executed → lighting.layout-executed`. §CHAIN-TIMEOUT 12 s per-stage fallback. §RELIABILITY 15 s regenerate guard. §POLL-TELEMETRY for the two silent waits.
- **§F-Sprint-5 circulation gate** (`23695d3`, `727139a`): "Post-D-FLE the furnish workflow MUST run a circulation reachability gate; warnings surface via toast + `§VALIDATE-CACHE` / `§VALIDATE-TOAST`."
- **Modal contract**: pin §MODAL-DYNAMIC (`cdd28d4`) + §ROOM-AREAS (`3f157f9`) + §ROOM-AREAS-BY-NAME (`f9c3662`) + scale bar / legend (`b2c1c43`) + §WINDOW-SYMBOLS (`a827345`) as the canonical modal surface. Current text says "an SVG plan thumbnail" — should read: *"with editable per-room areas, by-name overrides, scale bar, occupancy legend, window/door symbols; edits trigger an in-place re-rank without re-prompting."*
- **Accessibility (new §3.5 or §3.4.x)**: §CLICK-FOCUS (`9ac588d`) + §A11Y keyboard activation (`b6a66f9`). *"AI approval surfaces MUST be keyboard-operable; room polygons MUST be focusable and Enter/Space-activatable."*
- **§HELP discoverability**: `pryzmShowApartmentHelp()` (`f1eaca0`) console entry-point belongs alongside the console-bypass note.

### §2.2 — C15 — ADR-0055 cross-reference

C15's wall-mesh build assumption is unchanged behaviourally, but **ADR-0055 P3b is now default-ON** (`bb54a63`). Add a sentence in C15 §3:

> The V2 envelope (`JunctionResolverV2` + `WallFootprint2D` + `WallPolygonExtruder`) is the production builder for non-layered walls; ADR-0055 + ADR-0055A. Phases P4a (layered) and P4b (openings) remain backlogged — the layered-and-openings path still routes through the legacy `WallJunctionInfill`.

### §2.3 — C17 — Phase precision on the apartment row

Row at line 132 says "✅ A1–A7 complete." Update to:

> ✅ A1–A7 + auto-pipeline (floor-finish + D-CE → D-FLE → D-LE) per C09 §3.4.

Also re-check rows that mark interior fixtures / lighting as Phase 4/⏳ — those ship Phase 2 now.

### §2.4 — C10 — toast + poll telemetry

Currently C10 treats only OTel spans. The in-app toast pipeline carries operational signals (dropped-wall count, circulation warnings) that belong here.

**New §2.4 "User-facing observability events":**
- §VALIDATE-TOAST (`540b25e`) — circulation warnings on furnish completion.
- §BUILD-TOAST (`0baf434`) — dropped-wall count in apartment completion toast.
- §VALIDATE-CACHE (`0f325cc`) — `pryzmShowFurnishWarnings()` console review.

**New §2.x "Polling / wait telemetry":** §POLL-TELEMETRY (`e0a4b44`) emits timing telemetry for the two silent waits. Codify so the pattern is reusable beyond apartment-layout.

### §2.5 — C05 — localStorage quota policy

C05 §1.2.2 covers IndexedDB tier 2.5 + in-memory tier 3 but doesn't address localStorage quota. The §QUOTA-EVICT recovery (`8463607`) is now production behaviour.

**New §1.2.x:**
> Client-side localStorage caches MUST handle `QuotaExceededError` by evicting LRU project versions; eviction MUST be silent (no user-visible toast in steady state). On unrecoverable exhaustion (no other projects to evict), the user receives a single error toast.

### §2.6 — C06 — landing skeleton parity

§SKEL-MATCH (`8028640`) keeps the landing-page skeleton CSS in lock-step with the realised LP CSS. C06 §1.1 already says PlatformRouter "MUST remove the Stage 0 app-shell skeleton" but doesn't pin token/colour parity.

**New §1.1.x:**
> Landing skeleton tokens (font colour, background gradient, heading shadow, sub-copy colour + size) MUST match the realised LP styles in `apps/editor/src/ui/styles/panels/marketingPages.ts`. Drift produces a visible flash between first paint and JS bundle load.

### §2.7 — C03 §4 — opening / door pair cosmetic

No drift, but the command table could explicitly call out the D-TGL exit cascade (`wall.batch.create` + per-door `wall.createOpening` + `door.batch.create`) as the canonical 3-step generative pattern. Cosmetic.

## §3 — Should be created

### §3.1 — SPEC-CEILING-LAYOUT-ENGINE.md (new, governed by C09 §3.4)

D-CE has no spec yet. D-TGL has `SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md`; D-FLE has `SPEC-FURNITURE-LAYOUT-ENGINE.md`. D-CE is missing the equivalent.

**Scope (~1 page):** one ceiling slab per ceilable room, archetype lookup (suspended grid in offices, plasterboard else, exclude wet-rooms), auto-fire trigger on `apartment.layout-executed`, ID pre-minting, no THREE/DOM/RNG.

### §3.2 — SPEC-LIGHTING-LAYOUT-ENGINE.md (new)

Same story for D-LE.

**Scope (~1 page):** one centred downlight per non-circulation room, archetype lookup per occupancy, auto-fires on `furnish.layout-executed` (or `ceiling.layout-executed` per the §CHAIN-TIMEOUT fallback).

### §3.3 — Generative chain orchestration (extend C09 vs new contract)

Currently scattered across `apps/editor` event subscribers. Document the chain ordering, the per-stage timeout fallbacks, the event names, the idempotency invariants (re-firing `apartment.layout-executed` MUST NOT double-emit ceilings).

**Recommendation.** Prefer extending **C09 §3.4 → §3.5** (single normative reference, no new contract file). Spin out a new C-level only if a third subsystem (e.g. structural responses) joins the chain.

### §3.4 — ADR-0056 — Wall Pipeline V2 promotion (optional)

ADR-0055 + ADR-0055A already cover the algorithm. What's missing: an ADR documenting the **promotion to default-ON** (`bb54a63`) + the explicit deferral of P4a/P4b/P4c.

**Recommendation.** Could also live as a `§P3b-COMPLETE` stamp inside ADR-0055. Lighter touch than a new ADR.

## §4 — Out of scope / not contract-shaped

These are tuning of `programRules.ts` (governed by `SPEC-ARCHITECTURAL-PROGRAM-RULES.md`) or pure code optimisations. They are NOT contract-level invariants:

- All program-rules micro-fixes: §BATH-CORRIDOR-ONLY, §ADJACENCY-PREFERENCE, §WC, §AREA-FRACTIONS, §KITCHEN-DISTINCT, §SEALED-ROOMS, §KITCHEN-ISLAND, §KITCHEN-DEFAULT-APPLIANCES, §SUB-ZONE, §SINGLE-RECT-CARVE, §EXTEND-TO-PERIMETER, §COLLINEAR-MERGE, §EXTEND-INTERIOR, §DOOR-AVOIDANCE, §HARD-MIN-SIDE-2M, §INTERIOR-HEIGHT-MATCH, §FURNITURE-SPEC.
- Perf storm fixes WS-2.A / WS-2.B / WS-2.E (`6f5fded`, `ee1d2ae`, `5ab8896`) — pure code optimisations behind C04/C10 NFTs. No contract semantics change.
- Wall-build internals (P3a-FAN-WIND-FIX `0055b03`, V2-PRETRIM-FIX `af7a493`, side-face winding `48e352b`) — covered by ADR-0055 phase tests.
- §SCC-NODE-LOAD test-infra guard (`f8def3c`) — CI guard; mention in C14 LP list at most.
- Local settings tweaks (`435a2fe`) — operational.

---

## §5 — Suggested execution order

1. **C09 §3.4 extension** — biggest gap; covers D-CE, D-LE, D-FLE, floor-finish, auto-fire chain, modal contract, accessibility, §HELP, §F-Sprint-5. One edit pass to the largest contract section.
2. **C15 ADR-0055 cross-reference** — V2 default-ON has shipped; readers of C15 need the pointer.
3. **SPEC-CEILING-LAYOUT-ENGINE + SPEC-LIGHTING-LAYOUT-ENGINE** — parity with SPEC-TGL / SPEC-FURNITURE-LAYOUT-ENGINE.
4. **C10 §2.x** — toast + poll telemetry semantics.
5. **C05 §1.2.x** — §QUOTA-EVICT localStorage policy.
6. **C06 §1.1.x** — landing skeleton parity (small but cheap).
7. **C17 row precision** + **C03 §4 cosmetic** (low priority).

Estimated effort: **half a day for items 1–6**. Items 7 are cosmetic and can ride a future commit.

## §6 — Cross-references

- `docs/00_Contracts/C00-INDEX.md` — contract suite index.
- `docs/00_Contracts/C09-AI-AND-VISIBILITY-INTENT.md` — main amendment target.
- `docs/00_Contracts/C15-HOSTED-ELEMENT-CONTRACT.md` — ADR-0055 cross-ref target.
- `docs/00_Contracts/C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md` — row precision target.
- `docs/03_PRYZM3/reference/specs/SPEC-APARTMENT-LAYOUT-GENERATOR.md` — referenced by C09 §3.4.
- `docs/03_PRYZM3/reference/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` — sibling of the two new SPECs to create.
- `docs/03_PRYZM3/reference/specs/SPEC-FURNITURE-LAYOUT-ENGINE.md` — sibling.
- `docs/03_PRYZM3/reference/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md` — where program-rules tuning belongs.
- `docs/03_PRYZM3/reference/adrs/ADR-0055-*.md` + `ADR-0055A-*.md` — V2 wall pipeline.
