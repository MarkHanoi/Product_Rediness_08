// Apartment Layout Generator — generation orchestrator (SPEC §4/§6/§7/§10, step A4).
//
// Ties A1–A3 together: build the space-planning prompt → call the relay →
// loud-fail-soft parse → HARD validate (§8) → retry ≤3 feeding failures back
// (§10) → score (§9) → rank → truncate. Mirrors the Generate3Options workflow
// (loud-fail-soft parse, RelayPorter dependency). The relay is INJECTED so this
// orchestrator is testable with a Mock (no live AI). The AiPlane / approval-queue
// / AIStore / event wiring is the next step (A4-wire); this is its pure core.

import type { RelayPorter } from '../../AnthropicRelay.js';
import type {
    LayoutOption,
    LayoutRoom,
    LayoutWall,
    LayoutDoor,
    ApartmentConstraints,
    ApartmentProgram,
    ScoringWeights,
    ScoredLayoutOption,
} from './types.js';
import type { ShellAnalysis } from './shellAnalysis.js';
import { validateLayout } from './validate.js';
import { scoreLayout } from './score.js';
import { generateProceduralLayout } from './proceduralLayout.js';
import { generateDeterministicLayouts } from './tgl/runDeterministicLayout.js';

export const LAYOUT_MODEL = 'claude-haiku-4-5-20251014';
export const LAYOUT_MAX_TOKENS = 3000;

export const LAYOUT_SYSTEM_PROMPT = [
    'You are an expert residential space planner.',
    'Given an apartment shell (perimeter, dimensions, window/entrance faces) and a',
    'program + hard constraints, produce interior layout options as STRICT JSON ONLY',
    '(no prose). Each option is an object with: summary (≤80 chars), rooms[] (each:',
    'name, type, area m², windowCount, hasDirectAccess, adjacentTo[]), walls[] (start',
    '{x,y} end {x,y} mm), doors[] (wallRef, offset, width mm), corridorWidthMin mm.',
    'Return a JSON ARRAY of options. Obey every constraint; bedrooms need a window;',
    'no room reached only through another (en-suite via master is allowed).',
].join(' ');

export interface GenerateLayoutInput {
    shell: ShellAnalysis;
    program: ApartmentProgram;
    constraints: ApartmentConstraints;
    weights: ScoringWeights;
    /** How many ranked options to return. */
    count: number;
}

export interface GenerateLayoutResult {
    options: ScoredLayoutOption[];
    /** 'ok' when ≥1 valid option; 'rejected' when none survived validation. */
    status: 'ok' | 'rejected';
    /** Relay calls made (1 = first-try success; ≤ maxRetries). */
    attempts: number;
    reason?: string;
}

/** Build the user prompt; on retry, append the prior validation failures (§10). */
export function buildLayoutPrompt(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    priorFailures: readonly string[] = [],
): string {
    const faces = shell.faces
        .map(f => `${f.wallId}: ${f.class}${f.orientation ? ` (${f.orientation})` : ''}, ${f.windowCount} window(s)`)
        .join('; ');
    const lines = [
        `SHELL: net area ${shell.netAreaM2.toFixed(1)} m², ${shell.widthM.toFixed(1)} m × ${shell.depthM.toFixed(1)} m.`,
        `FACES: ${faces}.`,
        `PROGRAM: ${program.bedrooms} bedroom(s)${program.masterEnSuite ? ' (master en-suite)' : ''}, ` +
            `${program.bathrooms} bathroom(s)` +
            `${program.openPlanKitchenDining ? ', open-plan kitchen+dining' : ', kitchen, dining'}` +
            `${program.livingRoom ? ', living room' : ''}${program.entranceHall ? ', entrance hall' : ''}.`,
        `CONSTRAINTS: min corridor ${constraints.minCorridorWidth} mm, wall thickness ${constraints.wallThickness} mm, ` +
            `floor-to-ceiling ${constraints.floorToCeiling} mm.`,
        'OUTPUT: a JSON array of layout options. JSON only.',
    ];
    if (priorFailures.length > 0) {
        lines.push(`PREVIOUS ATTEMPT FAILED — fix these: ${priorFailures.slice(0, 12).join('; ')}.`);
    }
    return lines.join('\n');
}

// ── Loud-fail-soft parsing (mirrors Generate3Options.parseOption) ─────────────

function coerceRoom(x: unknown): LayoutRoom | null {
    if (x === null || typeof x !== 'object') return null;
    const o = x as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.type !== 'string') return null;
    return {
        name: o.name,
        type: o.type as LayoutRoom['type'],
        area: Number(o.area) || 0,
        windowCount: Number(o.windowCount) || 0,
        hasDirectAccess: o.hasDirectAccess === true,
        adjacentTo: Array.isArray(o.adjacentTo) ? o.adjacentTo.filter((s): s is string => typeof s === 'string') : [],
    };
}
function coerceWall(x: unknown): LayoutWall | null {
    if (x === null || typeof x !== 'object') return null;
    const o = x as Record<string, unknown>;
    const s = o.start as Record<string, unknown> | undefined;
    const e = o.end as Record<string, unknown> | undefined;
    if (!s || !e) return null;
    return { start: { x: Number(s.x) || 0, y: Number(s.y) || 0 }, end: { x: Number(e.x) || 0, y: Number(e.y) || 0 } };
}
function coerceDoor(x: unknown): LayoutDoor | null {
    if (x === null || typeof x !== 'object') return null;
    const o = x as Record<string, unknown>;
    if (typeof o.wallRef !== 'number') return null;
    return { wallRef: o.wallRef, offset: Number(o.offset) || 0, width: Number(o.width) || 0 };
}

/** Parse a single layout-option object. Loud-fail-soft → null on malformed. */
export function parseLayoutOption(raw: unknown): LayoutOption | null {
    if (raw === null || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.rooms)) return null;
    const rooms = r.rooms.map(coerceRoom).filter((x): x is LayoutRoom => x !== null);
    if (rooms.length === 0) return null;
    const walls = Array.isArray(r.walls) ? r.walls.map(coerceWall).filter((x): x is LayoutWall => x !== null) : [];
    const doors = Array.isArray(r.doors) ? r.doors.map(coerceDoor).filter((x): x is LayoutDoor => x !== null) : [];
    return {
        summary: typeof r.summary === 'string' ? r.summary : '',
        rooms, walls, doors,
        corridorWidthMin: Number(r.corridorWidthMin) || 0,
    };
}

/** Parse relay text into layout options (array, `{options:[]}`, or single object). */
export function parseLayoutOptions(text: string): LayoutOption[] {
    if (typeof text !== 'string' || text.length === 0) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch {
        if (typeof console !== 'undefined') console.warn('[ai-host/apartmentLayout] relay returned non-JSON — dropping.');
        return [];
    }
    const arr: unknown[] = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).options))
            ? (parsed as { options: unknown[] }).options
            : [parsed];
    return arr.map(parseLayoutOption).filter((x): x is LayoutOption => x !== null);
}

/**
 * Orchestrate generation: prompt → relay → parse → validate → retry ≤3 → score →
 * rank → truncate to `count`. The relay is injected (Mock in tests; CF relay in
 * production at A4-wire). Read-only: emits NO commands (SPEC step 11).
 */
export async function generateLayoutOptions(
    input: GenerateLayoutInput,
    relay: RelayPorter,
    opts: { maxRetries?: number; model?: string; maxTokens?: number; proceduralFallback?: boolean } = {},
): Promise<GenerateLayoutResult> {
    const maxRetries = opts.maxRetries ?? 3;
    const valid: ScoredLayoutOption[] = [];
    let failures: string[] = [];
    let attempt = 0;

    for (; attempt < maxRetries; attempt++) {
        if (valid.length >= input.count) break;
        const user = buildLayoutPrompt(input.shell, input.program, input.constraints, failures);
        let text: string;
        try {
            const resp = await relay.complete({
                model: opts.model ?? LAYOUT_MODEL,
                system: LAYOUT_SYSTEM_PROMPT,
                user,
                maxTokens: opts.maxTokens ?? LAYOUT_MAX_TOKENS,
            });
            text = resp.text;
        } catch (err) {
            // A thrown relay error (offline / 401 / 5xx) won't fix itself on retry —
            // stop and fall through to the procedural fallback below.
            failures = [`relay error: ${String(err)}`];
            break;
        }

        failures = [];
        for (const opt of parseLayoutOptions(text)) {
            const v = validateLayout(opt, input.constraints, input.program);
            if (v.valid) valid.push({ ...opt, score: scoreLayout(opt, input.weights) });
            else failures.push(...v.failures);
        }
    }

    valid.sort((a, b) => b.score.overall - a.score.overall);
    const options = valid.slice(0, input.count);

    // Offline fallback (opt-in): when the AI produced no valid layout (offline /
    // 401 / all-invalid), run the deterministic D-TGL engine (rectilinear
    // dissection → bubble graph → squarified subdivision → walls/doors → semantic
    // graph → Space-Syntax-weighted Pareto rank → geometry) so the feature still
    // delivers a real, architecturally-sound layout — summaries say
    // "(offline · D-TGL)". Off by default so the pure orchestrator keeps strict
    // "rejected" semantics; the live editor registration enables it. The strip
    // slicer (generateProceduralLayout) remains a last-resort safety net.
    if (options.length === 0 && opts.proceduralFallback) {
        const deterministic = generateDeterministicLayouts(
            input.shell, input.program, input.constraints, input.weights, input.count,
        );
        if (deterministic.length > 0) {
            return { options: deterministic, status: 'ok', attempts: attempt, reason: 'AI unavailable — deterministic D-TGL offline layout' };
        }
        const procedural = generateProceduralLayout(
            input.shell, input.program, input.constraints, input.weights, input.count,
        );
        if (procedural.length > 0) {
            return { options: procedural, status: 'ok', attempts: attempt, reason: 'AI unavailable — procedural offline layout' };
        }
    }

    return options.length > 0
        ? { options, status: 'ok', attempts: attempt }
        : { options: [], status: 'rejected', attempts: attempt, reason: failures.slice(0, 6).join('; ') || 'no valid layouts' };
}
