// §LINEWORK-3D-PROBE (L-1225, serving L-1185) — SHIP THE PROBE BEFORE THE FIX.
//
// THE REPORT (founder, production, 2026-08-19): *"Please review the LINES COMING TO
// 3D VIEW"* — black rectangular outlines lying flat on the façade around the
// ground-floor openings, plus stray black segments, in the 3D perspective view.
//
// WHY A PROBE AND NOT A FIX
// -------------------------
// Four rival hypotheses were on the table (stale projected edges surviving a view
// switch · the `ViewController._mountDrawing` group · a legitimate `WallEdges`
// overlay drawing the wrong thing · cross-project residue). **Static reading killed
// two of them and could not separate the rest**, and this repo has already paid for
// picking between rivals on plausibility:
//
//   [[inset-collapse-was-the-depth-rootcause]] — "two rival theories both CONFIRMED
//   and both wrong. Probe geometry, not the number."
//   [[probe-can-be-wrong-three-ways]] — wrong RUNTIME / wrong PROPERTY / wrong
//   SYSTEM. Demand an INDEPENDENT source.
//
// What static reading DID establish, and what it could not:
//
//   ✓ KILLED — the mounted `TechnicalDrawing`. `_activate3DView` calls
//     `_unmountDrawing()` (ViewController.ts:1565) and `deactivate()` disables
//     DOCUMENTATION_LAYER on the camera (:2413). The founder's own log also shows the
//     elevation ran through `PlanViewManager`, whose branch prints
//     *"TechnicalDrawing NOT mounted to 3D scene (Canvas2D only)"* and returns before
//     `scene.add`. Nothing was mounted to unmount.
//   ✓ KILLED — the plan SYMBOL builders. `WindowPlanSymbolBuilder` /
//     `DoorPlanSymbolBuilder` inject into the TechnicalDrawing, never into
//     `world.scene.three`.
//   ✗ NOT SEPARABLE STATICALLY — `WallEdges` / `SlabEdges` overlays. Both builders
//     create their line objects `visible = false`
//     (`WallEdgeOverlayBuilder.ts:143`, `SlabFragmentBuilder.ts:1634`) and
//     `WallEdgeVisibilityService.setVisible(isPlanMode)` turns them off on every
//     non-plan `view-activated`. On paper they cannot be visible in 3D. The founder
//     is looking at them anyway, so a written invariant is exactly what must not be
//     trusted here — measure the live object.
//   ✗ NOT SEPARABLE STATICALLY — anything created AFTER the last `view-activated`.
//     `initScene.ts` re-applies the floor-hatch and room-fill gates on element
//     rebuild events precisely because "the builder always creates it visible"; the
//     edge-overlay gate has NO such re-apply. Whether that window is ever hit
//     depends on runtime ordering.
//
// ⭐ THE ONE QUESTION THAT DISCRIMINATES ALL FOUR: **did the offending objects exist
// on the FIRST 3D activation of the session, or did they appear after a visit to
// another view?** This probe answers exactly that, by censusing on every 3D entry
// and DIFFING against the first one. It does not guess; it prints identity.
//
// P2: no `import * as THREE` — every object is read structurally (`.type`,
// `.layers.mask`, `.visible`, `.material.color`). P6: reads only; mutates nothing.
// Cost: one scene traverse per 3D activation, i.e. the same order as the three
// overlay gates initScene already runs on that event.

// §C13-CANDIDATE-OWNERS (L-8110) — see the projectScopeRegistry.register at the foot of this file.
import { projectScopeRegistry } from '@pryzm/core-app-model';

/** One line-bearing object, as the probe sees it. */
export interface LineworkRow {
    /** THREE `Object3D.type` — 'Line' | 'LineSegments' | 'LineLoop' | 'Line2' | … */
    readonly type: string;
    readonly name: string;
    /** `userData.elementType` — 'WallEdges', 'SlabEdges', 'Window', … */
    readonly elementType: string | null;
    /** `userData.role` — 'edges', 'cut', 'projection', … */
    readonly role: string | null;
    /** `userData.id` ?? `userData.elementId` — the attribution key the C13 audit uses. */
    readonly elementId: string | null;
    /** `userData.projectId` — present only where a producer stamps it. */
    readonly projectId: string | null;
    /** `userData.viewId` — present only where a producer stamps it (today: none). */
    readonly viewId: string | null;
    /** Material colour as 6-hex, when the object has a colour-bearing material. */
    readonly colour: string | null;
    readonly depthTest: boolean | null;
    readonly renderOrder: number;
    /** THREE layers bitmask. 1 = layer 0 (BIM) only — the default. */
    readonly layerMask: number;
    /** The object's own `visible` flag. */
    readonly visible: boolean;
    /** `visible` AND every ancestor visible — what actually reaches the renderer. */
    readonly effectivelyVisible: boolean;
    /** Chain of ancestor names/types up to the scene root. */
    readonly parentChain: string;
}

/** A census: the rows, plus a signature histogram for cheap diffing. */
export interface LineworkCensus {
    readonly at: string;
    readonly total: number;
    readonly effectivelyVisible: number;
    readonly rows: readonly LineworkRow[];
    /** signature → count. The diff key. */
    readonly histogram: Readonly<Record<string, number>>;
}

// ── Structural views (no THREE import, P2) ────────────────────────────────────

interface ObjLike {
    type?: string;
    name?: string;
    visible?: boolean;
    renderOrder?: number;
    userData?: Record<string, unknown>;
    layers?: { mask?: number };
    parent?: ObjLike | null;
    children?: ObjLike[];
    material?: unknown;
}

/** Object types that carry LINE geometry. `Line2`/`LineSegments2` extend Mesh, so
 *  they are matched by name too — the exact trap `WallEdgeVisibilityService`'s own
 *  "Doc 20 Fix" comment records (`instanceof THREE.LineSegments` silently missed
 *  them), which is why this probe never uses `instanceof`. */
const LINE_TYPES: ReadonlySet<string> = new Set([
    'Line', 'LineSegments', 'LineLoop', 'Line2', 'LineSegments2', 'Wireframe',
]);

/** A Mesh tagged as an edge overlay is linework whatever THREE calls its class. */
function isLineBearing(obj: ObjLike): boolean {
    if (LINE_TYPES.has(obj.type ?? '')) return true;
    return obj.userData?.['role'] === 'edges';
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.length > 0 ? v : null;
}

function readColour(material: unknown): { colour: string | null; depthTest: boolean | null } {
    const m = Array.isArray(material) ? material[0] : material;
    const mm = m as { color?: { getHexString?: () => string }; depthTest?: boolean } | undefined;
    let colour: string | null = null;
    try { colour = mm?.color?.getHexString?.() ?? null; } catch { colour = null; }
    return { colour, depthTest: typeof mm?.depthTest === 'boolean' ? mm.depthTest : null };
}

function describeRow(obj: ObjLike): LineworkRow {
    const ud = obj.userData ?? {};
    const { colour, depthTest } = readColour(obj.material);

    let effective = obj.visible !== false;
    const chain: string[] = [];
    let p = obj.parent ?? null;
    let guard = 0;
    while (p && guard++ < 32) {
        if (p.visible === false) effective = false;
        chain.push(p.name && p.name.length > 0 ? p.name : (p.type ?? 'Object3D'));
        p = p.parent ?? null;
    }

    return {
        type:        obj.type ?? 'Object3D',
        name:        obj.name ?? '',
        elementType: str(ud['elementType']),
        role:        str(ud['role']),
        elementId:   str(ud['id']) ?? str(ud['elementId']),
        projectId:   str(ud['projectId']),
        viewId:      str(ud['viewId']),
        colour,
        depthTest,
        renderOrder: typeof obj.renderOrder === 'number' ? obj.renderOrder : 0,
        layerMask:   typeof obj.layers?.mask === 'number' ? obj.layers.mask : -1,
        visible:     obj.visible !== false,
        effectivelyVisible: effective,
        parentChain: chain.reverse().join(' › '),
    };
}

/**
 * The DIFF KEY. Deliberately excludes the element id: the question is "what CLASS of
 * linework appeared", not "which instance" — a rebuild changes every id while the
 * class is what names the producer.
 */
/**
 * §LINEWORK-3D-PROBE — DECODE THE MASK, NEVER PRINT IT RAW.
 *
 * The first production dump printed `layers:2`, which reads as "layer 2" and is
 * layer **1** — `Object3D.layers.mask` is a BITMASK. That one ambiguity cost a
 * round trip: `layers:2` is `EDITOR_LAYER`, which is the whole root of L-1227, and
 * it was momentarily read as ANNOTATION_LAYER. Print the names.
 *
 * Numbering is `packages/scene-committer/src/SceneLayers.ts`.
 */
export function decodeLayerMask(mask: number): string {
    if (mask < 0) return 'unknown';
    const NAMES: Record<number, string> = {
        0: 'BIM', 1: 'EDITOR', 2: 'ANNOTATION', 3: 'PLAN_SYMBOL', 5: 'DOCUMENTATION',
    };
    const on: string[] = [];
    for (let bit = 0; bit < 32; bit++) {
        if ((mask & (1 << bit)) !== 0) on.push(NAMES[bit] ?? `L${bit}`);
    }
    return on.length === 0 ? 'none' : on.join('+');
}

export function lineworkSignature(r: LineworkRow): string {
    return [
        r.type,
        r.elementType ?? '-',
        r.role ?? '-',
        r.colour ?? '-',
        `layer:${decodeLayerMask(r.layerMask)}(mask ${r.layerMask})`,
        r.effectivelyVisible ? 'VISIBLE' : 'hidden',
    ].join(' | ');
}

/**
 * §LINEWORK-3D-PROBE — NAME THE PRODUCER, not just the class.
 *
 * The first dump answered "what is it" and left "who made it" to a static hunt that
 * took a whole extra round trip. Attribution is keyed on stamps production really
 * writes, cited so a rename breaks the guess instead of silently degrading it.
 */
export function attributeProducer(r: LineworkRow): string {
    // ORDER MATTERS, and a test pins it. The parcel ring and the OBC projection lines
    // share ONE mask (EDITOR_LAYER) and both carry no elementType and no role — which is
    // precisely why the founder's dump showed them as neighbouring classes. Match the
    // KNOWN-LEGITIMATE aid on its brand colour FIRST; a broader rule placed above it
    // silently reclassifies a working feature as the defect.
    if (r.colour === '6600ff') {
        return 'ParcelBoundarySceneRenderer (PRYZM purple #6600FF on EDITOR_LAYER) — LEGITIMATE, §L-426 wants this in 3D';
    }
    if (r.role === 'edges' && r.elementType === 'WallEdges') return 'WallEdgeOverlayBuilder (geometry-wall)';
    if (r.role === 'edges' && r.elementType === 'SlabEdges') return 'SlabFragmentBuilder (geometry-slab)';
    if (r.role === 'edges') return 'an edge-overlay builder (role=edges, elementType unstamped)';
    if (
        r.parentChain.includes('TechnicalDrawing') ||
        (r.elementType === null && r.role === null && r.layerMask === (1 << 1))
    ) {
        // @thatopen/components TechnicalDrawing.addProjectionLines() ends `ls.layers.set(1)`.
        return 'OBC TechnicalDrawing projection line (EdgeProjectorService → addProjectionLines; OBC hard-sets THREE layer 1 = PRYZM EDITOR_LAYER) — L-1227';
    }
    return 'UNATTRIBUTED — no elementType, no role, no known colour. Read parentChain.';
}

/** Walk a scene-like root and census every line-bearing object. Never throws. */
export function censusLinework(root: ObjLike | null | undefined): LineworkCensus {
    const rows: LineworkRow[] = [];
    const stack: ObjLike[] = root ? [root] : [];
    let guard = 0;
    while (stack.length > 0 && guard++ < 500_000) {
        const obj = stack.pop()!;
        const kids = obj.children;
        if (Array.isArray(kids)) for (const k of kids) stack.push(k);
        if (obj === root) continue;
        try { if (isLineBearing(obj)) rows.push(describeRow(obj)); } catch { /* skip */ }
    }
    const histogram: Record<string, number> = {};
    let visible = 0;
    for (const r of rows) {
        const sig = lineworkSignature(r);
        histogram[sig] = (histogram[sig] ?? 0) + 1;
        if (r.effectivelyVisible) visible += 1;
    }
    return {
        at: new Date().toISOString(),
        total: rows.length,
        effectivelyVisible: visible,
        rows,
        histogram,
    };
}

/**
 * Signatures present in `now` that were absent (or rarer) in `baseline`.
 * ⭐ THIS IS THE DISCRIMINATOR: a signature that appears only AFTER visiting an
 * elevation proves hypothesis (a) — teardown — while one present in the baseline
 * proves the linework was there from first paint and the view switch is innocent.
 */
export function diffCensus(
    baseline: LineworkCensus,
    now: LineworkCensus,
): Array<{ signature: string; baselineCount: number; nowCount: number }> {
    const out: Array<{ signature: string; baselineCount: number; nowCount: number }> = [];
    for (const [sig, n] of Object.entries(now.histogram)) {
        const b = baseline.histogram[sig] ?? 0;
        if (n > b) out.push({ signature: sig, baselineCount: b, nowCount: n });
    }
    return out.sort((a, b) => (b.nowCount - b.baselineCount) - (a.nowCount - a.baselineCount));
}

// ─── Runtime wiring ───────────────────────────────────────────────────────────

let _baseline: LineworkCensus | null = null;
let _installed = false;
let _entries = 0;

/** The most recent census, kept for `window.__pryzmDumpLinework()`. */
let _last: LineworkCensus | null = null;

function liveScene(): ObjLike | null {
    try {
        return (window as unknown as { scene?: ObjLike }).scene ?? null;
    } catch {
        return null;
    }
}

/**
 * Census the live scene and print the VISIBLE linework classes. Prints only what is
 * effectively visible in the summary — a hidden `WallEdges` overlay is correct and
 * printing 900 of them would bury the two rows that matter.
 */
export function runLineworkProbe(reason: string): LineworkCensus | null {
    const scene = liveScene();
    if (!scene) return null;
    const census = censusLinework(scene);
    _last = census;
    _entries += 1;

    const visibleSigs = Object.entries(census.histogram)
        .filter(([sig]) => sig.endsWith('VISIBLE'))
        .sort((a, b) => b[1] - a[1]);

    console.log(
        `[linework-probe] §LINEWORK-3D-PROBE (${reason}, 3D entry #${_entries}) — ` +
        `${census.total} line object(s), ${census.effectivelyVisible} EFFECTIVELY VISIBLE ` +
        `across ${visibleSigs.length} visible class(es).`,
    );
    for (const [sig, n] of visibleSigs.slice(0, 12)) {
        console.log(`[linework-probe]   ×${n}  ${sig}`);
        // ⭐ NAME THE PRODUCER IN THE SUMMARY. The first production dump printed only
        // the class, so identifying the owner took a second round trip through the
        // founder. The parent chain IS the producer's signature — print the distinct
        // chains for this class (capped) and the best attribution, so one paste is
        // enough. Also print the ownership stamps, which is what tells a leak from a
        // legitimate aid.
        const sample = census.rows.filter(r => r.effectivelyVisible && lineworkSignature(r) === sig);
        const chains = [...new Set(sample.map(r => r.parentChain || '(scene root)'))];
        const projects = [...new Set(sample.map(r => r.projectId ?? '(unstamped)'))];
        const views = [...new Set(sample.map(r => r.viewId ?? '(unstamped)'))];
        console.log(`[linework-probe]        producer : ${attributeProducer(sample[0] ?? {
            type: '', name: '', elementType: null, role: null, elementId: null, projectId: null,
            viewId: null, colour: null, depthTest: null, renderOrder: 0, layerMask: -1,
            visible: false, effectivelyVisible: false, parentChain: '',
        })}`);
        console.log(`[linework-probe]        parent   : ${chains.slice(0, 3).join('  ||  ')}${chains.length > 3 ? `  (+${chains.length - 3} more)` : ''}`);
        console.log(`[linework-probe]        projectId: ${projects.join(', ')}   viewId: ${views.join(', ')}`);
    }

    if (_baseline === null) {
        _baseline = census;
        console.log(
            '[linework-probe] BASELINE captured (first 3D entry of this session). ' +
            'Anything that appears in a later diff arrived via a VIEW SWITCH, not project load.',
        );
    } else {
        const delta = diffCensus(_baseline, census);
        if (delta.length === 0) {
            console.log(
                '[linework-probe] ⭐ NO DIFF vs the first 3D entry — every visible line class was ' +
                'present from first paint. Hypothesis (a) "not torn down on view switch" is FALSIFIED.',
            );
        } else {
            console.warn(
                '[linework-probe] ⭐ DIFF vs the first 3D entry — these line classes were NOT present ' +
                'on first paint and arrived via a view switch (hypothesis (a) CONFIRMED for them):',
            );
            for (const d of delta.slice(0, 12)) {
                console.warn(`[linework-probe]   +${d.nowCount - d.baselineCount}  ${d.signature}`);
            }
        }
    }

    console.log(
        '[linework-probe] Run `__pryzmDumpLinework()` for the full per-object table ' +
        '(type · elementType · role · id · projectId · viewId · colour · layers · parent chain).',
    );
    return census;
}

/**
 * Install the probe. Idempotent.
 *
 * Fires on `view-activated { mode: '3D' }` — the exact event the three initScene
 * overlay gates use, so the probe observes the scene in the same state they leave it.
 * Deferred one macrotask so any same-tick gate has already written its visibility.
 */
export function installLineworkProbe(): void {
    if (_installed) return;
    if (typeof window === 'undefined') return;
    _installed = true;

    const w = window as unknown as {
        runtime?: { events?: { on?: (e: string, h: (p: unknown) => void) => void } };
        __pryzmDumpLinework?: () => readonly LineworkRow[];
        __pryzmLineworkCensus?: () => LineworkCensus | null;
    };

    w.runtime?.events?.on?.('view-activated', (payload: unknown) => {
        const mode = (payload as { mode?: string } | null)?.mode;
        if (mode !== '3D') return;
        setTimeout(() => { try { runLineworkProbe('view-activated'); } catch { /* never break a view switch */ } }, 0);
    });

    // Console entry points — the founder pastes the output, nobody guesses.
    w.__pryzmDumpLinework = (): readonly LineworkRow[] => {
        const c = _last ?? runLineworkProbe('manual');
        const rows = (c?.rows ?? []).filter(r => r.effectivelyVisible);
        try { (console as unknown as { table?: (d: unknown) => void }).table?.(rows); } catch { /* ignore */ }
        console.log(`[linework-probe] ${rows.length} EFFECTIVELY VISIBLE of ${c?.total ?? 0} total line object(s).`);
        return rows;
    };
    w.__pryzmLineworkCensus = (): LineworkCensus | null => _last;

    console.log('[linework-probe] §LINEWORK-3D-PROBE installed (L-1225) — censuses 3D linework on every 3D entry.');
}

/**
 * §C13-CANDIDATE-OWNERS (L-8110) — the PROJECT-SWITCH reset, distinct from the
 * test-only one below.
 *
 * It clears the census state and NOT `_installed`. The two resets differ by exactly
 * that one field, and the difference is the whole point: a test needs a virgin module
 * (including an un-subscribed one), while a project switch must leave the subscription
 * alone — a switch that cleared `_installed` would let the next `installLineworkProbe`
 * subscribe a second time and census twice on every 3-D entry. Sharing one reset
 * between the two callers is how that bug gets written.
 */
export function resetLineworkProbeCensus(): void {
    _baseline = null;
    _last = null;
    _entries = 0;
}

/** Test-only reset. Also drops the subscription latch — see the note above. */
export function __resetLineworkProbeForTests(): void {
    resetLineworkProbeCensus();
    _installed = false;
}

// ── §C13-CANDIDATE-OWNERS (L-8110) — project-switch owner ────────────────────
//
// `_baseline` and `_last` are LINEWORK CENSUSES of the open project's 3-D scene. The
// probe's whole output is a COMPARISON against `_baseline`, so a baseline taken in
// project A and compared against project B reports a difference that measures the
// project switch rather than the regression the probe exists to catch — a probe
// answering confidently about the wrong subject ([[probe-can-be-wrong-three-ways]]).
//
// ⛔ `_installed` is DELIBERATELY NOT RESET. It latches the `view-activated`
// subscription, which is app-lifetime, not project state: clearing it would let the
// next install subscribe a SECOND time and census twice per entry. That is the L-224
// failure re-created one layer down, and it is the same carve-out
// `OpenedRegionProposal` records for its own `installed` flag.
projectScopeRegistry.register({
    scopeName: 'diagnostics.lineworkProbe',
    clear: () => { resetLineworkProbeCensus(); },
});
