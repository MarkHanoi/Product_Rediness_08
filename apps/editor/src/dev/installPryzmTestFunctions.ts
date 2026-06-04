// Dev-only in-browser test functions for the Family Platform pipeline +
// apartment validator framework. Exposes a small set of pure L0/L2 helpers
// on window.__pryzm* so a user can test the work from DevTools without
// touching the live AI generation path (which has separate issues — server
// AI relay, envelope iterating, etc).
//
// All functions are read-only; they take POJO JSON input + return POJO
// output. None mutate any store or run any command. Safe to call repeatedly.
//
// Usage from DevTools console:
//   __pryzmFamilyPipeline(rawJson)   // run the Family Generation Pipeline
//   __pryzmValidateLayout(dtgLDto)   // run the apartment-layout validator
//   __pryzmListTestFunctions()       // print the available helpers
//   __pryzmSampleFamilyRequest()     // return a paste-ready sample JSON
//   __pryzmSampleLayoutDto()         // return a paste-ready layout DTO
//
// Architectural rules followed:
//   • Dev-only file (lives under apps/editor/src/dev/).
//   • No `(window as any)` — uses the typed Window augmentation in
//     `apps/editor/src/types/globals.d.ts`.
//   • No side effects at module load — only `installPryzmTestFunctions()`
//     mutates window, and only when called.
//   • No mutations to stores or commands — these are READ-ONLY observers.
//   • Idempotent — calling install twice overwrites the same window names.
//   • Uses existing exports — does NOT inline the pipeline / validator logic.

import { runFamilyPipeline, isPipelineSuccess } from '@pryzm/schemas';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { aiService } from '@pryzm/ai-host';
import {
    installBuildBuildingGraph,
    provideLiveGraphSources,
} from '../engine/buildBuildingGraph';

// The validator + adapter surface is NOT (yet) re-exported from the
// `@pryzm/ai-host` root barrel — its `package.json` `exports` map only lists
// `.`, `./types`, `./tracing`. A static deep import therefore fails to resolve
// under the editor's tsconfig. We hold the deep path in a runtime constant
// (so TS doesn't try to resolve the literal at the call site) and load it
// lazily via Vite's permissive ESM resolution, which finds it through the
// package's legacy `main` field.
//
// If/when `validateAndFormatLayout` is added to the `@pryzm/ai-host` root
// barrel, replace `VALIDATE_AND_FORMAT_MODULE_PATH` + `loadValidateAndFormatLayout`
// with a normal top-level `import { validateAndFormatLayout } from '@pryzm/ai-host';`.
type ValidateAndFormatLayout = (
    dto: unknown,
    opts?: unknown,
) => {
    readonly report: unknown;
    readonly passesLegality: boolean;
    readonly summaryLine: string;
    readonly markdownReport: string;
};

const VALIDATE_AND_FORMAT_MODULE_PATH =
    '@pryzm/ai-host/src/workflows/apartmentLayout/validators/validate-and-format.js';

async function loadValidateAndFormatLayout(): Promise<ValidateAndFormatLayout> {
    // The path is a runtime constant (NOT a literal at the import call-site)
    // so TS doesn't try to resolve it statically — Vite resolves it at
    // runtime via the package's legacy `main` field.
    const mod: unknown = await import(/* @vite-ignore */ VALIDATE_AND_FORMAT_MODULE_PATH);
    const fn = (mod as { validateAndFormatLayout?: ValidateAndFormatLayout })
        .validateAndFormatLayout;
    if (typeof fn !== 'function') {
        throw new Error(
            'validateAndFormatLayout not exported from the resolved module — ' +
            'the deep path may have moved. Check ' +
            '`packages/ai-host/src/workflows/apartmentLayout/validators/`.',
        );
    }
    return fn;
}

// ── Sample fixtures ──────────────────────────────────────────────────────────

const SAMPLE_FAMILY_REQUEST = {
    identity: {
        id: 'family/com.pryzm.dev/sample-desk',
        name: 'Sample Desk',
        version: '1.0.0',
        author: 'PRYZM-Dev',
        license: 'MIT',
    },
    documentation: { pdfs: [], specSheets: [], referenceImages: [] },
    geometry: {
        dimensions: { widthM: 1.5, depthM: 0.75, heightM: 0.72 },
        parametricRanges: [
            { name: 'width', unit: 'm', min: 1.0, max: 2.2, defaultValue: 1.5 },
        ],
        hostedRelationship: { hostKind: 'none' },
    },
    behaviour: { movable: true, hosted: false, mountClass: 'floor' },
    constraints: { excludeWallTypes: [] },
    placement: {
        defaultAnchor: 'wall-longest',
        allowedAnchors: ['wall-longest'],
        excludedWalls: [],
    },
    bim: {
        entityType: 'IfcFurniture',
        predefinedType: 'DESK',
        psets: ['Pset_FurnitureTypeCommon'],
    },
    ai: { semanticNames: ['desk', 'workstation'], synonyms: [], cuesForPrompts: [] },
};

const SAMPLE_LAYOUT_DTO = {
    rooms: [
        { id: 'living',   type: 'living_room',     rect: { w: 5, h: 6 },   externalFrontageM: 5, hasExteriorEdge: true,  glazedAreaM2: 4 },
        { id: 'kitchen',  type: 'kitchen',         rect: { w: 4, h: 3 },   externalFrontageM: 3, hasExteriorEdge: true,  glazedAreaM2: 2 },
        { id: 'master',   type: 'master_bedroom',  rect: { w: 4, h: 4 },   externalFrontageM: 4, hasExteriorEdge: true,  glazedAreaM2: 2 },
        { id: 'bathroom', type: 'bathroom',        rect: { w: 2, h: 2.5 }, externalFrontageM: 0, hasExteriorEdge: false, glazedAreaM2: 0 },
    ],
    edges: [
        { aId: 'living', bId: 'kitchen' },
        { aId: 'living', bId: 'master' },
        { aId: 'master', bId: 'bathroom' },
    ],
    entranceRoomId: 'living',
};

// ── Function implementations ────────────────────────────────────────────────

function pryzmFamilyPipeline(rawJson: unknown, opts?: unknown): unknown {
    try {
        // Cast opts to the runFamilyPipeline options shape; the dev tool
        // accepts `unknown` so the user can paste arbitrary JSON without
        // having to type-cast at the console.
        const result = runFamilyPipeline(rawJson, (opts ?? {}) as Parameters<typeof runFamilyPipeline>[1]);
        if (isPipelineSuccess(result)) {
            console.groupCollapsed('[__pryzmFamilyPipeline] SUCCESS — RegisteredFamily produced');
            console.log('registered:', result.registered);
            console.log('stages:', result.stages);
            console.groupEnd();
        } else {
            console.group('[__pryzmFamilyPipeline] FAILURE — ingestion issues:');
            console.warn(result.message);
            console.table(result.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
            })));
            console.groupEnd();
        }
        return result;
    } catch (err) {
        console.error('[__pryzmFamilyPipeline] threw:', err);
        return { ok: false, error: String(err) };
    }
}

async function pryzmValidateLayout(dto: unknown, opts?: unknown): Promise<unknown> {
    try {
        const validateAndFormatLayout = await loadValidateAndFormatLayout();
        const result = validateAndFormatLayout(dto, opts ?? {});
        console.groupCollapsed(`[__pryzmValidateLayout] ${result.summaryLine}`);
        console.log('report:', result.report);
        console.log('passesLegality:', result.passesLegality);
        console.log('markdownReport:\n' + result.markdownReport);
        console.groupEnd();
        return result;
    } catch (err) {
        console.error('[__pryzmValidateLayout] threw:', err);
        return { ok: false, error: String(err) };
    }
}

function pryzmListTestFunctions(): void {
    const rows: ReadonlyArray<{ cmd: string; desc: string }> = [
        { cmd: '__pryzmFamilyPipeline(rawJson, opts?)', desc: 'Run Family Platform pipeline end-to-end' },
        { cmd: '__pryzmValidateLayout(dto, opts?)',     desc: 'Run apartment validator + format Markdown report' },
        { cmd: '__pryzmSampleFamilyRequest()',          desc: 'Return paste-ready sample FamilyRequest JSON' },
        { cmd: '__pryzmSampleLayoutDto()',              desc: 'Return paste-ready sample apartment-layout DTO' },
        { cmd: '__pryzmListTestFunctions()',            desc: 'Print this help' },
    ];
    console.group('[__pryzm] Dev-only test functions');
    console.table(rows);
    console.log('Quick start: __pryzmFamilyPipeline(__pryzmSampleFamilyRequest())');
    console.log('Quick start: __pryzmValidateLayout(__pryzmSampleLayoutDto())');
    console.groupEnd();
}

function pryzmSampleFamilyRequest(): unknown {
    // Return a deep copy so callers can mutate without affecting the constant.
    return structuredClone(SAMPLE_FAMILY_REQUEST);
}

function pryzmSampleLayoutDto(): unknown {
    return structuredClone(SAMPLE_LAYOUT_DTO);
}

/**
 * Install the dev-only `window.__pryzm*` test helpers. Idempotent — calling
 * twice simply overwrites the same names. Safe to call from any boot path.
 */
export function installPryzmTestFunctions(): void {
    window.__pryzmFamilyPipeline      = pryzmFamilyPipeline;
    window.__pryzmValidateLayout      = pryzmValidateLayout;
    window.__pryzmListTestFunctions   = pryzmListTestFunctions;
    window.__pryzmSampleFamilyRequest = pryzmSampleFamilyRequest;
    window.__pryzmSampleLayoutDto     = pryzmSampleLayoutDto;

    // GRAPH.2-wiring — expose `window.pryzmBuildBuildingGraph()` (read-only UBG
    // projection of the live topology/roomGraph/semantic/dependency/constraint
    // graphs) + emit `pryzm:building-graph-rebuilt` on rebuild, for a future
    // GRAPH.3 overlay. Provide the live semantic + constraint singletons so the
    // resolver can read them (topology + roomGraph come off window directly).
    provideLiveGraphSources({ semantic: semanticGraphManager, constraint: aiService });
    installBuildBuildingGraph();

    console.log('[__pryzm] Dev test functions ready — run __pryzmListTestFunctions() for the menu.');
}
