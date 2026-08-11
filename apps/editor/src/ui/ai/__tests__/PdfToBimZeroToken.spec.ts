// §PDF-BIM-TIER-LADDER + §PDF-BIM-HONEST-TIER — the PDF→BIM behavioural proof.
//
// Two claims, both previously UNPROVEN, both merge-blocking from here on:
//
//  1. ZERO TOKENS. Tiers 1 (vector) and 2 (raster) are deterministic. Neither
//     may touch the LLM seam. `aiService.query` is spied and asserted at 0
//     calls on EVERY deterministic path — success, fall-through, and refusal
//     alike. A future "just ask the model when the classifier is unsure" would
//     fail here, which is the point: the ladder's value IS that walls, doors,
//     windows and the slab work on a deploy with no API key.
//
//  2. FAILURE AND EMPTINESS ARE NEVER THE SAME VALUE. Five sites in
//     Step4AnalysisView reported two different underlying conditions with one
//     identical string. Each is pinned below as a BEFORE (the legacy
//     expression, reproduced verbatim, shown colliding) and an AFTER (the
//     shipped expression, shown distinguishing).
//
// Environment: happy-dom (root vitest.config.ts), which already includes this
// directory — so this lands in CI without a config change.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiService } from '@pryzm/ai-host';
import type { PDFConversionResult } from '@pryzm/file-format';
import type { FloorPlanUnderlayTool } from '@pryzm/input-host';

// The raster tier decodes the page image through an <img> + canvas, neither of
// which happy-dom can rasterise. Mocking ONLY the decode keeps the classifier,
// the thresholds and the reporting under test — the parts this spec is about.
const decodeRasterForCv = vi.fn<
    (base64: string, mime: string) => Promise<{ rgba: Uint8ClampedArray; width: number; height: number } | null>
>();

vi.mock('../floorplan-import/FPTiers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../floorplan-import/FPTiers')>();
    return {
        ...actual,
        decodeRasterForCv: (b: string, m: string) => decodeRasterForCv(b, m),
        probeAiAvailability: async () => 'unavailable' as const,
    };
});

const { makeFPState } = await import('../floorplan-import/FPTypes');
type FPState = import('../floorplan-import/FPTypes').FPState;
const {
    tryVectorRecognition,
    tryRasterRecognition,
    describeFurnitureOutcome,
    buildPreprocessingBlock,
    buildRecognitionProvenance,
} = await import('../floorplan-import/Step4AnalysisView');

// ── Fixtures ────────────────────────────────────────────────────────────────

/** pdf.js operator codes. The vectoriser only ever compares against THIS table. */
const OPS: Record<string, number> = {
    save: 10, restore: 11, transform: 12, setLineWidth: 2,
    constructPath: 91, endPath: 28, stroke: 20,
};
const MOVE = 0;
const LINE = 1;

/**
 * `n` stroked 2-point lines drawn as `n` sub-paths of one constructPath.
 * `gapPt` is the perpendicular spacing between each pair — the knob that turns
 * a page of real walls into a page of rejected pairs.
 */
function lineOps(n: number, gapPt: number): { fnArray: number[]; argsArray: unknown[] } {
    const draw: number[] = [];
    for (let i = 0; i < n; i++) {
        const y = Math.floor(i / 2) * 200 + (i % 2) * gapPt;
        draw.push(MOVE, 0, y, LINE, 400, y);
    }
    return { fnArray: [OPS.constructPath!], argsArray: [[OPS.stroke, [draw], null]] };
}

function conversion(over: Partial<PDFConversionResult> = {}): PDFConversionResult {
    return {
        base64: 'AAAA',
        mimeType: 'image/jpeg',
        blobUrl: 'blob:test',
        widthPx: 1000,
        heightPx: 800,
        textContent: '',
        textItems: [],
        renderScale: 2,
        viewportWidthPt: 500,
        sourceKind: 'pdf',
        vector: {
            fnArray: lineOps(40, 10).fnArray,
            argsArray: lineOps(40, 10).argsArray,
            ops: OPS,
            viewportTransform: [2, 0, 0, -2, 0, 800],
            pageHeightPt: 400,
        },
        ...over,
    } as unknown as PDFConversionResult;
}

/**
 * An underlay whose only job is to answer `measureEffectiveMetersPerPixel`.
 * `planWidthMeters: 0` is the LIVE "user never calibrated in Step 2" state —
 * the condition that used to return a silent `null`.
 */
function underlay(planWidthMeters: number): FloorPlanUnderlayTool {
    return {
        pixelToWorld: () => null,
        worldToPixel: () => null,
        getState: () => ({ planWidthMeters }),
    } as unknown as FloorPlanUnderlayTool;
}

function stateWith(over: Partial<FPState>): FPState {
    return Object.assign(makeFPState(), over);
}

/** A blank white page — decodes fine, contains nothing. */
function blankRaster(w = 96, h = 96) {
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    return { rgba, width: w, height: h };
}

// ── The LLM seam ────────────────────────────────────────────────────────────

let querySpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.restoreAllMocks();
    decodeRasterForCv.mockReset();
    querySpy = vi.spyOn(aiService, 'query').mockRejectedValue(
        new Error('aiService.query must NOT be called by a deterministic tier'),
    );
});

afterEach(() => {
    // The claim under test is unconditional: no deterministic path, on any
    // outcome, reaches the LLM.
    expect(querySpy).not.toHaveBeenCalled();
});

// ── SITE 1 + 2: the fall-through reason was a hard-coded constant ───────────

describe('§PDF-BIM-HONEST-TIER site 1+2 — tier 1 fall-through reasons', () => {
    /** The shipped code, verbatim, before the fix: one constant for every way
     *  tier 1 could decline. Reproduced so the collision is EXECUTABLE. */
    const LEGACY_TIER1_REASON = 'Tier 1 (vector extraction): no usable vector line-work — fell through.';
    const legacyReasonFor = (attempt: { ok: boolean }): string | null =>
        attempt.ok ? null : LEGACY_TIER1_REASON;

    /** (a) A JPG. There is no vector stream and there never could be. */
    const noVectorStream = () => stateWith({
        pdfConversion: conversion({ sourceKind: 'image', vector: null }),
        underlayTool: underlay(10),
    });

    /** (b) Perfect line-work, but the user never calibrated the scale.
     *      THIS is the site that returned a silent `null`. */
    const scaleUnset = () => stateWith({
        pdfConversion: conversion(),
        underlayTool: underlay(0),
    });

    /** (c) Line-work AND a scale, but the pairs are 20 µm apart, so every one
     *      of them fails the 50–600 mm wall-thickness test. */
    const tooFewWalls = () => stateWith({
        pdfConversion: conversion({
            renderScale: 2,
            vector: {
                ...conversion().vector!,
                fnArray: lineOps(40, 0.001).fnArray,
                argsArray: lineOps(40, 0.001).argsArray,
            },
        }),
        underlayTool: underlay(10),
    });

    it('BEFORE (the collision): three different conditions, ONE identical sentence', async () => {
        const a = await tryVectorRecognition(noVectorStream());
        const b = await tryVectorRecognition(scaleUnset());
        const c = await tryVectorRecognition(tooFewWalls());

        expect(a.ok).toBe(false);
        expect(b.ok).toBe(false);
        expect(c.ok).toBe(false);

        // ← THE BUG. The legacy caller discarded whatever each rung computed
        //   and substituted this constant. Two of the three sentences are
        //   flatly false: (b) HAS usable line-work, and so does (c).
        expect(legacyReasonFor(a)).toBe(LEGACY_TIER1_REASON);
        expect(legacyReasonFor(b)).toBe(LEGACY_TIER1_REASON);
        expect(legacyReasonFor(c)).toBe(LEGACY_TIER1_REASON);
        expect(legacyReasonFor(a)).toBe(legacyReasonFor(b));
        expect(legacyReasonFor(b)).toBe(legacyReasonFor(c));
    });

    it('AFTER: each condition returns its OWN code and its OWN accurate sentence', async () => {
        const a = await tryVectorRecognition(noVectorStream());
        const b = await tryVectorRecognition(scaleUnset());
        const c = await tryVectorRecognition(tooFewWalls());

        if (a.ok || b.ok || c.ok) throw new Error('fixtures must all decline');

        expect(a.code).toBe('no-vector-stream');
        expect(b.code).toBe('scale-unset');
        expect(c.code).toBe('too-few-walls');

        // Three distinct sentences.
        expect(new Set([a.reason, b.reason, c.reason]).size).toBe(3);

        // …and each says the true thing.
        expect(a.reason).toContain('no vector data at all');
        expect(b.reason).toContain('the plan scale is not set');
        expect(b.reason).toContain('HAS usable line-work'); // the anti-claim, stated
        expect(c.reason).toContain('wall pair');
        expect(c.reason).toContain('REJECTED');            // §VEC-REJECT-TALLY

        // The old constant is never emitted again.
        for (const r of [a.reason, b.reason, c.reason]) {
            expect(r).not.toBe(LEGACY_TIER1_REASON);
        }
    });

    it('SITE 2 specifically: an unset scale is a BLOCKING, fixable condition, not a shrug', async () => {
        const b = await tryVectorRecognition(scaleUnset());
        if (b.ok) throw new Error('expected a decline');
        expect(b.code).toBe('scale-unset');
        expect(b.blocking).toBe(true);
        // Tier 2 handles the IDENTICAL condition; the copy is deliberately the
        // same treatment rather than a third invention.
        expect(b.reason).toContain('calibrate in Step 2 first');
    });

    it('tier 2 states the SAME condition the SAME way — one treatment, not three', async () => {
        decodeRasterForCv.mockResolvedValue(blankRaster());
        const r = await tryRasterRecognition(stateWith({
            pdfConversion: conversion(),
            underlayTool: underlay(0),
        }));
        if (r.ok) throw new Error('expected a decline');
        expect(r.code).toBe('scale-unset');
        expect(r.blocking).toBe(true);
        expect(r.reason).toContain('calibrate in Step 2 first');
    });

    it('a tier-1 SUCCESS carries its counts AND its rejection accounting — zero tokens', async () => {
        // 20 pt spacing × 20 mm/pt = 400 mm walls: squarely inside 50–600 mm.
        const s = stateWith({ pdfConversion: conversion(), underlayTool: underlay(10) });
        const r = await tryVectorRecognition(s);

        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(s.vectorStats!.walls).toBeGreaterThan(0);
        expect(r.note).toContain('Tier 1 — vector extraction (deterministic, no AI)');
        // "0 doors" must arrive with the reason it is 0.
        expect(r.note).toMatch(/0 doors|door/);
        expect(r.note).toContain('arc');
    });
});

// ── SITE 3: a stale capability description leaked as a failure reason ───────

describe('§PDF-BIM-HONEST-TIER site 3 — the tier PLAN is not a failure reason', () => {
    /** The shipped code, verbatim, before the fix. `state.tierNote` held the
     *  Step-4 PLAN note, so any tier-2 decline that did not overwrite it
     *  surfaced a CAPABILITY DESCRIPTION as the reason the import failed. */
    const legacyTier2Reason = (state: FPState, attempt: { ok: boolean }): string | null =>
        attempt.ok ? null
            : (state.tierNote || 'Tier 2 (raster analysis): too few walls recovered — fell through.');

    const PLAN_NOTE = 'Raster analysis (deterministic, no AI): a JPG/PNG has no vector data to read, '
        + 'so the image itself is analysed. Walls, doors, windows and the floor slab are approximate. '
        + 'No furniture or plumbing.';

    it('BEFORE (the collision): "this tier does not produce furniture" shown as WHY it failed', async () => {
        decodeRasterForCv.mockResolvedValue(null); // undecodable image
        // Reproduce the old field aliasing: the plan note lived in `tierNote`.
        const s = stateWith({
            pdfConversion: conversion(),
            underlayTool: underlay(10),
            tierNote: PLAN_NOTE,
        });
        const r = await tryRasterRecognition(s);

        const legacy = legacyTier2Reason(s, r);
        // ← THE BUG: the user is told the tier cannot do furniture, as an
        //   explanation for a run that failed because the IMAGE would not decode.
        expect(legacy).toBe(PLAN_NOTE);
        expect(legacy).toContain('No furniture or plumbing');
        expect(legacy).not.toContain('decode');
    });

    it('AFTER: the reason describes the actual failure and never mentions the capability', async () => {
        decodeRasterForCv.mockResolvedValue(null);
        const s = stateWith({
            pdfConversion: conversion(),
            underlayTool: underlay(10),
            tierPlanNote: PLAN_NOTE, // the plan now lives in its OWN field
        });
        const r = await tryRasterRecognition(s);

        if (r.ok) throw new Error('expected a decline');
        expect(r.code).toBe('decode-failed');
        expect(r.reason).toContain('could not be decoded');
        expect(r.reason).not.toContain('No furniture or plumbing');
        expect(r.reason).not.toBe(PLAN_NOTE);
        // The rung no longer writes its reason into shared state at all, so the
        // plan note cannot be mistaken for it.
        expect(s.tierNote).toBe('');
        expect(s.tierPlanNote).toBe(PLAN_NOTE);
    });

    it('AFTER: "decode failed" and "decoded fine, found nothing" are different sentences', async () => {
        const undecodable = stateWith({ pdfConversion: conversion(), underlayTool: underlay(10) });
        decodeRasterForCv.mockResolvedValue(null);
        const a = await tryRasterRecognition(undecodable);

        const blank = stateWith({ pdfConversion: conversion(), underlayTool: underlay(10) });
        decodeRasterForCv.mockResolvedValue(blankRaster());
        const b = await tryRasterRecognition(blank);

        if (a.ok || b.ok) throw new Error('expected declines');
        expect(a.code).toBe('decode-failed');
        expect(b.code).toBe('too-few-walls');
        expect(a.reason).not.toBe(b.reason);
        expect(b.reason).toContain('line segments'); // it MEASURED, and found none
    });
});

// ── SITE 4: a successful-but-empty enrichment reported as "never ran" ───────

describe('§PDF-BIM-HONEST-TIER site 4 — the furniture cell', () => {
    /** The shipped expression, verbatim, before the fix. */
    const legacyFurniture = (count: number, isAi: boolean): string =>
        count > 0 ? String(count) : (isAi ? '0' : 'not produced — needs the AI stage');

    it('BEFORE (the collision): "it ran and found none" and "it never ran" are ONE string', () => {
        // Both are deterministic-tier runs with zero furniture. The only
        // difference — whether the AI enrichment stage was actually called —
        // is invisible to the legacy expression.
        expect(legacyFurniture(0, false)).toBe('not produced — needs the AI stage');
        expect(legacyFurniture(0, false)).toBe(legacyFurniture(0, false)); // ← THE BUG
    });

    it('AFTER: ran-and-empty, failed, and never-attempted are three different cells', () => {
        const ran = describeFurnitureOutcome(0, stateWith({
            recognitionPath: 'vector', aiEnrichmentOutcome: 'ran', aiAvailability: 'available',
        }));
        const failed = describeFurnitureOutcome(0, stateWith({
            recognitionPath: 'vector', aiEnrichmentOutcome: 'failed', aiAvailability: 'available',
        }));
        const never = describeFurnitureOutcome(0, stateWith({
            recognitionPath: 'vector', aiEnrichmentOutcome: 'not-requested', aiAvailability: 'available',
        }));

        expect(new Set([ran, failed, never]).size).toBe(3);
        expect(ran).toContain('ran and classified none');   // IT RAN. IT FOUND NOTHING.
        expect(failed).toContain('call failed');            // we do NOT know what it would have found
        expect(never).toContain('not attempted');
    });

    it('AFTER: "not attempted" says WHY — unticked vs no upstream vs unreachable server', () => {
        const unticked = describeFurnitureOutcome(0, stateWith({ aiAvailability: 'available' }));
        const noUpstream = describeFurnitureOutcome(0, stateWith({ aiAvailability: 'unavailable' }));
        const unreachable = describeFurnitureOutcome(0, stateWith({ aiAvailability: 'unknown' }));

        expect(new Set([unticked, noUpstream, unreachable]).size).toBe(3);
        expect(noUpstream).toContain('no AI upstream is configured');
        expect(unreachable).toContain('could not be reached');
        // §CONTEXT-DATA-HONESTY: "we asked and there is none" ≠ "we could not ask".
        expect(noUpstream).not.toBe(unreachable);
    });

    it('a real count still reports as a plain number', () => {
        expect(describeFurnitureOutcome(7, stateWith({ aiEnrichmentOutcome: 'ran' }))).toBe('7');
    });
});

// ── SITE 5: the downloadable diagnostic wrote zeros it never measured ───────

describe('§PDF-BIM-HONEST-TIER site 5 — diagnostic pre-processing block', () => {
    /** The shipped literal, verbatim, before the fix. */
    const LEGACY_PREPROCESSING = { segmentsDetected: 0, guidedModeActivated: false, segments: [] };

    const aiRunWithRealF1 = () => stateWith({
        recognitionPath: 'ai',
        aiEnrichmentOutcome: 'ran',
        preprocessing: {
            segmentsDetected: 412,
            guidedModeActivated: true,
            segments: [{
                id: 'H01',
                startPx: { x: 0, y: 10 }, endPx: { x: 100, y: 10 },
                lengthPx: 100, orientation: 'horizontal', thicknessPx: 4,
            }],
        },
    });
    const deterministicRun = () => stateWith({ recognitionPath: 'vector' });

    it('BEFORE (the collision): a 412-segment guided AI run and a run with no F1 report the SAME', () => {
        // The literal ignored `state` entirely.
        expect(LEGACY_PREPROCESSING).toEqual({ segmentsDetected: 0, guidedModeActivated: false, segments: [] });
        // ← THE BUG: the report is identical whether F1 measured 412 segments
        //   or never ran, and in the first case it is simply false.
        const forAiRun = LEGACY_PREPROCESSING;
        const forDeterministicRun = LEGACY_PREPROCESSING;
        expect(forAiRun).toEqual(forDeterministicRun);
    });

    it('AFTER: the AI run reports what it measured', () => {
        const block = buildPreprocessingBlock(aiRunWithRealF1());
        expect(block.segmentsDetected).toBe(412);
        expect(block.guidedModeActivated).toBe(true);
        expect(block.segments).toHaveLength(1);
        expect(block).not.toEqual(LEGACY_PREPROCESSING);
    });

    it('AFTER: a deterministic run reports zeros AND flags them as NOT measurements', () => {
        const s = deterministicRun();
        const block = buildPreprocessingBlock(s);
        const prov = buildRecognitionProvenance(s);

        expect(block).toEqual(LEGACY_PREPROCESSING);   // the zeros are unavoidable…
        expect(prov.preprocessingRan).toBe(false);      // …but they are now labelled
        expect(prov.deterministic).toBe(true);
        expect(prov.tier).toBe('vector');
        expect(prov.rawCountsProducedBy).toBe('vector');

        // The distinguishing property, stated directly: same zeros, different report.
        const aiProv = buildRecognitionProvenance(aiRunWithRealF1());
        expect(aiProv.preprocessingRan).toBe(true);
        expect(prov).not.toEqual(aiProv);
    });

    it('AFTER: provenance names the rung, so "aiRawCounts" can never be read as "the AI ran"', () => {
        expect(buildRecognitionProvenance(stateWith({ recognitionPath: 'raster' })).deterministic).toBe(true);
        expect(buildRecognitionProvenance(stateWith({ recognitionPath: 'ai' })).deterministic).toBe(false);
        expect(buildRecognitionProvenance(stateWith({ recognitionPath: null })).tier).toBe('unknown');
    });
});

// ── The zero-token claim, stated on its own ────────────────────────────────

describe('§PDF-BIM-TIER-LADDER — tiers 1 and 2 are deterministic: ZERO model calls', () => {
    it('tier 1 success, tier 1 fall-through, tier 2 decline: no LLM call on any of them', async () => {
        decodeRasterForCv.mockResolvedValue(blankRaster());

        await tryVectorRecognition(stateWith({ pdfConversion: conversion(), underlayTool: underlay(10) }));
        await tryVectorRecognition(stateWith({ pdfConversion: conversion({ vector: null }), underlayTool: underlay(10) }));
        await tryVectorRecognition(stateWith({ pdfConversion: conversion(), underlayTool: underlay(0) }));
        await tryRasterRecognition(stateWith({ pdfConversion: conversion(), underlayTool: underlay(10) }));
        await tryRasterRecognition(stateWith({ pdfConversion: null, underlayTool: underlay(10) }));

        expect(querySpy).not.toHaveBeenCalled(); // ← the zero-token proof
    });

    it('the deterministic tiers never consult AI availability — the Analyse button is not gated on it', async () => {
        const s = stateWith({ pdfConversion: conversion(), underlayTool: underlay(10), aiAvailability: null });
        const r = await tryVectorRecognition(s);
        expect(r.ok).toBe(true);
        // Tier 1 produced a full analysis without ever asking whether a relay exists.
        expect(s.aiAvailability).toBeNull();
    });
});
