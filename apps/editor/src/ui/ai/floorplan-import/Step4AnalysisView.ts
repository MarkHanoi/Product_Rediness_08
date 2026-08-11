/**
 * @file Step4AnalysisView.ts
 * Step 4: AI analysis options, detection preview, continue-from-debug.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import type { FloorPlanAnalysis, PipelineDiagnosticReport } from '@pryzm/ai-host';
import { FloorPlanAIFactory } from '@pryzm/ai-host';
import { detectLineSegmentsFromBase64 } from '@pryzm/ai-host';
import { FloorPlanCommandBatcher, measureEffectiveMetersPerPixel } from '@pryzm/ai-host';
import { buildReportMetadata } from '@pryzm/ai-host';
import { renderDetectionOverlay } from '../FloorPlanDebugOverlay';
import type { FloorPlanUnderlayTool } from '@pryzm/input-host';
import { setStatus, gotoStep, showDebugStep } from './FPHelpers';
import { escHtml } from '@pryzm/ui-base';
import { renderSummary } from './Step5SummaryView';
import {
    aiEnrichmentNote,
    decodeRasterForCv,
    planTier,
    probeAiAvailability,
} from './FPTiers';

/**
 * §PDF-BIM-HONEST-TIER — the downloadable diagnostic, plus the provenance block
 * the shared `PipelineDiagnosticReport` schema has no room for.
 *
 * `PipelineDiagnosticReport` was authored when PDF-to-BIM had exactly ONE
 * engine, so its `preprocessing` and `aiRawCounts` blocks are named for the AI
 * path and carry no field saying whether that path is the one that ran. On the
 * deterministic tiers those names are wrong and `preprocessing`'s zeros are not
 * measurements at all. Widening the shared schema is `packages/ai-host`'s call;
 * until then this structural extension carries the provenance, and because it is
 * a subtype the value still assigns to `state.diagnosticReport` and still
 * serialises into the downloaded JSON.
 */
export interface PipelineDiagnosticReportPlus extends PipelineDiagnosticReport {
    readonly recognition: {
        readonly tier: 'vector' | 'raster' | 'ai' | 'unknown';
        readonly deterministic: boolean;
        /** False ⇒ the zeros in `preprocessing` are NOT measurements. */
        readonly preprocessingRan: boolean;
        readonly aiEnrichmentOutcome: FPState['aiEnrichmentOutcome'];
        readonly aiAvailability: FPState['aiAvailability'];
        readonly rawCountsProducedBy: 'vector' | 'raster' | 'ai' | 'unknown';
        readonly tierTrail: string;
        readonly tierPlan: string;
    };
}

// ── Read analysis options from DOM ────────────────────────────────────────────

export function readOptions(state: FPState): void {
    const wallsEl  = document.getElementById('fp-opt-walls')     as HTMLInputElement | null;
    const slabEl   = document.getElementById('fp-opt-slab')      as HTMLInputElement | null;
    const furnEl   = document.getElementById('fp-opt-furniture')  as HTMLInputElement | null;
    const plmbEl   = document.getElementById('fp-opt-plumbing')   as HTMLInputElement | null;
    const openEl   = document.getElementById('fp-opt-openings')   as HTMLInputElement | null;
    const heightEl = document.getElementById('fp-wall-height')    as HTMLInputElement | null;

    state.includeWalls    = wallsEl?.checked  ?? true;
    state.includeSlab     = slabEl?.checked   ?? true;
    state.includeFurniture = furnEl?.checked  ?? true;
    state.includePlumbing  = plmbEl?.checked  ?? true;
    state.includeOpenings  = openEl?.checked  ?? true;
    state.wallHeight = heightEl ? parseFloat(heightEl.value) || 3.0 : 3.0;

    // §PDF-BIM-TIER-LADDER — a DISABLED enrichment box must not be readable as
    // "the user asked for furniture". Without this the ladder would call an
    // unreachable relay on every run just to fail.
    if (furnEl?.disabled) state.includeFurniture = false;
    if (plmbEl?.disabled) state.includePlumbing = false;
}

// ── Step 4 entry: name the tier, gate ONLY the enrichment options ─────────────

/**
 * §PDF-BIM-TIER-LADDER / P0 — prepare Step 4.
 *
 * The load-bearing rule: **"Analyse Floor Plan" is never disabled.** Walls,
 * doors, windows and the floor slab come from the deterministic tiers, which
 * need no API key. Only Furniture and Plumbing depend on the AI relay, so only
 * those two checkboxes disable themselves — each stating why.
 *
 * Safe to call repeatedly (Back → Step 4 again); the availability probe is
 * memoised for the session.
 */
export async function prepareAnalysisStep(state: FPState): Promise<void> {
    const plan = planTier(state);
    // §PDF-BIM-HONEST-TIER — the plan is a CAPABILITY DESCRIPTION ("this tier
    // does not produce furniture"). It goes in `tierPlanNote`, never in
    // `tierNote`, which is reserved for what ACTUALLY RAN. Writing it to
    // `tierNote` is what let a capability sentence leak out as a failure
    // reason at the tier-2 fall-through.
    state.tierPlanNote = plan.note;

    const tierEl = document.getElementById('fp-tier-info');
    if (tierEl) {
        tierEl.textContent = plan.note;
        (tierEl as HTMLElement).style.display = 'block';
    }

    const availability = await probeAiAvailability();
    state.aiAvailability = availability;
    const enrichable = availability === 'available';

    for (const id of ['fp-opt-furniture', 'fp-opt-plumbing']) {
        const box = document.getElementById(id) as HTMLInputElement | null;
        if (!box) continue;
        box.disabled = !enrichable;
        if (!enrichable) box.checked = false;
        const label = document.getElementById(`${id}-label`);
        if (label) {
            (label as HTMLElement).style.opacity = enrichable ? '1' : '0.5';
            (label as HTMLElement).title = enrichable ? '' : aiEnrichmentNote(availability);
        }
    }

    const noteEl = document.getElementById('fp-ai-enrich-note');
    if (noteEl) {
        noteEl.textContent = aiEnrichmentNote(availability);
        (noteEl as HTMLElement).style.display = 'block';
    }
}

// ── Tier attempt result (§PDF-BIM-HONEST-TIER) ────────────────────────────────

/**
 * Why a deterministic tier declined. The code is for branching; the `reason`
 * is the sentence the user reads.
 *
 * §CONTEXT-DATA-HONESTY — the layer that KNOWS must be the layer that REPORTS.
 * These codes exist because the caller used to invent a single hard-coded
 * reason ("no usable vector line-work") for every fall-through, overwriting
 * the genuinely-computed one the tier had already put on screen. A returned,
 * discriminated result cannot be overwritten by a constant.
 */
export type TierFailureCode =
    /** No underlay tool / no conversion — an internal precondition, not a
     *  statement about the drawing. */
    | 'not-ready'
    /** This upload carries no PDF vector stream at all (image, or an
     *  encrypted / damaged page). Tier 1 was never applicable. */
    | 'no-vector-stream'
    /** A vector stream exists but holds too few primitives to be line-work. */
    | 'too-few-primitives'
    /** The page image could not be decoded (tier 2 only). */
    | 'decode-failed'
    /** The plan scale is unset or non-finite, so every millimetre threshold in
     *  the classifier is meaningless. NOT a statement about the drawing. */
    | 'scale-unset'
    /** The tier ran to completion and recovered fewer walls than its floor. */
    | 'too-few-walls';

export type TierAttempt =
    | { readonly ok: true; readonly analysis: FloorPlanAnalysis; readonly note: string }
    | {
        readonly ok: false;
        readonly code: TierFailureCode;
        /** The sentence the user reads. ALWAYS computed at the failure site. */
        readonly reason: string;
        /** True when this is a problem the user must fix (bad scale, bad file)
         *  rather than a normal rung-by-rung fall-through. */
        readonly blocking: boolean;
    };

// ── Vector-first recognition (§VEC-WIRE, PDF-TO-BIM-AUDIT-2026-08-10 §4.1) ────

/**
 * Attempt the deterministic vector path: decode the PDF's stored operator
 * list into vector primitives, classify wall pairs + door arcs + window
 * glazing in mm space, and adapt the result into the SAME FloorPlanAnalysis
 * shape the AI path produces — so FloorPlanCommandBatcher runs unchanged.
 *
 * Returns a discriminated {@link TierAttempt}. On failure the `reason` is
 * computed HERE, at the site that knows it, and travels to the caller by
 * return value — not by writing to shared UI state that the caller then
 * overwrites. Never throws for data reasons; a thrown error means a real bug
 * and is surfaced by handleAnalyse's catch.
 *
 * Exported for the §PDF-BIM-HONEST-TIER behavioural specs: the collisions this
 * function used to produce are only observable at this seam.
 */
export async function tryVectorRecognition(state: FPState): Promise<TierAttempt> {
    const conv = state.pdfConversion;
    const vec = conv?.vector;
    if (!conv || !state.underlayTool) {
        return {
            ok: false,
            code: 'not-ready',
            reason: 'Tier 1 (vector extraction): skipped — the page conversion or the underlay '
                + 'is not ready yet. This is an internal precondition, not a finding about your drawing.',
            blocking: false,
        };
    }
    if (!vec) {
        return {
            ok: false,
            code: 'no-vector-stream',
            reason: conv.sourceKind === 'pdf'
                ? 'Tier 1 (vector extraction): this PDF carries no readable vector stream '
                  + '(scanned, encrypted or damaged page), so there is no line-work to extract — '
                  + 'not applicable, rather than failed.'
                : 'Tier 1 (vector extraction): a JPG/PNG has no vector data at all — '
                  + 'not applicable, rather than failed.',
            blocking: false,
        };
    }

    const {
        extractVectorElements,
        explodeVectorLines,
        hasUsableVectorLineWork,
        classifyWallsAndColumnsWithDiagnostics,
        matchOpeningSymbolsWithDiagnostics,
        vectorResultToFloorPlanAnalysisWithDiagnostics,
        describeVectorRejections,
        composeMmToPx,
        VECTOR_MIN_WALLS,
    } = await import('@pryzm/ai-worker/pdf-to-bim');

    // The stored ops table is the full pdfjs OPS map; the vectoriser needs
    // its save/restore/transform/constructPath/… subset.
    const rawVectors = extractVectorElements(
        { fnArray: vec.fnArray, argsArray: vec.argsArray },
        vec.ops as unknown as import('@pryzm/ai-worker/pdf-to-bim').PdfOpsSubset,
    );
    if (!hasUsableVectorLineWork(rawVectors)) {
        return {
            ok: false,
            code: 'too-few-primitives',
            reason: `Tier 1 (vector extraction): only ${rawVectors.length} vector `
                + `primitive${rawVectors.length === 1 ? '' : 's'} on the page — too few to be line-work.`,
            blocking: false,
        };
    }

    // pt → mm scale. §PDF-SCALE-EFFECTIVE: derive it from the SAME effective
    // transform the batcher will use (mesh.scale-aware), so the classifier's
    // mm thresholds (wall thickness 50–600 mm, door widths…) see true sizes
    // even after the user rescales the underlay in-scene.
    const metersPerPx = measureEffectiveMetersPerPixel(state.underlayTool, conv.widthPx);
    const mmPerPt = conv.renderScale * metersPerPx * 1000;
    if (!isFinite(mmPerPt) || mmPerPt <= 0) {
        // §PDF-BIM-HONEST-TIER — this used to be a bare `return null`, which the
        // caller then reported as "no usable vector line-work". The line-work was
        // fine; the SCALE was missing. Tier 2 has always said so at the identical
        // condition (see tryRasterRecognition), and this is deliberately the same
        // treatment rather than a third one.
        return {
            ok: false,
            code: 'scale-unset',
            reason: 'Tier 1 (vector extraction): the plan scale is not set — calibrate in Step 2 first. '
                + 'The page HAS usable line-work; without a scale every millimetre threshold in the '
                + 'wall classifier is meaningless.',
            blocking: true,
        };
    }

    const vectors = explodeVectorLines(rawVectors);
    const page = {
        pageId: 'page-1',
        pageWidthPt: conv.viewportWidthPt,
        pageHeightPt: vec.pageHeightPt,
        vectors,
    };
    const { walls, wallRejections, columnRejections } =
        classifyWallsAndColumnsWithDiagnostics(page, mmPerPt);
    if (walls.length < VECTOR_MIN_WALLS) {
        // §VEC-REJECT-TALLY — say what was MEASURED and THROWN AWAY. "4 walls
        // needed, 0 found" is useless; "37 line pairs rejected as thinner than
        // 50 mm" points straight at the Step-2 scale.
        const empty = matchOpeningSymbolsWithDiagnostics(page, walls, mmPerPt);
        return {
            ok: false,
            code: 'too-few-walls',
            reason: `Tier 1 (vector extraction): only ${walls.length} wall `
                + `pair${walls.length === 1 ? '' : 's'} recovered (need ≥ ${VECTOR_MIN_WALLS}) `
                + `from ${vectors.length} vector primitives. `
                + describeVectorRejections({
                    walls: wallRejections,
                    columns: columnRejections,
                    openings: empty.rejections,
                    adapter: {
                        wallsIn: walls.length, wallsRejectedDegenerateCentreLine: 0, wallsOut: 0,
                        openingsIn: 0, openingsRejectedNoHostWall: 0, openingsOut: 0,
                    },
                }),
            blocking: false,
        };
    }
    const { openings, rejections: openingRejections } =
        matchOpeningSymbolsWithDiagnostics(page, walls, mmPerPt);

    const { analysis, rejections: adapterRejections } =
        vectorResultToFloorPlanAnalysisWithDiagnostics({
            walls,
            openings,
            mmToPx: composeMmToPx(vec.viewportTransform, mmPerPt),
            imageWidthPx: conv.widthPx,
            imageHeightPx: conv.heightPx,
        });

    const doors = analysis.openings.filter(o => o.type === 'door').length;
    const windows = analysis.openings.length - doors;
    state.vectorStats = { walls: analysis.walls.length, doors, windows };
    return {
        ok: true,
        analysis,
        note: `Tier 1 — vector extraction (deterministic, no AI): ${analysis.walls.length} wall candidates, `
            + `${doors} door${doors === 1 ? '' : 's'}, ${windows} window${windows === 1 ? '' : 's'}. `
            + describeVectorRejections({
                walls: wallRejections,
                columns: columnRejections,
                openings: openingRejections,
                adapter: adapterRejections,
            }),
    };
}

// ── Raster CV recognition (§RASTER-CV — TIER 2, deterministic, zero tokens) ───

/**
 * The deterministic tier for scanned / image plans: classical CV over the very
 * raster the wizard already rendered (binarize → despeckle → boundary → Hough
 * → the SAME stage-2 wall classifier the vector tier uses → gap/arc/glazing
 * opening classification).
 *
 * Emits the SAME `FloorPlanAnalysis` shape as the AI and vector paths, so
 * FloorPlanCommandBatcher and the four §PDF-* placement fixes
 * (§PDF-OFFSET-LEFTEDGE, §PDF-SCALE-EFFECTIVE, §PDF-HOST-DIST-GUARD,
 * §PDF-OCCUPANCY-PREFLIGHT) run unchanged.
 *
 * Returns a discriminated {@link TierAttempt}; on failure the `reason` is
 * computed at the failure site and returned, never left in shared UI state for
 * the caller to guess at. Never throws for data reasons.
 *
 * Exported for the §PDF-BIM-HONEST-TIER behavioural specs.
 */
export async function tryRasterRecognition(state: FPState): Promise<TierAttempt> {
    const conv = state.pdfConversion;
    if (!conv || !state.underlayTool) {
        return {
            ok: false,
            code: 'not-ready',
            reason: 'Tier 2 (raster analysis): skipped — the page conversion or the underlay is '
                + 'not ready yet. This is an internal precondition, not a finding about your drawing.',
            blocking: false,
        };
    }

    const {
        analyseRasterFloorPlan,
        rasterMmToPx,
        vectorResultToFloorPlanAnalysis,
        RASTER_MIN_WALLS,
    } = await import('@pryzm/ai-worker/pdf-to-bim');

    setStatus('Raster analysis: reading the page image…');
    const raster = await decodeRasterForCv(conv.base64, conv.mimeType);
    if (!raster) {
        return {
            ok: false,
            code: 'decode-failed',
            reason: 'Tier 2 (raster analysis): the page image could not be decoded, so nothing was '
                + 'measured. This is a statement about the image file, not about the drawing on it.',
            blocking: true,
        };
    }

    // §PDF-SCALE-EFFECTIVE — take mm/px from the SAME effective transform the
    // batcher will use, so the CV stage's millimetre thresholds (wall
    // thickness 50–600 mm, door widths 550–1500 mm) see TRUE sizes even after
    // the user rescales the underlay in-scene. A wrong scale here does not
    // misplace elements — it makes the classifier reject every real wall.
    const metersPerPx = measureEffectiveMetersPerPixel(state.underlayTool, conv.widthPx);
    const mmPerPx = metersPerPx * 1000 * (conv.widthPx / raster.width);
    if (!isFinite(mmPerPx) || mmPerPx <= 0) {
        return {
            ok: false,
            code: 'scale-unset',
            reason: 'Tier 2 (raster analysis): the plan scale is not set — calibrate in Step 2 first. '
                + 'A wrong scale does not misplace elements; it makes the classifier reject every real wall.',
            blocking: true,
        };
    }

    setStatus('Raster analysis: extracting wall lines from the image…');
    const result = analyseRasterFloorPlan({
        rgba: raster.rgba,
        width: raster.width,
        height: raster.height,
        mmPerPx,
    });

    const d = result.diagnostics;
    const rejected = d.gapsRejected;
    const rejectedTotal = rejected.too_narrow + rejected.too_wide + rejected.no_symbol_evidence;

    if (result.walls.length < RASTER_MIN_WALLS) {
        // §CONTEXT-DATA-HONESTY — "found nothing" and "found nothing usable"
        // are different, and the numbers say which one this is. RETURNED, not
        // written to `state.tierNote`: the caller must not have to guess
        // whether the field it reads was written by this run.
        return {
            ok: false,
            code: 'too-few-walls',
            reason: `Tier 2 (raster analysis): only ${result.walls.length} wall${result.walls.length === 1 ? '' : 's'} `
                + `recovered (need ≥ ${RASTER_MIN_WALLS}) from ${d.lineSegments} line segments`
                + `${d.wallPairsBelowResolution > 0 ? `, discarding ${d.wallPairsBelowResolution} pair(s) as thinner than this scan can resolve` : ', with no pair discarded as below resolution'}`
                + `${rejectedTotal > 0 ? `; ${rejectedTotal} wall gap(s) also rejected (${rejected.too_narrow} too narrow, ${rejected.too_wide} too wide, ${rejected.no_symbol_evidence} no door/window symbol)` : ''}. `
                + 'The scan may be too low-resolution, or the scale may be wrong.',
            blocking: false,
        };
    }

    const doors = result.openings.filter(o => o.kind === 'door').length;
    const windows = result.openings.length - doors;

    // The raster tier's mm space IS the source pixel grid, so mm→px is the
    // plain inverse scale — no viewport transform and no y-flip, unlike the
    // vector tier whose affine carries pdf.js's. The CV ran in DECODED-image
    // pixels (mmPerPx above); the batcher works in CONVERTER-image pixels, so
    // the affine uses mm-per-converter-px. They are normally the same raster;
    // keeping the two conversions distinct is what makes them stay correct if
    // they ever diverge.
    const analysis = vectorResultToFloorPlanAnalysis({
        walls: result.walls,
        openings: result.openings,
        mmToPx: rasterMmToPx(metersPerPx * 1000),
        imageWidthPx: conv.widthPx,
        imageHeightPx: conv.heightPx,
    });

    state.vectorStats = { walls: analysis.walls.length, doors, windows };
    return {
        ok: true,
        analysis,
        note: `Tier 2 — raster analysis (deterministic CV, no AI): ${analysis.walls.length} wall candidates, `
            + `${doors} door gap${doors === 1 ? '' : 's'}, ${windows} window${windows === 1 ? '' : 's'} `
            + `from ${d.lineSegments} line segments`
            + `${rejectedTotal > 0
                ? ` · ${rejectedTotal} gap(s) rejected for lack of evidence (${rejected.too_narrow} too narrow, ${rejected.too_wide} too wide, ${rejected.no_symbol_evidence} no door/window symbol)`
                : ' · no gap was rejected'}`
            + `${d.doorsGapOnly > 0 ? ` · ${d.doorsGapOnly} door(s) inferred from the gap alone, with no swing arc found — review these` : ''}`
            + '.',
    };
}

// ── Run AI analysis ────────────────────────────────────────────────────────────

export async function handleAnalyse(
    state: FPState,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): Promise<void> {
    if (!state.pdfConversion || !state.underlayTool || !state.underlayConfirmed) {
        setStatus('Please confirm the underlay position first.', true);
        return;
    }

    readOptions(state);

    const levelId = window.projectContext?.activeLevelId; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
    if (!levelId) {
        setStatus('No active level. Select one first.', true);
        return;
    }

    state.isAnalysing = true;
    const btn = document.getElementById('fp-analyse-btn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Analysing…'; }

    // §FP-ANALYSE-GUARD (founder 2026-06-19, "import pdf/image doesn't work") — the
    // pre-processing step used to run OUTSIDE the try, so if line-detection threw,
    // handleAnalyse rejected before the finally and the button stayed stuck on
    // "⏳ Analysing…" forever with no error. The whole risky section (pre-process +
    // AI relay call) is now inside ONE try/finally so it ALWAYS recovers the button
    // and surfaces a clear message.
    try {
        // ── §PDF-BIM-TIER-LADDER: deterministic first, AI last ────────────
        //   1. VECTOR  — the PDF's own line-work. Exact. No AI, no tokens.
        //   2. RASTER  — classical CV over the rendered page. Approximate.
        //                No AI, no tokens. This is what makes scanned plans
        //                work on a deploy with no API key at all.
        //   3. AI      — Claude vision. Only when a relay is CONFIGURED, and
        //                only as enrichment (furniture/plumbing) or as the
        //                last resort when BOTH deterministic tiers found
        //                nothing.
        // Walls / doors & windows / floor slab therefore never depend on an
        // API key. The "Analyse" button is never gated on AI availability.
        state.recognitionPath = null;
        state.vectorStats = null;
        // §PDF-BIM-HONEST-TIER — every per-run fact starts UNSET, so nothing a
        // previous run measured can be read as if this run had measured it.
        state.tierNote = '';
        state.aiEnrichmentOutcome = 'not-requested';
        state.preprocessing = null;
        // If the user beat the Step-4 probe to the button, settle it now: the
        // tier-3 decision below must not read "not available" merely because
        // the answer had not arrived yet (§CONTEXT-DATA-HONESTY — pending is
        // not absent). Memoised, so this is free on every later run.
        if (state.aiAvailability === null) state.aiAvailability = await probeAiAvailability();
        let analysis: FloorPlanAnalysis | null = null;
        let preprocessedSegmentCount = 0;
        let guidedModeActive = false;
        const wantsStructure = state.includeWalls || state.includeSlab || state.includeOpenings;
        const trail: string[] = [];

        // §PDF-BIM-HONEST-TIER — a fall-through reason that a rung COMPUTED must
        // reach the user. It used to be discarded and replaced by the constant
        // 'no usable vector line-work', which was wrong for four of the five
        // ways tier 1 can decline (missing scale, missing vector stream, too
        // few wall pairs, unready underlay). Each rung now RETURNS its reason
        // and the caller only forwards it.
        let blockingReason: string | null = null;
        if (wantsStructure) {
            setStatus('Tier 1 — checking for vector line-work (deterministic)…');
            const vecAttempt = await tryVectorRecognition(state);
            if (vecAttempt.ok) {
                analysis = vecAttempt.analysis;
                state.recognitionPath = 'vector';
                trail.push(vecAttempt.note);
            } else {
                trail.push(vecAttempt.reason);
                if (vecAttempt.blocking) blockingReason = vecAttempt.reason;
                // Deliberately NOT `setStatus(vecAttempt.reason)` here: the very
                // next line would overwrite it, which is the defect class this
                // change exists to remove. The reason travels on `trail`, and
                // reaches the user in #fp-tier-trail and in the final message.
                setStatus('Tier 2 — raster analysis (deterministic, no AI)…');
                const rasAttempt = await tryRasterRecognition(state);
                if (rasAttempt.ok) {
                    analysis = rasAttempt.analysis;
                    state.recognitionPath = 'raster';
                    trail.push(rasAttempt.note);
                } else {
                    trail.push(rasAttempt.reason);
                    if (rasAttempt.blocking) blockingReason = rasAttempt.reason;
                }
            }
        }

        if (analysis) {
            const vs = state.vectorStats!;
            const tierLabel = state.recognitionPath === 'vector' ? 'Vector extraction' : 'Raster analysis';
            // The rung's own `note` (already on the trail) carries the counts AND
            // the rejection accounting; restating them here only diluted it.
            setStatus(`${tierLabel}: ${vs.walls} walls, ${vs.doors} doors, ${vs.windows} windows — no AI used.`);

            if (state.includeFurniture || state.includePlumbing) {
                // Stage C enrichment only — includeStructure:false skips A/B1/B2.
                try {
                    const furnitureOnly = await FloorPlanAIFactory.analyse(
                        {
                            base64Image:      state.pdfConversion.base64,
                            widthPx:          state.pdfConversion.widthPx,
                            heightPx:         state.pdfConversion.heightPx,
                            extractedText:    state.pdfConversion.textContent,
                            includeStructure: false,
                            includeFurniture: state.includeFurniture,
                            includePlumbing:  state.includePlumbing,
                            includeSlab:      false,
                            textAnnotations:  state.pdfConversion.textItems,
                        },
                        (stage) => setStatus(stage)
                    );
                    analysis = { ...analysis, furniture: furnitureOnly.furniture };
                    // §PDF-BIM-HONEST-TIER — IT RAN. Whether it found anything is a
                    // SEPARATE fact, recorded by the count. A successful-but-empty
                    // enrichment must never be reported as "needs the AI stage".
                    state.aiEnrichmentOutcome = 'ran';
                    trail.push(furnitureOnly.furniture.length > 0
                        ? `Tier 3 (AI enrichment): ran and classified ${furnitureOnly.furniture.length} furniture/plumbing item(s).`
                        : 'Tier 3 (AI enrichment): ran to completion and classified NO furniture or plumbing '
                          + '— the stage worked, this drawing has none it recognises.');
                } catch (furnErr) {
                    // Walls/openings are already deterministic — do not let an
                    // unreachable AI relay kill the import. Report honestly.
                    console.warn('[FloorPlanImportPanel] Furniture stage failed on deterministic path:', furnErr);
                    state.aiEnrichmentOutcome = 'failed';
                    trail.push('Tier 3 (AI enrichment): the relay call failed — no furniture or plumbing was added.');
                    setStatus(`⚠ Furniture/plumbing AI stage unavailable — continuing with the walls & openings ${tierLabel.toLowerCase()} already produced.`, true);
                }
            }
        } else if (state.aiAvailability === 'available') {
            // Tier 3 — last resort. Both deterministic tiers declined, and a
            // relay IS configured, so probabilistic vision is better than
            // nothing. (When it is NOT configured we must not call it: the
            // failure would arrive as an opaque relay error rather than the
            // true statement below.)
            state.recognitionPath = 'ai';
            trail.push('Tiers 1 and 2 (deterministic) found nothing usable — falling back to AI recognition.');
            setStatus('Phase F1: Pre-processing image for line detection…');
            const preprocessed = await detectLineSegmentsFromBase64(
                state.pdfConversion.base64,
                'image/jpeg',
            );
            preprocessedSegmentCount = preprocessed.segments.length;
            guidedModeActive = preprocessed.hasUsableData;
            // §PDF-BIM-HONEST-TIER — keep the REAL F1 measurements. The
            // downloadable diagnostic used to hard-code zeros here, so an AI run
            // that measured 412 segments in guided mode still shipped a report
            // saying "0 segments, guided: false".
            state.preprocessing = {
                segmentsDetected: preprocessed.segments.length,
                guidedModeActivated: preprocessed.hasUsableData,
                segments: preprocessed.segments,
            };
            // On the AI rung, furniture/plumbing come from the SAME call as the
            // structure — so the enrichment stage genuinely ran iff it was asked for.
            state.aiEnrichmentOutcome =
                (state.includeFurniture || state.includePlumbing) ? 'ran' : 'not-requested';
            if (preprocessed.hasUsableData) {
                setStatus(`Phase F1 complete: ${preprocessed.segments.length} segments detected — activating guided AI mode…`);
            } else {
                setStatus(`Phase F1: insufficient segments (${preprocessed.segments.length}) — using standard AI detection…`);
            }

            analysis = await FloorPlanAIFactory.analyse(
                {
                    base64Image:      state.pdfConversion.base64,
                    widthPx:          state.pdfConversion.widthPx,
                    heightPx:         state.pdfConversion.heightPx,
                    extractedText:    state.pdfConversion.textContent,
                    includeStructure: state.includeWalls || state.includeSlab || state.includeOpenings,
                    includeFurniture: state.includeFurniture,
                    includePlumbing:  state.includePlumbing,
                    includeSlab:      state.includeSlab,
                    detectedSegments: preprocessed.segments,
                    textAnnotations:  state.pdfConversion.textItems,
                },
                (stage) => setStatus(stage)
            );
        } else {
            // §CONTEXT-DATA-HONESTY — the END of the ladder. Every rung is
            // reported with WHAT it found, so this reads as "your drawing did
            // not yield geometry", which is true, rather than the old
            // "AI service unavailable — ask the admin for an API key", which
            // was a false account of a run where no AI was ever needed.
            if (!wantsStructure) {
                setStatus('Nothing selected to detect — tick Walls, Doors & Windows, or Floor Slab.', true);
                return;
            }
            state.tierNote = trail.join(' ');
            // Reached only when the AI rung was NOT available (the branch above
            // consumes the 'available' case), so this always has something to say.
            const aiLine = ' AI recognition is not available as a further fallback on this deploy'
                + `${state.aiAvailability === 'unknown' ? ' (the server could not be reached to check)' : ' (no AI upstream configured)'}, `
                + 'but it is a different detector, not a better one — it would not rescue a wrong scale.';
            // §PDF-BIM-HONEST-TIER — when a rung reported a BLOCKING condition
            // (unset scale, undecodable image), lead with it. The old copy always
            // ended "check the Step 2 scale calibration", which is a guess; when a
            // rung actually measured the scale as unset, that is a FACT and belongs
            // first.
            const lead = blockingReason
                ? `The import stopped on a condition you can fix: ${blockingReason} `
                : 'No BIM geometry could be extracted from this plan. ';
            const tailAdvice = blockingReason
                ? ''
                : 'Check the Step 2 scale calibration first — a wrong scale makes every wall fail the '
                  + '50–600 mm thickness test.';
            setStatus(`${lead}${trail.join(' ')}${aiLine} ${tailAdvice}`, true);
            return;
        }

        state.rawAnalysis = analysis;
        state.tierNote = trail.join(' ');

        setStatus('Rendering detection preview…');
        await renderDebugPreviewStep(state, analysis, preprocessedSegmentCount, guidedModeActive, runtime);

        showDebugStep();
        const trailEl = document.getElementById('fp-tier-trail');
        if (trailEl) {
            trailEl.textContent = state.tierNote;
            (trailEl as HTMLElement).style.display = state.tierNote ? 'block' : 'none';
        }
        setStatus(state.recognitionPath === 'ai'
            ? '✓ AI analysis complete — review detected elements below, then continue.'
            : `✓ ${state.recognitionPath === 'vector' ? 'Vector extraction' : 'Raster analysis'} complete `
              + `(${state.vectorStats!.walls} walls, ${state.vectorStats!.doors} doors, ${state.vectorStats!.windows} windows, no AI used) `
              + '— review below, then continue.');

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[FloorPlanImportPanel] Analysis error:', err);
        // §FP-ANALYSE-GUARD — distinguish an unreachable/unconfigured AI relay from a
        // genuine analysis error so the user knows it's a SERVER config issue, not
        // their PDF. The relay surfaces 401/403/network/"fetch" failures here.
        //
        // §PDF-BIM-TIER-LADDER — this message used to claim "the floor-plan
        // analysis runs on the server AI relay". That is no longer true and was
        // the single most misleading line in the wizard: walls, doors, windows
        // and the slab are deterministic. A relay error can now only come from
        // the AI rung, so say WHICH capability is lost and what still works.
        const m = msg.toLowerCase();
        const relayDown = m.includes('401') || m.includes('403') || m.includes('unauthor')
            || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('relay')
            || m.includes('not configured') || m.includes('cf_worker') || m.includes('anthropic');
        if (relayDown) {
            setStatus(
                'The AI vision relay is not reachable/configured on this deploy, so furniture and plumbing '
                + 'cannot be detected. Walls, doors, windows and the floor slab do NOT need it — untick '
                + 'Furniture and Plumbing and run Analyse again to build them deterministically. '
                + '(To enable AI enrichment, an admin must set CF_WORKER_URL or ANTHROPIC_API_KEY.)',
                true,
            );
        } else {
            setStatus(`Error: ${msg}`, true);
        }
    } finally {
        state.isAnalysing = false;
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Analyse Floor Plan'; }
    }
}

// ── Debug preview step ────────────────────────────────────────────────────────

/**
 * Renders the colored debug overlay canvas into #fp-debug-canvas-wrap.
 * Called from handleAnalyse() after the AI analysis returns.
 */
async function renderDebugPreviewStep(
    state: FPState,
    analysis: FloorPlanAnalysis,
    preprocessedSegmentCount: number,
    guidedModeActive: boolean,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): Promise<void> {
    if (!state.pdfConversion) return;

    const wrapEl = document.getElementById('fp-debug-canvas-wrap');
    if (!wrapEl) return;

    wrapEl.innerHTML = '';

    try {
        const result = await renderDetectionOverlay(
            analysis,
            state.pdfConversion.base64,
            'image/jpeg',
            640,
            runtime /* B-runtime-thread renderDetectionOverlay */,
        );

        result.canvas.style.width  = '100%';
        result.canvas.style.height = 'auto';
        result.canvas.style.display = 'block';
        result.canvas.style.borderRadius = '4px';
        wrapEl.appendChild(result.canvas);

        populateDebugStats(analysis, result.stats, preprocessedSegmentCount, guidedModeActive, state);

    } catch (err) {
        wrapEl.innerHTML = `<div style="color:#dc3545;font-size:12px;">Preview unavailable: ${escHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
}

// ── Debug stats table ─────────────────────────────────────────────────────────

/**
 * §PDF-BIM-HONEST-TIER — the furniture/plumbing cell.
 *
 * The old expression collapsed FOUR different worlds into one sentence:
 *
 *   • the enrichment stage RAN and classified nothing;
 *   • the enrichment call FAILED;
 *   • the user unticked the boxes;
 *   • this deploy has no AI upstream, so the boxes were disabled for them.
 *
 * All four rendered as "not produced — needs the AI stage", which is true of
 * exactly one of them and actively misleading in the first two: the stage DID
 * run. `state.aiEnrichmentOutcome` is what makes them separable.
 *
 * Exported for the behavioural spec — the collision is only visible here.
 */
export function describeFurnitureOutcome(count: number, state: FPState): string {
    if (count > 0) return String(count);
    switch (state.aiEnrichmentOutcome) {
        case 'ran':
            // IT RAN. IT FOUND NOTHING. That is a finding about the drawing.
            return '0 — the AI stage ran and classified none';
        case 'failed':
            return 'unknown — the AI enrichment call failed, so nothing was classified either way';
        case 'not-requested':
        default:
            if (state.aiAvailability === 'unavailable') {
                return 'not attempted — no AI upstream is configured on this deploy';
            }
            if (state.aiAvailability === 'unknown') {
                return 'not attempted — the server could not be reached to check for an AI upstream';
            }
            return 'not attempted — the Furniture and Plumbing options were not selected';
    }
}

function populateDebugStats(
    analysis: FloorPlanAnalysis,
    stats: { exteriorWalls: number; interiorWalls: number; unknownWalls: number; doors: number; windows: number },
    preprocessedSegmentCount: number,
    guidedModeActive: boolean,
    state: FPState,
): void {
    const totalWalls    = analysis.walls.length;
    const totalOpenings = analysis.openings.length;

    // §CONTEXT-DATA-HONESTY / §PDF-BIM-TIER-LADDER — name WHICH rung produced
    // these numbers. "28 walls" means something different from each tier.
    const isAi      = state.recognitionPath === 'ai';
    const isVector  = state.recognitionPath === 'vector';
    const pathLabel = isVector
        ? 'Tier 1 — vector extraction (deterministic, no AI)'
        : isAi
            ? 'Tier 3 — AI recognition (Claude vision)'
            : 'Tier 2 — raster analysis (deterministic CV, no AI)';
    const rawLabel  = isVector ? 'raw vector' : isAi ? 'raw AI' : 'raw raster';

    const rows: Array<{ label: string; value: string; color?: string }> = [
        { label: 'Recognition path',              value: pathLabel,                     color: isAi ? undefined : '#6600FF' },
        { label: 'Exterior walls detected',      value: String(stats.exteriorWalls),   color: '#22c55e' },
        { label: 'Interior partitions detected',  value: String(stats.interiorWalls),   color: '#f472b6' },
        { label: 'Unknown-type walls',            value: String(stats.unknownWalls),    color: '#9ca3af' },
        { label: `Total walls (${rawLabel})`,      value: String(totalWalls) },
        { label: 'Doors detected',                value: String(stats.doors),           color: '#3b82f6' },
        { label: 'Windows detected',              value: String(stats.windows),         color: '#f97316' },
        { label: `Total openings (${rawLabel})`,   value: String(totalOpenings) },
        ...(isAi
            ? [{ label: 'F1 pre-processed segments', value: `${preprocessedSegmentCount} (${guidedModeActive ? 'guided' : 'free'} mode)` }]
            : []),
        { label: 'Furniture / plumbing', value: describeFurnitureOutcome(analysis.furniture.length, state) },
    ];

    const tableEl = document.getElementById('fp-debug-stats-table');
    if (!tableEl) return;
    tableEl.innerHTML = rows.map(r => `
        <tr>
            <td style="padding:3px 8px 3px 0;font-size:11px;color:#666;">${r.label}</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:${r.color ?? '#1a1a2e'};">${r.value}</td>
        </tr>
    `).join('');
}

// ── Room overlay on debug canvas ──────────────────────────────────────────────

/**
 * Issue 8 — Draw semi-transparent purple room polygons + centroid labels
 * on top of the existing wall debug canvas.
 */
function renderRoomOverlayOnDebugCanvas(
    rooms: Array<{ id: string; boundaryWallIds: string[]; centroid: { x: number; z: number }; labelFromPDF?: string }>,
    wallUUIDToWorld: Map<string, { worldStart: { x: number; z: number }; worldEnd: { x: number; z: number } }>,
    underlayTool: FloorPlanUnderlayTool,
    imgWidthPx: number,
    imgHeightPx: number,
): void {
    const canvas = document.querySelector('#fp-debug-canvas-wrap canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = canvas.width  / imgWidthPx;
    const scaleY = canvas.height / imgHeightPx;

    for (const room of rooms) {
        ctx.fillStyle   = 'rgba(128, 0, 200, 0.15)';
        ctx.strokeStyle = 'rgba(128, 0, 200, 0.6)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        let first = true;
        for (const wallId of room.boundaryWallIds) {
            const entry = wallUUIDToWorld.get(wallId);
            if (!entry) continue;
            const imgPx = underlayTool.worldToPixel(entry.worldStart.x, entry.worldStart.z);
            if (!imgPx) continue;
            const cx = imgPx.x * scaleX;
            const cy = imgPx.y * scaleY;
            if (first) { ctx.moveTo(cx, cy); first = false; }
            else ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const centImgPx = underlayTool.worldToPixel(room.centroid.x, room.centroid.z);
        if (centImgPx) {
            const cx = centImgPx.x * scaleX;
            const cy = centImgPx.y * scaleY;
            const label = room.labelFromPDF ?? room.id;
            ctx.font      = '11px sans-serif';
            ctx.textAlign = 'center';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(128, 0, 200, 0.85)';
            ctx.beginPath();
            ctx.roundRect(cx - tw / 2 - 4, cy - 12, tw + 8, 15, 3);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, cx, cy - 1);
        }
    }
    ctx.textAlign = 'left';
}

// ── Diagnostic-report provenance (§PDF-BIM-HONEST-TIER) ───────────────────────

/**
 * The Phase-F1 pre-processing block of the downloadable diagnostic.
 *
 * BEFORE: this was three hard-coded literals — `segmentsDetected: 0,
 * guidedModeActivated: false, segments: []` — written on EVERY run. An AI run
 * whose F1 stage had measured 412 segments and switched to guided mode still
 * shipped a report claiming zero segments and free mode. The reader is then
 * hunting a pre-processing bug that never happened.
 *
 * AFTER: the real measurements when F1 ran; the zeros only when it did not —
 * and in that case `recognition.preprocessingRan` is false, so the zeros can be
 * read as "not measured" rather than "measured zero".
 */
export function buildPreprocessingBlock(state: FPState): PipelineDiagnosticReport['preprocessing'] {
    if (state.preprocessing) {
        return {
            segmentsDetected: state.preprocessing.segmentsDetected,
            guidedModeActivated: state.preprocessing.guidedModeActivated,
            segments: state.preprocessing.segments,
        };
    }
    return { segmentsDetected: 0, guidedModeActivated: false, segments: [] };
}

/**
 * The provenance block the shared `PipelineDiagnosticReport` schema has no room
 * for: WHICH rung produced the numbers, whether F1 ran at all, and what the
 * enrichment stage did.
 *
 * Without `preprocessingRan`, `segmentsDetected: 0` is ambiguous between "F1 ran
 * and found none" and "F1 never ran" — the same failure-vs-emptiness collision,
 * one level down in the file the user hands to support.
 */
export function buildRecognitionProvenance(state: FPState): PipelineDiagnosticReportPlus['recognition'] {
    const tier = state.recognitionPath ?? 'unknown';
    return {
        tier,
        deterministic: tier === 'vector' || tier === 'raster',
        preprocessingRan: state.preprocessing !== null,
        aiEnrichmentOutcome: state.aiEnrichmentOutcome,
        aiAvailability: state.aiAvailability,
        // `aiRawCounts` is named for the AI path but is populated by whichever
        // rung actually ran. This field is the only thing that says which.
        rawCountsProducedBy: tier,
        tierTrail: state.tierNote,
        tierPlan: state.tierPlanNote,
    };
}

// ── Continue from debug preview to proposals ──────────────────────────────────

/**
 * Continues from the detection preview step to proposal batching and Step 5.
 * Called when the user clicks "Continue to Proposals" in the debug step.
 */
export async function handleContinueFromDebug(state: FPState): Promise<void> {
    const analysis = state.rawAnalysis;
    if (!analysis || !state.underlayTool) {
        setStatus('Analysis data missing — please run analysis again.', true);
        gotoStep(state, 4);
        return;
    }

    const levelId = window.projectContext?.activeLevelId; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
    if (!levelId) {
        setStatus('No active level. Select one first.', true);
        return;
    }

    const continueBtn = document.getElementById('fp-debug-continue-btn') as HTMLButtonElement | null;
    if (continueBtn) { continueBtn.disabled = true; continueBtn.textContent = '⏳ Batching…'; }

    setStatus('Batching proposals…');

    try {
        const result = FloorPlanCommandBatcher.batch({
            analysis,
            underlayTool:    state.underlayTool,
            targetLevelId:   levelId,
            wallHeight:      state.wallHeight,
            includeWalls:    state.includeWalls,
            includeSlab:     state.includeSlab,
            includeFurniture: state.includeFurniture,
            includePlumbing:  state.includePlumbing,
            includeOpenings:  state.includeOpenings,
        });

        state.proposals = result.proposals;
        const { walls, slab, furniture, plumbing, openings, rooms } = result.summary;
        const parts = [
            `${walls} wall${walls !== 1 ? 's' : ''}`,
            `${openings} opening${openings !== 1 ? 's' : ''} (doors/windows)`,
            `🟣 ${rooms} room${rooms !== 1 ? 's' : ''} detected`,
            `${slab} slab`,
            `${furniture} furniture item${furniture !== 1 ? 's' : ''}`,
            `${plumbing} plumbing fixture${plumbing !== 1 ? 's' : ''}`,
        ];
        // §CONTEXT-DATA-HONESTY — say WHICH rung of the ladder produced this.
        const rawCounts = state.vectorStats
            ? ` (${state.vectorStats.walls} walls, ${state.vectorStats.doors} doors, ${state.vectorStats.windows} windows raw)`
            : '';
        const pathNote = state.recognitionPath === 'vector'
            ? `Vector extraction — deterministic, no AI${rawCounts}`
            : state.recognitionPath === 'raster'
                ? `Raster analysis — deterministic CV, no AI${rawCounts}`
                : 'AI recognition (Claude vision)';
        state.summaryText = `[${pathNote}] Found: ${parts.join(' · ')}.${result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ''}`;

        if (result.rooms.length > 0 && state.underlayTool && state.pdfConversion) {
            renderRoomOverlayOnDebugCanvas(
                result.rooms,
                result.wallUUIDToWorld,
                state.underlayTool,
                state.pdfConversion.widthPx,
                state.pdfConversion.heightPx,
            );
        }

        const conv = state.pdfConversion!;
        const topoGraph = result.wallGraph;
        const totalNodes = topoGraph.nodes.size;
        const totalEdges = topoGraph.edges.size;
        const outerFacePoly = (() => {
            const slabProposal = result.proposals.find(p => p.intentType === 'PDF_IMPORT_SLAB');
            if (!slabProposal) return null;
            const cmd = slabProposal.command as any;
            const poly = cmd?.params?.polygon ?? cmd?.polygon ?? null;
            if (!poly || !Array.isArray(poly)) return null;
            return (poly as Array<{ x: number; y: number }>).map(p => ({ x: p.x, z: p.y }));
        })();

        const report: PipelineDiagnosticReportPlus = {
            schemaVersion: '1.0',
            metadata: buildReportMetadata(
                conv.widthPx,
                conv.heightPx,
                state.pxPerMeter,
                state.calibrationMethod,
            ),
            preprocessing: buildPreprocessingBlock(state),
            recognition: buildRecognitionProvenance(state),
            aiRawCounts: {
                b1WallsDetected:    analysis.walls.length,
                b2OpeningsDetected: analysis.openings.length,
                slabDetected:       !!analysis.slab,
                slabConfidence:     analysis.slab?.confidence ?? null,
                furnitureDetected:  analysis.furniture.length,
            },
            walls: result.wallDiagnostics,
            postProcessing: result.postProcessingStats,
            topology: {
                wallGraphNodes:  totalNodes,
                wallGraphEdges:  totalEdges,
                roomsDetected:   result.rooms.length,
                rooms: result.rooms.map(r => ({
                    id:                r.id,
                    areaM2:            parseFloat(r.areaM2.toFixed(3)),
                    centroid:          { x: parseFloat(r.centroid.x.toFixed(4)), z: parseFloat(r.centroid.z.toFixed(4)) },
                    boundaryWallCount: r.boundaryWallIds.length,
                })),
                slabSource:          slab > 0 ? (outerFacePoly ? 'topology_outer_face' : 'ai_detected') : 'none',
                outerFaceVertices:   outerFacePoly ? outerFacePoly.length : null,
                outerFacePolygon:    outerFacePoly,
            },
            openings: result.openingDiagnostics,
            proposalSummary: {
                walls,
                slab,
                openings,
                furniture,
                plumbing,
                total:   result.proposals.length,
                skipped: result.skippedCount,
            },
        };
        state.diagnosticReport = report;

        const wallJsonBtn = document.getElementById('fp-wall-json-btn') as HTMLButtonElement | null;
        if (wallJsonBtn) wallJsonBtn.style.display = 'inline-block';
        const diagBtn = document.getElementById('fp-diag-download-btn') as HTMLButtonElement | null;
        if (diagBtn) diagBtn.style.display = 'inline-block';

        gotoStep(state, 5);
        renderSummary(state, result.proposals);
        setStatus(`✓ Analysis complete. ${state.proposals.length} proposals ready.`);

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[FloorPlanImportPanel] Continue-from-debug error:', err);
        setStatus(`Error: ${msg}`, true);
    } finally {
        if (continueBtn) { continueBtn.disabled = false; continueBtn.textContent = '▶ Continue to Proposals'; }
    }
}
