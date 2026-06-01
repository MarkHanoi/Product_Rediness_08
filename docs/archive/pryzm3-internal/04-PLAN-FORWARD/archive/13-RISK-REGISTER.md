# 09 — Risk Register + Incident Log

> **Anchored to**: every wave file in this folder (each has a §"What can go wrong" section with the wave-specific risks); `../01-VISION.md §8` (discipline rules — discipline failures are themselves risks); `../03-CURRENT-STATE.md §10` (the weekly delta log feeds the incident register here).
> **Owner**: founder + architecture lead (joint review every quarter).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§5 blocked items if a new blocker is elevated to High/Critical; §3/§4 if a risk triggers a wave change).
> **Cadence**: any new risk ≥ Medium probability is added within 1 sprint of being identified. Any risk that materialises (becomes an incident) is logged in §2 within 24 hours.

---

## §1 — Risk register (10 risks, prioritised)

Probability scale: Low (< 10 % over 5-month plan), Medium (10–40 %), High (≥ 40 %).
Impact scale: Low (≤ 1 sprint slip), Medium (2-3 sprint slip or NFT regression), High (Phase F slip or P-rule erosion), Catastrophic (project credibility damage; multi-quarter recovery).

### R1 — Slice's importer cluster larger than estimated

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | Medium |
| **Trigger** | At any of the 5 D.4 slice kickoffs in Waves 2-3, the importer count reported by `rg -l '<symbol>' src/` exceeds the budget in `01-CRITICAL-PATH-D4.md §2` by ≥ 1.5×. |
| **Leading indicator** | Slice kickoff (Day 1 of slice): re-snapshot the importer cluster. If it has grown since Wave 1 baseline, R1 fires. |
| **Mitigation** | `03-WAVE-2-3-D4-EXECUTION.md §5` decision tree: split slice into a + b. Net schedule impact 0 days if Wave 3 fits a 5-PR week. |
| **Owner** | Architecture lead |
| **Pre-mitigation cost** | Up to 1 week slip if not caught early |
| **Post-mitigation cost** | 0 days |

### R2 — Cast deletion sweep stalls because `runtime.*` slots aren't typed enough

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | High (Wave 5 slips → Wave 6 convergence gate slips → Phase F start slips) |
| **Trigger** | During Wave 5 codemod runs, a substantial fraction (≥ 20 %) of casts cannot be migrated because the typed alternative (e.g. `runtime.foo`) is `unknown` or has a missing method. |
| **Leading indicator** | End of Wave 4: `rg "unknown" packages/runtime-composer/src/types.ts` returns > 0 in `PryzmRuntime`. |
| **Mitigation** | **Wave 4 Track A MUST close before Wave 5 starts.** No parallelisation. The Wave 5 exit gate explicitly checks Wave 4's exit gate before starting. |
| **Owner** | Runtime engineer (Track A) + architecture lead |
| **Pre-mitigation cost** | 2 weeks (a slipped Wave 5 means Wave 6 convergence gate slips, then Phase F slips) |
| **Post-mitigation cost** | 1-3 days (Wave 4 may run 1-3 days over to fully type all 8 slots) |

### R3 — Phase B/C "real binding" tests get gamed (vacuous assertions)

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | Medium (gamed tests pass but real binding doesn't happen → debugging nightmare in Phase F) |
| **Trigger** | During Wave 6, a panel/toolbar binding test contains `expect(...).toHaveBeenCalled()` without `.toHaveBeenCalledWith(...)` assertion specifics. |
| **Leading indicator** | Per-PR review: architecture lead reads the test code, not just the test result. The lint rule `no-vacuous-binding-test` (`12-DISCIPLINE-AND-DOD.md §1` rule 2) catches the pattern programmatically. |
| **Mitigation** | Per-PR architecture-lead review of test code (not just merge approval); the lint rule blocks the pattern at CI. |
| **Owner** | Architecture lead |
| **Pre-mitigation cost** | Phase B/C declared "done" but real binding count is < 40 / < 30 — recovery is a Wave 7 mop-up |
| **Post-mitigation cost** | 0 days |

### R4 — rAF consolidation breaks animation timing

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | Medium (NFT #4 frame-budget regresses; user-visible jank in viewport interactions) |
| **Trigger** | During Wave 7 S85-WIRE rAF consolidation, the new `runtime.frame.requestFrame('interaction')` API has different timing characteristics than the per-tool rAF it replaces. |
| **Leading indicator** | NFT #4 (`apps/bench/frame-budget.ts`) regresses by > 10 % vs Wave 4 baseline after a per-rAF migration PR. |
| **Mitigation** | Bench runs continuously during Wave 7; rollback per-rAF migration if frame-budget regresses by > 10 %; investigate before re-attempting. |
| **Owner** | UI lead |
| **Pre-mitigation cost** | NFT #4 not at GA target; Phase F GA-2 delayed |
| **Post-mitigation cost** | 1-3 days per failed migration (rollback + investigate + re-attempt) |

### R5 — Persistent-red workflows hide a real Wave 5 bug because they are quarantined

| Field | Value |
|---|---|
| **Probability** | Low |
| **Impact** | High (a Wave 5 cast deletion may break a behaviour the quarantined test would have caught) |
| **Trigger** | A Wave 5 PR makes a change that would have been caught by `pryzm-vi-parity` (still quarantined until late Wave 5) but is not surfaced because the test is not running. |
| **Leading indicator** | A bug surfaces in the editor preview that the quarantined test would have caught. |
| **Mitigation** | De-quarantine `pryzm-vi-parity` immediately on Day 8 of Wave 5 (after the visibility-intent cast deletions land), not at end of Wave 7. The de-quarantine date is hard-coded in `02-WAVE-1-TRIPWIRES.md §5`'s tracking issue. |
| **Owner** | Visibility engineer + architecture lead |
| **Pre-mitigation cost** | A bug ships to production preview; users notice |
| **Post-mitigation cost** | 0 days (de-quarantine is part of Wave 5 plan) |

### R6 — Founder pressure to start Phase F early

| Field | Value |
|---|---|
| **Probability** | High |
| **Impact** | **Catastrophic** |
| **Trigger** | At any point between Wave 1 and Wave 6, a stakeholder ("just one engineer on plugin SDK in parallel", "marketplace beta would help fundraising", "headless API for that one customer") asks to start Phase F before the convergence gate. |
| **Leading indicator** | A PR is opened touching `packages/plugin-sdk/`, `packages/headless/`, or `apps/marketplace/` before S84-WIRE. |
| **Mitigation** | **Discipline rule 4 of `12-DISCIPLINE-AND-DOD.md`** is the merge gate. CI rule `no-phase-f-prs-pre-gate` blocks the PR. The override requires founder + architecture-lead joint approval, intended only for the S84-WIRE D-1 kickoff PRs. |
| **Owner** | Founder (the one who would feel the pressure most) |
| **Pre-mitigation cost** | Phase F built on broken foundation; 195-sub-phase program is harder to debug; convergence gate becomes meaningless; archived audit pattern repeats; project credibility damage |
| **Post-mitigation cost** | 0 days; only psychological cost (saying "no" to a stakeholder) |

### R7 — 5-month plan slips to 7 months

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | Medium (Phase F start slips by 2 sprints; calendar GA-2 pushed) |
| **Trigger** | At end of Wave 4 (S81-WIRE D-last), the velocity assumption (3 sub-phases / sprint) is shown false. Actual Wave 1-4 velocity is < 2.5 sub-phases / sprint. |
| **Leading indicator** | End-of-Wave-4 retrospective: count sub-phases closed vs planned. If < 80 %, R7 fires. |
| **Mitigation** | Founder calendar decision at end of Wave 4: (a) add engineers (cost: hire + ramp-up = 2 sprint slip, then velocity uplift), (b) descope Phase F-tail (cost: GA-2 features cut), or (c) accept 2-sprint slip. |
| **Owner** | Founder |
| **Pre-mitigation cost** | Calendar drifts unknowingly; Phase F slips into the next quarter |
| **Post-mitigation cost** | Founder decision, not technical |

### R8 — Doc consolidation regresses (someone writes `00-NEW-PLAN-2026-MM-DD.md` again)

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | High (the cleanup that took 2 days in 2026-04-30 reverts; doc rot resumes; new hires get confused; `archive/` grows) |
| **Trigger** | A PR adds a new top-level `.md` in `docs/archive/pryzm3-internal/` outside the canonical 5 (README + 01..04). |
| **Leading indicator** | The CI lint rule `no-new-doc-files` (`12-DISCIPLINE-AND-DOD.md §1` rule 1) blocks the PR. |
| **Mitigation** | The lint rule is the merge gate. Override requires architecture-lead + founder approval. Quarterly review: if any overrides happened, re-evaluate the rule. |
| **Owner** | Architecture lead |
| **Pre-mitigation cost** | A new audit trail emerges; 6-12 months of unchecked accumulation = another 178-file mess |
| **Post-mitigation cost** | 0 days (the rule prevents it) |

### R9 — `composeRuntime.ts` becomes a god file (grows past 1,500 LOC)

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | Medium (the file we built D.4 to break is replaced by an even larger file) |
| **Trigger** | At end of Wave 4 (when slot typing completes), `wc -l packages/runtime-composer/src/composeRuntime.ts` > 1,500. |
| **Leading indicator** | Per-sprint check on `composeRuntime.ts` LOC; if growth rate > 50 LOC/sprint past Wave 4, R9 fires. |
| **Mitigation** | Wave 7 WS-B includes a "composeRuntime audit" — if > 1,500 LOC, decompose into per-slot bootstrap files (e.g. `composeRuntime/scene.ts`, `composeRuntime/persistence.ts`, etc.). The main `composeRuntime.ts` orchestrates; per-slot files implement. |
| **Owner** | Runtime engineer + architecture lead |
| **Pre-mitigation cost** | Composer file becomes hard to review; D.4-style debt re-accrues |
| **Post-mitigation cost** | 1 sprint of decomposition work in Wave 7 |

### R10 — A wave's exit verifier itself has a bug (false-positive green or false-negative red)

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | High (a wave is declared closed while a boolean is actually false; Phase F gate is reached prematurely) |
| **Trigger** | A wave-exit verifier returns 0 but a manual smoke test reveals the underlying behaviour is broken. |
| **Leading indicator** | Day-after-wave-close architecture-lead spot-check. The lead manually runs the user-visible flow that the wave promised to enable; if it doesn't work, the verifier is wrong. |
| **Mitigation** | Each wave file has a "What the founder sees" section showing the expected verifier output paired with a manual smoke test description; both must match before declaring wave closed. |
| **Owner** | Architecture lead |
| **Pre-mitigation cost** | A wave is "done" on paper but not in fact; downstream waves built on false foundation |
| **Post-mitigation cost** | 1-3 days to fix the verifier and re-close the wave honestly |

### R11 — L7.5 view managers add DOM event handlers without motion-gate signaling

| Field | Value |
|---|---|
| **Probability** | Medium (any new input handler in `SplitViewManager` or `PlanViewManager` until `packages/input-host/` lands) |
| **Impact** | Medium (NFT #4 + #5 regress: jumpy 2D plan-view navigation, frame-budget spike on scheduler wake) |
| **Trigger** | Any new `wheel`, `mousedown`, `mousemove`, `mouseup`, or `touchstart`/`touchmove`/`touchend` handler added to a L7.5 view manager (`src/core/views/PlanViewManager.ts`, `src/core/views/SplitViewManager.ts`, or any future L7.5 Canvas2D view) that modifies `_camTarget`, `_frustumH`, or `_lastRender` without calling `getFrameScheduler().beginMotion()` / `endMotion()`. |
| **Root cause** | When `packages/frame-scheduler/` landed (P3 compliance, convergence boolean #3 ✅), 2D view managers were wired to the FrameScheduler's **subscriber** side (tick listeners) but not the **producer** side (motion-gate signals). 3D was correctly wired via camera-controls library events (`controlstart`/`update`/`rest`/`sleep` → `beginMotion`/`endMotion` in `initScene.ts`). 2D views use raw DOM events with no equivalent library layer to emit the motion signal — so the gap is invisible at rAF-owner audits but materialises as jank whenever a new DOM handler is added. Incident discovered 2026-05-01 (S88-WIRE); fix applied to `PlanViewManager` + `SplitViewManager` with P8-compliant spans via `src/core/views/otel.ts`. See `03-CURRENT-STATE.md §10` (2026-05-01 S88-WIRE entry). |
| **Leading indicator** | Code review: any PR diff touching `src/core/views/PlanView*.ts` or `SplitView*.ts` that adds a DOM event handler (`addEventListener('wheel'|'mousedown'|'mouseup'|'touchstart'|'touchmove'|'touchend', ...)`) without a paired `getFrameScheduler().beginMotion()` / `endMotion()` call. |
| **Structural resolution** | R11 is **eliminated when `packages/input-host/` is real** (Wave 8-11 per `15-PACKAGE-POPULATION-GAP.md`). Input routing then goes through `runtime.input` (L3 injection), and the scheduler integration is structural — any registered gesture implicitly signals the motion gate without per-handler manual wiring. |
| **Interim guard** | Until `input-host` lands: **every DOM event handler that mutates `_camTarget`, `_frustumH`, or `_lastRender` MUST call `beginMotion()`/`endMotion()` AND emit a `pryzm.plan-view.*` span via `src/core/views/otel.ts`.** See the pattern in `PlanViewManager._onWheel`/`_onMouseDown`/`_onMouseUp` and `SplitViewManager._onWheel`/`_onMouseDown`/`_onMouseUp`. |
| **Owner** | Architecture lead (code review gate) |
| **Pre-mitigation cost** | NFT #4 jank per missing handler; user-visible navigation jump; each occurrence requires a targeted fix PR |
| **Post-mitigation cost** | 0 days once `input-host` lands (structural) |

### R12 — commandBus codemod (971 callsites, Wave 16) introduces runtime dispatching regressions

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | High (971 callsites × possible missed `runtime` injection = command handlers silently not reached; user-visible feature breakage in the editor after the Wave 16 codemod lands) |
| **Trigger** | After `scripts/codemod-commandbus-dispatch.ts` rewrites Wave 16's 971 `(window as any).commandManager.dispatch(...)` callsites, ≥ 1 callsite's enclosing class/function did not receive the `runtime` parameter injection correctly — the codemod flagged it as "manual review required" but the flag was missed in review. |
| **Leading indicator** | The Wave 16 codemod output flags manual-review sites. Any flag that is resolved by inserting `runtime!` (non-null assert) without tracing the actual injection path is a pre-incident state. |
| **Mitigation** | (a) Pre-codemod: add a `commandManager-reach-count.ts` ratchet to `tools/ga-gate/` (recovery step 4 from INCIDENT-01). (b) Post-codemod: a mandatory 2-engineer review of every codemod-flagged "manual review required" site before the Wave 16 PR merges. (c) Integration test `tests/integration/commandBus-wall-roundtrip.test.ts` must go green before the PR lands. |
| **Owner** | Wireup lead (codemod) + architecture lead (review) |
| **Pre-mitigation cost** | Feature breakage discovered in QA or preview → hotfix sprint; Wave 17 start slips 1-2 sprints |
| **Post-mitigation cost** | 1-2 days of extra review per manual-review site |

### R13 — Plugin auto-discovery manifest errors leave plugins silently unloaded (Wave 18)

| Field | Value |
|---|---|
| **Probability** | Medium |
| **Impact** | Medium (28 currently-unwired plugins fail to load at runtime after Wave 18's hard-coded `PluginRegistry.ts` is replaced by manifest-driven discovery; affected features silently absent for users) |
| **Trigger** | A plugin's `pryzm.plugin.json` manifest has a path mismatch, a missing `"entry"` field, or an invalid semver `"sdkVersion"` after the Wave 18 codemod runs — and the auto-discovery silently skips it rather than hard-failing. |
| **Leading indicator** | Wave 18 exit gate (`pnpm tsx scripts/check-all-plugins-loaded.ts`) must assert all 46 plugins are registered at `runtime.plugins` after boot. If any are missing, the gate fails. |
| **Mitigation** | (a) The Wave 18 auto-discovery implementation MUST hard-fail (not silent-skip) on malformed manifests in dev mode. (b) The exit gate `check-all-plugins-loaded.ts` must be authored and green before the hard-coded `PluginRegistry.ts` is deleted. (c) Staged rollout: add auto-discovery alongside the hard-coded registry; verify parity; then delete the hard-coded list. |
| **Owner** | Plugin registry engineer + architecture lead |
| **Pre-mitigation cost** | Regression discovered days post-merge (manifest errors are invisible until the affected feature is clicked); Wave 19 work blocked on plugin availability |
| **Post-mitigation cost** | 0.5 days per malformed manifest (fix + re-test) |

### R14 — Phase F npm-publish without K3-C gate exposes Ed25519 signing gap

| Field | Value |
|---|---|
| **Probability** | Low |
| **Impact** | **Catastrophic** (publishing `@pryzm/sdk` with unsigned or improperly-sandboxed plugin entry points allows malicious marketplace plugins to execute arbitrary code in the buyer's browser; PRYZM 3 credibility damage; potential CVE) |
| **Trigger** | Phase F workstream F-SDK publishes `@pryzm/sdk` (step 3 of `20-PHASE-F-PLAN.md §3.1`) before the K3-C gate's sandbox audit and 38-plugin parity check both return green. |
| **Leading indicator** | Any Phase F PR that changes `packages/plugin-sdk/package.json` `"version"` to a non-rc value (i.e., not containing `-rc`) without a `scripts/k3c-sandbox-audit.ts` PASS record in the PR description. |
| **Mitigation** | The K3-C gate (`20-PHASE-F-PLAN.md §3.1` Step 1) is a **hard block**: the CI check `pnpm tsx scripts/k3c-sandbox-audit.ts` must exit 0 and its output must be pasted into the publish PR description. The `no-phase-f-prs-pre-gate` rule (`12-DISCIPLINE-AND-DOD.md §1` rule 4) already blocks pre-gate Phase F work; the K3-C audit is the Phase F internal gate before any public-facing publish. |
| **Owner** | Founder (owns the npm publish credential; physically cannot be done without the K3-C gate being run) |
| **Pre-mitigation cost** | Security incident; CVE; marketplace taken offline; multi-quarter trust recovery |
| **Post-mitigation cost** | 0 days (the K3-C audit takes < 30 min to run; the check is already scripted) |

---

## §2 — Incident log

This section is **empty at plan start (2026-04-30)**. As risks materialise, they are logged here within 24 hours, with a recovery plan and an updated entry in `../03-CURRENT-STATE.md §10`.

### Format

```markdown
### [INCIDENT-NN] YYYY-MM-DD — <one-line summary>

**Risk fired**: R<N> from §1
**Detected by**: <CI gate / manual review / production preview>
**Impact**: <user-visible effect, if any>
**Recovery plan**:
  1. <step>
  2. <step>
**Recovery owner**: <name/role>
**Recovery deadline**: <date>
**Closed**: <date or "open">
```

### Entries

### [INCIDENT-01] 2026-04-30 — `commandManager` callsite surface under-counted by 5×

**Risk fired**: R-12 (Round-2) from `15-PACKAGE-POPULATION-GAP.md §17` — the legacy `commandManager` migration codemod was sized against `chunks/28-commandManager-execute-migration.md`'s reported **195** `commandManager.execute(` reaches. The wider Round-2 audit (`03-CURRENT-STATE.md §13`) measured `commandManager` total reaches in `src/` at **971** and `CommandManager` (any reach) at **392**. R6-8 reconciled the actual dispatch surface to **391** unique callsites (`03-CURRENT-STATE.md §15.12.8`) — still **2× the chunk-28 figure** that the Wave 16 day-budget had been sized against.

**Detected by**: Round-2 holistic doc-alignment review (the same session that produced the §10 entry on this date). Surfaced when the §13 boot-path map was cross-checked against chunk 28's Top-offenders table and the `commandManager` symbol-search was widened from `.execute(` to all reaches.

**Impact**:
- Wave 16 day-budget recalibrated: from "~325 callsites/sprint × 3 sprints" against the 195 figure to "~130 callsites/sprint × 3 sprints" against the reconciled 391 — within the original 3-sprint window but with much less slack.
- The Wave-16-only-addresses-commandBus framing in `15-PACKAGE-POPULATION-GAP.md §0.0.4` was widened to "Wave 16 SCOPE EXPANSION (+1 sprint)" covering the other 13 unconsumed `runtime.*` facets (workspace, visibility, sync, geometry, renderer, physics, input, audit, cost, spend, schemas, commands, undoStack-deep) per §13's reverse-coverage check.
- Three plan documents had to be amended in lock-step (CURRENT-STATE §13, PG-15 §0.0.4, PG-15 §16) — the amendments themselves are doc-only, no code regression.
- No production / preview impact; legacy `CommandManager` shim continues to forward into the bus, so behavior is preserved until Wave 16 deletes the shim.

**Recovery plan**:
1. ✅ Land R6-8 correction in `03-CURRENT-STATE.md §15.12.8` (391, not 971, not 195) — done in this session.
2. ✅ Widen Wave 16 scope in `15-PACKAGE-POPULATION-GAP.md §16` to +1 sprint (4 sprints total) covering the 13 additional `runtime.*` facets — done in this session.
3. Author per-command-id payload-shape audit before Wave 16 codemod begins (S107-WIRE precondition) — many legacy callsites pass `any`-typed payloads; without typed-payload migration first, the codemod ships with `as any` casts and the typed-command win is lost.
4. Add `commandManager-reach-count.ts` to `tools/ga-gate/` as a tripwire (parametric: `commandManager` reaches in `src/` ≤ 391; monotonically falls to 0 by S110-WIRE-end). Lands as part of Z.6 (`07-RETRO-FIT-AND-EXTRACTION-LEDGER.md §2`).
5. Update `chunks/28-commandManager-execute-migration.md` Top-offenders table from the 195-figure cohort to the 391-figure cohort; add a banner referencing this incident.

**Recovery owner**: Architecture lead (codemod design + payload-shape audit); Wireup lead (tripwire authoring).

**Recovery deadline**: payload-shape audit complete by end of S106-WIRE (Wave 16 precondition). Tripwire live by end of Z.6 (S77-WIRE D3).

**Closed**: open (recovery steps 1–2 done; 3–5 outstanding).

**Cross-refs**:
- `03-CURRENT-STATE.md §13` — boot-path map and the 971-reach measurement
- `03-CURRENT-STATE.md §15.12.8` — R6-8 reconciliation to 391
- `15-PACKAGE-POPULATION-GAP.md §16` — Wave 16 SCOPE EXPANSION (+1 sprint)
- `chunks/28-commandManager-execute-migration.md` — original 195-reach table (to be amended per recovery step 5)

---

## §3 — Risk-register update protocol

The risk register evolves. The protocol:

| Action | Trigger | Process |
|---|---|---|
| **Add a new risk** | Architecture lead identifies a new ≥ Medium-probability risk | Add a numbered entry below R10; commit in a doc-only PR (does not need ga-gate-skip) |
| **Update an existing risk** | New information about probability, impact, or mitigation | Edit the row; cite the new information in the PR description |
| **Close a risk** | The risk's trigger has passed without firing (e.g. R1 didn't fire because Wave 2-3 closed cleanly) | Add a "Closed: YYYY-MM-DD — <reason>" line at the bottom of the risk; do NOT delete the entry |
| **Log an incident** | A risk fires (becomes reality) | Add an `[INCIDENT-NN]` entry in §2 within 24 hours; cite which risk; reference recovery plan |

The register is **never deleted from**. Closed risks stay as historical reference. This is the one exception to discipline rule 1 (edit, don't fork) — the register grows by accretion, not by replacement.

---

## §4 — Quarterly risk review

Every quarter (every 3 sprints), the founder + architecture lead review:

1. **Which risks fired** in the past quarter? Were the mitigations effective?
2. **Which risks are now lower-probability** because we've passed their trigger window? Mark them closed.
3. **Are there new risks** that emerged from the quarter's work that need to be added?
4. **Is the overall risk profile changing** (e.g. fewer technical risks but more calendar risks)?

Output of the quarterly review: a single paragraph in `../03-CURRENT-STATE.md §10` citing the risk-register changes, plus the updated register here.

---

## §5 — The single highest-impact risk

R6 (Founder pressure to start Phase F early) has the highest impact-probability product. **The single most important thing this plan does is enforce discipline rule 4**. If R6 materialises, the plan does not survive — the foundation is broken before it's finished.

Every other risk has a recovery path measured in days or 1-2 sprints. R6 has a recovery path measured in **multi-quarter rebuilding** because Phase F's 195 sub-phases each accumulate technical debt in a 6-month window if started on a broken foundation.

The CI rule `no-phase-f-prs-pre-gate` is the named, mechanical enforcement of the rule that prevents R6. **It is the single most important line of code in the entire plan.**

---

## §6 — How the founder reads this register

5-minute Friday check:

1. Glance at §1 — any risk with new evidence this week?
2. Glance at §2 — any new incidents?
3. If yes to either, the §10 weekly delta in `../03-CURRENT-STATE.md` should already reflect it. If not, the architecture lead writes the missing paragraph before EOD.

15-minute quarterly review:

1. Read §4 protocol; answer the 4 questions.
2. Update §1 with closures, additions, probability changes.
3. Write the quarterly paragraph in `../03-CURRENT-STATE.md §10`.

The register is a tool, not a checkbox. Its value is in the conversations it triggers when a risk's leading indicator fires — not in being completed.
