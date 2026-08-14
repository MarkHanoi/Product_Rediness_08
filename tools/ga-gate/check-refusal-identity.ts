/**
 * @file tools/ga-gate/check-refusal-identity.ts
 *
 * §REFUSAL-IDENTITY — a refusal that reaches the user WITHOUT its code is
 * indistinguishable from a generic "not applicable".
 *
 * ─── The invariant, and where it comes from ──────────────────────────────────
 * C58 §1.13 ("A REFUSAL is a positive answer and MUST be representable, cited, and
 * distinct from a coverage gap") made this first-class for the buildable envelope:
 * `BuildableEnvelope.refusal` carries a `code` over an ELEVEN-member CLOSED union,
 * a Zod refinement makes the refusal present exactly when the status is
 * `not-applicable`, and §1.13.2 insists that "the ordinance grants no envelope here"
 * and "PRYZM has not encoded this zone" must not collapse onto one value. §1.13.8
 * then states the seam rule this gate enforces in general terms:
 *
 *     "the resolver's distinction MUST reach the card."
 *
 * ADR-0269 grounds the compliance path this doctrine protects; ADR-0279 BLOCKER-1
 * records the same failure shape at the replication boundary (a missing fidelity
 * gate makes an unverified result and a verified one observationally identical).
 *
 * The general form, and the reason this is a GATE rather than a review note:
 * **the layer that KNOWS must be the layer that REPORTS.** Every instance found
 * while building this gate had the same shape — a well-designed closed union
 * resolved carefully upstream, then flattened to prose one call before the DOM.
 * The type system cannot see that: dropping a field on the way to a string is a
 * legal program. Only a source gate can.
 *
 * ─── The two arms ────────────────────────────────────────────────────────────
 *
 * ARM A — MANUFACTURED REFUSAL (hard, ratcheted).
 *   `something.reason || 'Validation failed'`. Two facts collapse: the validator
 *   refused AND said why, versus the validator refused AND said nothing. The
 *   second gets a sentence with the grammatical shape of an explanation and the
 *   information content of a shrug — and, being indistinguishable from a real
 *   reason, it HIDES the under-reporting validator. Worse than a blank.
 *   C58 §1.13 makes this unrepresentable for the envelope (`detail` is
 *   `z.string().min(1)`, required); this arm extends the discipline outward.
 *
 * ARM B — CODED REFUSAL DROPPED AT THE RENDER (ratchet).
 *   A line that renders `X.reason` to a user sink (textContent / innerHTML /
 *   alert / toast / a `message:` payload) while no identity — `.code`, `.kind`,
 *   `.status`, a `data-refusal-*` attribute, or a shared `…RefusalText(` /
 *   `…BadgeText(` renderer — appears anywhere in the surrounding statement window.
 *   That is the exact shape of every Class-A defect this gate was written for.
 *
 * ─── Why NAMED offenders and not a count ─────────────────────────────────────
 * A count-based ceiling lets a PR fix one site, break another, and stay level —
 * the ratchet reports "within baseline" while the invariant went sideways. The
 * baselines below are therefore keyed by `file:code-fragment`, NOT by number. A
 * new offender fails even at an unchanged total. (Line numbers are deliberately
 * NOT part of the key: they churn on every edit above the site and would turn the
 * gate into a merge conflict generator. The fragment is stable and specific.)
 *
 * ─── Flags ───────────────────────────────────────────────────────────────────
 *   --root <path>      point the scan at another tree (a git worktree). Changes
 *                      WHERE the gate looks, never WHAT it tolerates.
 *   --emit-baseline    print the BASELINE array for the current tree and exit 0.
 *                      Prints only; never writes. Re-freezing stays a deliberate,
 *                      reviewed act.
 *
 * ─── Measured baseline, 2026-08-11 ───────────────────────────────────────────
 *   88 named offenders — arm A 55, arm B 33 — over apps/ + packages/ + plugins/.
 *   NOT zero, and stated as such. The bulk of arm A is the `v.reason ?? 'invalid
 *   boundary'` family in the `plugins/<name>/src/handlers/` tree and the batch commands in
 *   `packages/command-registry/`, where a geometry validator's silence is papered
 *   over at the handler. Those are real instances of this defect and they belong
 *   to the packages that own them.
 *
 * ─── Exit codes ──────────────────────────────────────────────────────────────
 *   0 — every offender is a known baseline entry, and none has been left behind.
 *   1 — a NEW offender, or a stale baseline entry (fixed but not de-listed).
 *   2 — MISCONFIGURED: the scan could not establish its subject. Enforced by
 *       `lib/sourceScan.ts`'s `minFiles` floor. Exit 2 is deliberately not 1: a
 *       broken scan is a different fact from a failed check, and conflating them
 *       is how "0 violations" once meant "walked nothing".
 */

import { scanFiles, type Match } from './lib/sourceScan.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', '..');

// `--root <path>` exists so this gate can be pointed at a git worktree — and so
// its own exit-2 floor can be demonstrated against an empty tree. It changes WHERE
// the gate looks, never WHAT it tolerates.
const rootArgIdx = process.argv.indexOf('--root');
const ROOT = rootArgIdx >= 0 && process.argv[rootArgIdx + 1]
    ? resolve(process.argv[rootArgIdx + 1]!)
    : DEFAULT_ROOT;

const DIRS = ['apps', 'packages', 'plugins'] as const;

/**
 * Honesty floor. The three trees hold several thousand `.ts` files; a walk that
 * reads fewer than this did not find its subject, whatever it reports.
 */
const MIN_FILES = 1500;

const isTest = (rel: string): boolean =>
    /(^|\/)(__tests__|__mocks__|tests|test|e2e)\//.test(rel)
    || /\.(test|spec)\.tsx?$/.test(rel);

/**
 * A comment line. `scanFiles` matches raw lines, so without this the gate reports its
 * OWN documentation of the defect as an instance of the defect — which it did on the
 * first run. A gate that cannot tell a description of a bug from the bug is not
 * measuring the thing it names.
 */
const isCommentLine = (text: string): boolean =>
    /^\s*(\/\/|\*|\/\*)/.test(text);

// ─────────────────────────────────────────────────────────────────────────────
// ARM A — a refusal sentence MANUFACTURED out of an absent one
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `X.reason || 'Validation failed'` / `X.reason ?? "Failed"`.
 *
 * ⚠ SCOPED TO `.reason` DELIBERATELY, and NARROWED AFTER MEASURING. The first draft
 * also matched `.error` / `.message`, which pulled in ~60 HTTP and exception sites
 * (`data.error ?? 'Registration failed'`, `err.message ?? 'Unknown error'`). Those are
 * a real but DIFFERENT concern: a caught exception or an HTTP body has no closed code
 * set to drop, so a default there is a missing-message problem, not a laundered
 * refusal — and folding them in buried the genuine refusal sites in noise nobody would
 * ever work through, which is how a ratchet becomes decoration.
 *
 * `.reason` is THE refusal field in this codebase's pervasive `{ ok: false, reason }`
 * convention — exactly the population C58 §1.13 governs.
 *
 * The literal must ALSO read like a refusal: that is what makes the substitution a
 * fabricated verdict rather than a harmless default. `name ?? 'Untitled'` is not this
 * defect and must not be caught by it.
 */
const MANUFACTURED_RE =
    /\.reason\s*(?:\|\||\?\?)\s*['"`]([^'"`]{3,120})['"`]/i;

const REFUSAL_VOCAB =
    /\b(fail|failed|failure|invalid|cannot|can't|unable|denied|declined|decline|refused|rejected|not\s+allowed|not\s+permitted|unavailable|unknown\s+error|went\s+wrong|error)\b/i;

// ─────────────────────────────────────────────────────────────────────────────
// ARM B — a coded refusal flattened to prose at the render
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A line that puts something on a USER'S SCREEN.
 *
 * ⚠ The `\w*` prefixes are load-bearing and were added after the gate's own negative
 * test failed to fire. The first draft listed a bare `setBadge`, which `\b`-anchored
 * against `this.setFacadeSubjectBadge(...)` does NOT match — so the gate could not see
 * the very call site it had just been written to protect. Real UI methods are named
 * `setFacadeSubjectBadge`, `showRejectNotice`, `emitToast`; a sink list of bare verbs
 * describes a codebase nobody has.
 *
 * `HudState(` added 2026-08-14 (§REFUSAL-IDENTITY-CANPLACE, GE-09). DoorTool /
 * WindowTool render refusals via `setHudState(state, customMsg)` → `.th-overlay`
 * textContent — a USER surface this list could not see, which is exactly how the
 * canPlace consumers dropped a six-way closed union there for months without a
 * single finding. Both known sites now render through `canPlaceRefusalText()`
 * (matched by CARRIES_IDENTITY_RE), so adding the sink creates ZERO findings
 * today and exists to catch the regression back to `setHudState(x, o.reason)`.
 */
const USER_SINK_RE =
    /(?:\btextContent\b|\binnerHTML\b|\balert\s*\(|\bconfirm\s*\(|\w*[Tt]oast\s*\(|\w*Badge\s*\(|\w*[Nn]otice\s*\(|\bshow\w*\s*\(|\bfail\s*\(|\bsetStatus\b|\w*HudState\s*\(|\bmessage\s*:)/;

/** …and reads a `.reason` off an object while doing it. */
const READS_REASON_RE = /\.reason\b/;

/**
 * Any identity carrier. If one of these is in the statement window, the refusal
 * is attributable and the line passes.
 */
const CARRIES_IDENTITY_RE =
    /\.(?:code|kind|status)\b|data-refusal|data-unmeasured-reason|RefusalText\s*\(|BadgeText\s*\(|refusalCode/;

/**
 * A `console.*` line. EXCLUDED FROM THE IDENTITY WINDOW, and this was found by the
 * gate's own negative test rather than by reasoning.
 *
 * The first negative test stripped `facadeRefusalBadgeText(resolution)` back to
 * `${resolution.reason}` in `CesiumViewport.ts` — a genuine regression of exactly the
 * defect this gate names — and the gate stayed GREEN. The reason: the `console.log`
 * one line above still mentioned `resolution.code`, so `CARRIES_IDENTITY_RE` matched
 * inside the window and the render was forgiven.
 *
 * A console line is not a user surface. Crediting one is the same error as the bug
 * under audit, one level up: it lets a developer-only trace stand in for the thing the
 * user reads. If the gate accepted that, it would certify a screen that says nothing
 * because a log file says something.
 */
const isConsoleLine = (text: string): boolean => /\bconsole\s*\.\s*\w+\s*\(/.test(text);

/** Lines above a sink to treat as the same statement. Multi-line template
 *  literals and wrapped argument lists routinely span this much. */
const WINDOW = 6;

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE — NAMED, shrink-only. Add nothing here without a §-tagged reason.
// ─────────────────────────────────────────────────────────────────────────────

interface Offender { readonly file: string; readonly fragment: string; readonly why: string }

/**
 * Every entry is a site that renders a refusal without its identity TODAY.
 *
 * ⚠ This list may only SHRINK. Adding an entry to make a new violation pass is
 * the precise move this gate exists to stop — if a refusal genuinely cannot carry
 * a code, that is a design finding to raise, not a line to append here.
 *
 * Populated from the measured run recorded at the bottom of this file.
 */
const BASELINE: readonly Offender[] = [
    { file: "apps/editor/src/ui/apartment-layout/ApartmentLayoutController.ts", fragment: "const reason = (evt?.reason ?? 'Engine declined to generate layouts').trim();", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/apartment-layout/ApartmentLayoutController.ts", fragment: "return { ok: false, reason: reg.reason ?? 'AI plane unavailable' };", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/apartment-layout/apartmentLayoutTrigger.ts", fragment: "if (!r.ok) toast(r.reason ?? 'Layout generation failed', 'error');", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/apartment-layout/apartmentLayoutTrigger.ts", fragment: "return { ok: false, reason: r.reason ?? 'the layout engine refused without a reason.' };", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/generation/generationChatSeam.ts", fragment: "emitReport(false, [res.reason ?? 'the residential generator refused without a reason']);", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/generation/generationChatSeam.ts", fragment: "emitReport(false, [res.reason ?? 'the house generator refused without a reason']);", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/generation/generationChatSeam.ts", fragment: "emitReport(false, [res.reason ?? 'the office generator refused without a reason']);", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/house-layout/HouseLayoutController.ts", fragment: "return { ok: false, reason: execResult.reason ?? 'the build executor refused', optionCount: variants.length };", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/property-panel/PropertyPanelAnnotations.ts", fragment: "fail(r.error ?? r.reason ?? 'The model rejected this change.');", why: "arm A — measured 2026-08-11" },
    { file: "apps/editor/src/ui/residential-building/ResidentialBuildingController.ts", fragment: "return { ok: false, reason: execResult.reason ?? 'the build executor refused', apartmentCount };", why: "arm A — measured 2026-08-11" },
    { file: "packages/ai-host/src/FloorPlanBatchExecutor.ts", fragment: ": (proposal.validation.reason || 'FAILED'),", why: "arm A — measured 2026-08-11" },
    { file: "packages/ai-host/src/workflows/apartmentLayout/workflow.ts", fragment: "reason: result.reason ?? 'Engine declined to generate layouts',", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/ceilings/UpdateCeilingsSystemTypeBatchCommand.ts", fragment: "else refusals.push(v.reason ?? `Ceiling ${id} refused the type change`);", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/ceilings/UpdateCeilingsSystemTypeBatchCommand.ts", fragment: "this._skipped.push({ ceilingId: id, reason: v.reason ?? 'refused' });", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/CommandManagerImpl.ts", fragment: "const _human = validation.blockingIssues?.[0] || validation.reason || 'Validation failed';", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/CommandManagerImpl.ts", fragment: "return { success: false, affectedElementIds: [], info: [validation.reason || 'Validation failed'] };", why: "arm A — measured 2026-08-11" },
    // FIXED + DE-LISTED 2026-08-14 (GE-09v2, doors family): UpdateDoorsSystemTypeBatchCommand
    // now renders child refusals through the shared childRefusalText() — a stated reason
    // passes VERBATIM; a silent child arrives as [REFUSED_WITHOUT_REASON] + validator +
    // subject instead of the manufactured 'refused'. Baseline 85 → 83.
    { file: "packages/command-registry/src/generic/UpdateElementParameterCommand.ts", fragment: "info: [validated.reason ?? 'Parameter validation failed']", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/project/ImportProjectCommand.ts", fragment: "info: [validation.reason ?? 'Sub-command validation failed'],", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/slabs/UpdateSlabsSystemTypeBatchCommand.ts", fragment: "else refusals.push(v.reason ?? `Slab ${id} refused the type change`);", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/slabs/UpdateSlabsSystemTypeBatchCommand.ts", fragment: "this._skipped.push({ slabId: id, reason: v.reason ?? 'refused' });", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/walls/AddWallLayerBatchCommand.ts", fragment: "else refusals.push(v.reason ?? `Wall ${w.id} refused the layer`);", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/walls/AddWallLayerBatchCommand.ts", fragment: "this._skipped.push({ wallId: w.id, reason: v.reason ?? 'refused' });", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/walls/UpdateWallsColorBatchCommand.ts", fragment: "else refusals.push(v.reason ?? `Wall ${wallId} refused the colour change`);", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/walls/UpdateWallsColorBatchCommand.ts", fragment: "this._skipped.push({ wallId, reason: v.reason ?? 'refused' });", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/walls/UpdateWallsSystemTypeBatchCommand.ts", fragment: "else refusals.push(v.reason ?? `Wall ${wallId} refused the type change`);", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/walls/UpdateWallsSystemTypeBatchCommand.ts", fragment: "this._skipped.push({ wallId, reason: v.reason ?? 'refused' });", why: "arm A — measured 2026-08-11" },
    // FIXED + DE-LISTED 2026-08-14 (§REFUSAL-IDENTITY-CANPLACE, GE-09, consumer pass).
    // CreateWindowsParametricBatchCommand's child (CreateWallOpeningCommand) now renders
    // its canPlace refusals through the shared `canPlaceRefusalText()` — the [OCC_*]
    // identity arrives inside `v.reason` — and the batch's fallback names the absence
    // ("(no reason stated by the child command)") instead of manufacturing
    // 'placement refused'. Baseline 87 → 86. The same pass threaded the code through
    // the six single-shot commands (Set/Move/Center door+window offset,
    // CreateWallOpeningCommand) and DoorTool/WindowTool's HUD — sites this gate's
    // arm A/B regexes never flagged (no refusal vocab, HUD sink not in USER_SINK_RE),
    // which is exactly the reachability gap GE-09's original ask names.
    { file: "packages/command-registry/src/windows/UpdateWindowsSystemTypeBatchCommand.ts", fragment: "else refusals.push(v.reason ?? `Window ${id} refused the type change`);", why: "arm A — measured 2026-08-11" },
    { file: "packages/command-registry/src/windows/UpdateWindowsSystemTypeBatchCommand.ts", fragment: "this._skipped.push({ windowId: id, reason: v.reason ?? 'refused' });", why: "arm A — measured 2026-08-11" },
    { file: "plugins/ceiling/src/handlers/CreateCeiling.ts", fragment: "if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid boundary' };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/ceiling/src/handlers/CreateCeiling.ts", fragment: "if (!v.ok) throw new CeilingGeometryError(v.reason ?? 'invalid boundary');", why: "arm A — measured 2026-08-11" },
    { file: "plugins/ceiling/src/handlers/CreateCeilingBatch.ts", fragment: "if (!v.ok) return { valid: false, reason: `ceilings[${i}].boundary: ${v.reason ?? 'invalid'}` };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/ceiling/src/handlers/SetCeilingBoundary.ts", fragment: "if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid boundary' };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/ceiling/src/handlers/SetCeilingBoundary.ts", fragment: "if (!v.ok) throw new CeilingGeometryError(v.reason ?? 'invalid boundary');", why: "arm A — measured 2026-08-11" },
    { file: "plugins/grid/src/handlers/SetGridSpacing.ts", fragment: "if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid grid spec' };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/grid/src/handlers/SetGridSpacing.ts", fragment: "if (!v.ok) throw new GridConfigError(v.reason ?? 'invalid spec');", why: "arm A — measured 2026-08-11" },
    { file: "plugins/handrail/src/handlers/CreateHandrail.ts", fragment: "if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid path' };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/handrail/src/handlers/RecomputeHandrail.ts", fragment: "if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid path' };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/handrail/src/handlers/RecomputeHandrail.ts", fragment: "if (!v.ok) throw new HandrailGeometryError(v.reason ?? 'path invalid');", why: "arm A — measured 2026-08-11" },
    { file: "plugins/handrail/src/handlers/SetHandrailPath.ts", fragment: "if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid path' };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/handrail/src/handlers/SetHandrailPath.ts", fragment: "if (!v.ok) throw new HandrailGeometryError(v.reason ?? 'path invalid');", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/AddSlabHole.ts", fragment: "if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid hole' };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/AddSlabHole.ts", fragment: "if (!v.ok) throw new SlabBoundaryError(v.reason ?? 'invalid hole');", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/CreateSlab.ts", fragment: "if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid boundary' };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/CreateSlab.ts", fragment: "if (!v.ok) return { valid: false, reason: `hole[${i}]: ${v.reason ?? 'invalid hole'}` };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/CreateSlab.ts", fragment: "if (!v.ok) throw new SlabBoundaryError(v.reason ?? 'invalid');", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/CreateSlabBatch.ts", fragment: "if (!v.ok) return { valid: false, reason: `slabs[${i}].boundary: ${v.reason ?? 'invalid'}` };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/CreateSlabBatch.ts", fragment: "return { valid: false, reason: `slabs[${i}].holes[${h}]: ${v.reason ?? 'invalid hole'}` };", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/CreateSlabBatch.ts", fragment: "if (!v.ok) throw new SlabBoundaryError(v.reason ?? 'invalid');", why: "arm A — measured 2026-08-11" },
    { file: "plugins/slab/src/handlers/CreateSlabBatch.ts", fragment: "if (!v.ok) throw new SlabBoundaryError(`hole[${h}]: ${v.reason ?? 'invalid'}`);", why: "arm A — measured 2026-08-11" },
    // DE-LISTED 2026-08-14 (GE-09v2, ledger hygiene): plugins/stair/src/handlers/CreateStair.ts
    // — the FILE was deleted in ce7cc5ae (MT-03: stair.create's plugin arm lost on store,
    // payload and function), taking its offender row with it. The row went stale in a
    // COMMITTED tree, so this gate sat at exit 3 for every lane. Baseline 86 → 85.
    { file: "plugins/stair/src/handlers/CreateStairBatch.ts", fragment: "return { valid: false, reason: `stairs[${i}]: ${v.reason ?? 'invalid dimensions'}` };", why: "arm A — measured 2026-08-11" },
    // FIXED + DE-LISTED 2026-08-14 (§REFUSAL-IDENTITY-CANPLACE, GE-09). `canPlace`
    // now returns a CLOSED six-member `CanPlaceRefusalCode`, and the handler renders
    // it through the shared `canPlaceRefusalText()` instead of manufacturing
    // "opening placement rejected" when the validator said nothing. Baseline 88 → 87.
    { file: "apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts", fragment: "const message = `[familyInstance] loadFamily failed: ${loaded.reason} — ${loaded.message}`;", why: "arm B — measured 2026-08-11" },
    { file: "apps/component-editor/src/marketplace/publishFlow.ts", fragment: "message: `${packed.reason}: ${packed.message}`,", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/engine/views/PaneViewPicker.ts", fragment: "if (o.reason) row.appendChild(reasonEl(o.reason, !o.enabled));", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/engine/views/PaneViewPicker.ts", fragment: "if (o.reason) row.appendChild(reasonEl(o.reason, !o.enabled));", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/ai/floorplan-import/Step4AnalysisView.ts", fragment: "if (vecAttempt.blocking) blockingReason = vecAttempt.reason;", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/apartment-layout/ApartmentLayoutController.ts", fragment: "message: `Layout regenerate failed: ${res.reason ?? 'unknown'}`,", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/apartment-layout/apartmentLayoutTrigger.ts", fragment: "if (!r.ok) toast(r.reason ?? 'Layout generation failed', 'error');", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/apartment-layout/apartmentLayoutTrigger.ts", fragment: "return { ok: false, reason: r.reason ?? 'the layout engine refused without a reason.' };", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/generative/VariantBrowserPanel.ts", fragment: "'generative.applyLayout', canResult.reason ?? '(no reason stated)');", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/graph/BuildingGraphOverlay.ts", fragment: "txt.textContent = rationale.reason;", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/living-graph/LivingGraphOverlay.ts", fragment: "why.textContent = rationale.reason;", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/living-graph/LivingGraphOverlay.ts", fragment: "if (o.reason) {", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/living-graph/LivingGraphOverlay.ts", fragment: "rs.textContent = o.reason;", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/primitives/ViewportCrashGuard.ts", fragment: "const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/primitives/ViewportCrashGuard.ts", fragment: "const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/primitives/ViewportCrashGuard.ts", fragment: "const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/primitives/ViewportCrashGuard.ts", fragment: "const reason = e.reason instanceof Error ? e.reason : new Error(msg);", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/primitives/ViewportCrashGuard.ts", fragment: "const reason = e.reason instanceof Error ? e.reason : new Error(msg);", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/property-inspector/RoomPropertySection.ts", fragment: "reasonLine.textContent = sug.reason;", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/property-panel/PropertyPanelAnnotations.ts", fragment: "fail(r.error ?? r.reason ?? 'The model rejected this change.');", why: "arm B — measured 2026-08-11" },
    { file: "apps/editor/src/ui/site/siteDispatch.ts", fragment: "if (locRes.reason !== 'no-site') return true;", why: "arm B — measured 2026-08-11" },
    { file: "packages/ai-host/src/workflows/apartmentLayout/validators/topology/acousticSeparation.ts", fragment: "message: `[${aId}] (${rule.aType}) ↔ ${rule.bType}: ACOUSTIC — ${rule.reason}`,", why: "arm B — measured 2026-08-11" },
    { file: "packages/ai-host/src/workflows/apartmentLayout/validators/topology/forbiddenAdjacency.ts", fragment: "message: `[${fromId}] (${rule.fromType}) ↔ ${rule.toType}: FORBIDDEN — ${rule.reason}`,", why: "arm B — measured 2026-08-11" },
    { file: "packages/ai-host/src/workflows/apartmentLayout/validators/topology/preferredAdjacency.ts", fragment: "message: `[${fromRoom.id}] (${rule.fromType}) ↛ ${partnerLabel}: ${rule.reason}`,", why: "arm B — measured 2026-08-11" },
    { file: "packages/family-loader/src/loadFamily.ts", fragment: "message: `[loadFamily] unpack failed: ${unpacked.reason} — ${unpacked.message}`,", why: "arm B — measured 2026-08-11" },
    { file: "packages/geometry-wall/src/WallDataSchema.ts", fragment: "ctx.addIssue({ code: 'custom', path: ['rakeAngleDeg'], message: auth.reason! });", why: "arm B — measured 2026-08-11" },
    { file: "packages/site-parcel-data/src/providers/resolveBalearsMuib.ts", fragment: "span.setAttribute('resultFields', r.ok ? 'record' : r.reason);", why: "arm B — measured 2026-08-11" },
    { file: "packages/site-parcel-data/src/providers/resolveCatalunyaFloodOverlay.ts", fragment: "span.setAttribute('resultFields', r.ok ? `effects:${r.effects.length}` : r.reason);", why: "arm B — measured 2026-08-11" },
    { file: "packages/site-parcel-data/src/providers/resolveCordobaRasterClassifiedZone.ts", fragment: "span.setAttribute('resultFields', result.ok ? 'ok' : result.reason);", why: "arm B — measured 2026-08-11" },
    { file: "packages/site-parcel-data/src/providers/resolveCordobaTracedZone.ts", fragment: "span.setAttribute('resultFields', result.ok ? 'ok' : result.reason);", why: "arm B — measured 2026-08-11" },
    { file: "packages/site-parcel-data/src/providers/resolveElSauzalZone.ts", fragment: "span.setAttribute('resultFields', result.ok ? 'ok' : result.reason);", why: "arm B — measured 2026-08-11" },
    { file: "packages/site-parcel-data/src/providers/resolveTeldeZone.ts", fragment: "span.setAttribute('resultFields', result.ok ? 'ok' : result.reason);", why: "arm B — measured 2026-08-11" },
    { file: "packages/typology-pipeline/src/PipelineRouter.ts", fragment: "message: outcome.reason,", why: "arm B — measured 2026-08-11" },
];

// ─────────────────────────────────────────────────────────────────────────────

interface Finding { readonly arm: 'A' | 'B'; readonly file: string; readonly line: number; readonly text: string }

function collect(): Finding[] {
    // ARM A. Scanned with a `.reason ||` anchor; the vocabulary test runs per hit
    // so that a benign `?? 'Untitled'` never enters the count.
    const armA = scanFiles({
        root: ROOT, dirs: [...DIRS], pattern: MANUFACTURED_RE,
        minFiles: MIN_FILES, label: 'check-refusal-identity/A',
        exclude: isTest,
    });

    // ARM B needs whole-file context (the statement window), so it re-reads via a
    // permissive line anchor and then filters. One walk each; both share the floor.
    const armB = scanFiles({
        root: ROOT, dirs: [...DIRS], pattern: READS_REASON_RE,
        minFiles: MIN_FILES, label: 'check-refusal-identity/B',
        exclude: isTest,
    });

    const out: Finding[] = [];

    for (const m of armA.matches) {
        if (isCommentLine(m.text)) continue;
        const literal = m.groups[0] ?? '';
        if (!REFUSAL_VOCAB.test(literal)) continue;
        out.push({ arm: 'A', file: m.file, line: m.line, text: m.text });
    }

    // Group ARM B hits per file so the window can look backwards without re-reading.
    const byFile = new Map<string, Match[]>();
    for (const m of armB.matches) {
        const arr = byFile.get(m.file) ?? [];
        arr.push(m);
        byFile.set(m.file, arr);
    }
    for (const [file, hits] of byFile) {
        const lines = readLines(file);
        for (const h of hits) {
            // A console trace is neither a render nor a violation — it is symmetric with
            // `isConsoleLine`'s exclusion from the identity window. Reporting it would
            // point a reviewer at a `console.log` and ask them to fix the user's screen.
            if (isCommentLine(h.text) || isConsoleLine(h.text)) continue;
            const idx = h.line - 1;
            const from = Math.max(0, idx - WINDOW);
            const raw = lines.slice(from, idx + 2);
            const window = raw.join('\n');
            if (!USER_SINK_RE.test(window)) continue;
            // Identity only counts if it is on a line the USER could see — never from a
            // `console.*` trace, and never from a comment. See `isConsoleLine`.
            const userVisible = raw
                .filter(l => !isConsoleLine(l) && !isCommentLine(l))
                .join('\n');
            if (CARRIES_IDENTITY_RE.test(userVisible)) continue;
            out.push({ arm: 'B', file, line: h.line, text: h.text });
        }
    }

    return out;
}

function readLines(rel: string): string[] {
    try { return readFileSync(resolve(ROOT, rel), 'utf8').split('\n'); }
    catch { return []; }
}

function keyOf(f: Finding): string { return `${f.file}::${f.text}`; }

function main(): void {
    const findings = collect();

    // `--emit-baseline` prints the BASELINE array for the CURRENT tree, so re-freezing
    // is a mechanical transcription rather than hand-typing 97 entries (and mistyping
    // one, which would silently exempt a file). It PRINTS; it never writes. Re-freezing
    // is a deliberate act with a reviewer, not something a gate does to itself.
    if (process.argv.includes('--emit-baseline')) {
        for (const f of findings) {
            console.log(
                `    { file: ${JSON.stringify(f.file)},`
                + ` fragment: ${JSON.stringify(f.text)},`
                + ` why: ${JSON.stringify(`arm ${f.arm} — measured 2026-08-11`)} },`,
            );
        }
        process.exit(0);
    }

    const baselineKeys = new Set(BASELINE.map(b => `${b.file}::${b.fragment}`));
    const seen = new Set<string>();
    const novel: Finding[] = [];

    for (const f of findings) {
        const k = keyOf(f);
        if (baselineKeys.has(k)) { seen.add(k); continue; }
        novel.push(f);
    }

    const stale = [...baselineKeys].filter(k => !seen.has(k));

    console.log(
        `\n[check-refusal-identity] §REFUSAL-IDENTITY (C58 §1.13 / §1.13.8, ADR-0269, ADR-0279)\n`
        + `  scanned:   ${DIRS.join(', ')} under ${ROOT}\n`
        + `  findings:  ${findings.length}  (arm A ${findings.filter(f => f.arm === 'A').length}, `
        + `arm B ${findings.filter(f => f.arm === 'B').length})\n`
        + `  baseline:  ${BASELINE.length} named offender(s)\n`,
    );

    if (novel.length > 0) {
        console.error(`❌ ${novel.length} refusal(s) rendered WITHOUT their identity and NOT in the baseline:\n`);
        for (const f of novel) {
            console.error(`   [arm ${f.arm}] ${f.file}:${f.line}\n              ${f.text}`);
        }
        console.error(
            `\n  A refusal the user cannot attribute to a rule is indistinguishable from a\n`
            + `  generic "not applicable" (C58 §1.13). Thread the existing code/kind/status\n`
            + `  through to the render — do NOT widen a closed union to \`string\`, and do NOT\n`
            + `  append to this gate's BASELINE to make this pass.\n`,
        );
    }

    if (stale.length > 0) {
        console.error(
            `❌ ${stale.length} BASELINE entr(y/ies) no longer match anything — fixed but not de-listed:\n`
            + stale.map(k => `   ${k}`).join('\n')
            + `\n\n  A shrink-only ratchet that keeps dead entries can absorb a NEW violation at the\n`
            + `  same file silently. Delete them.\n`,
        );
    }

    // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — BASELINE here is a shrink-only
    // NAMED list, so both failure modes mean the debt grew or its slots went stale
    // (a dead entry can absorb a new violation at the same file silently). Neither
    // is absorbable by gate-debt.json: exit 3, not 1.
    if (novel.length > 0 || stale.length > 0) process.exit(3);
    console.log('✅ every rendered refusal carries its identity (or is a named, unchanged baseline entry).\n');
}

main();
