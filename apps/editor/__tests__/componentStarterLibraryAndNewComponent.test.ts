/**
 * @vitest-environment happy-dom
 */
// componentStarterLibraryAndNewComponent — lane U-SEED (§STARTER-SEED / §NEW-COMPONENT).
//   UIUX-PLAN §U0/§U1/§U3 · ADR-0376 D5 · C111 §3.1 ("THERE IS NO CORPUS") · C84 EI-9 ·
//   [[context-data-honesty-family]] · audit R1.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE FRONT-DOOR GAP, CLOSED. Before this lane the Components browser opened
//     EMPTY with only "Load Component…" and NOTHING to load. This suite proves,
//     through the REAL composed runtime and the REAL panel DOM:
//       (a) the three starter files pack + load through the ONE catalogue and
//           RESOLVE — the Window's GlassWidth computes 1050 at Width 1200 /
//           FrameWidth 75;
//       (b) FALSIFICATION — a corrupted seed REFUSES by name (never a silent
//           empty), and the byte-identical original restores clean;
//       (c) the browser's empty state OFFERS the starter library; loading the
//           Window makes the SAME `component.place` dispatch resolve; and
//       (d) "New Component" mints a minimal valid definition that opens in U3's
//           workspace and accepts a parameter.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ ONE CATALOGUE, ONE RUNTIME (R1 / [[fake-more-capable-than-real]]) ──────
// The runtime is obtained the one way P1 permits — `composeRuntime()` — and the
// catalogue is the SAME `componentCatalog` singleton the handlers read and the
// panel defaults to. The seed bytes come from `server/familySeeds.js`, the SINGLE
// source the production server serves from, so "the three seed files" proven here
// are byte-for-byte the ones a user downloads.

import { describe, expect, it, beforeAll, afterEach, vi } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { resolveParameter } from '@pryzm/family-runtime';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import {
    componentCatalog,
    type CatalogFetch,
} from '../src/services/componentCatalog/index.js';
import { ComponentBrowserPanel } from '../src/ui/component-browser/ComponentBrowserPanel';
import {
    createBlankComponentDefinition,
    openNewComponentWorkspace,
} from '../src/ui/component-browser/newComponent';
// The SINGLE source of the starter definitions — the same module the server
// seeds from (server/familyMarketplaceRoutes.js → familySeeds.js).
import {
    buildStarterFamilyRecords,
    STARTER_COMPONENT_IDS,
} from '../../../server/familySeeds.js';

const AUDIT = { actorId: 'u-seed', projectId: 'u-seed', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let records: Array<{ id: string; semver: string; manifest: any; document: any; ifcMapping: any; schemaHash: string; publishedAt: string; bytes: Uint8Array }>;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    records = [...(await buildStarterFamilyRecords())] as typeof records;
}, BUDGET);

const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}

function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) throw new Error('[test] runtime.stores.component is undefined on the REAL composed runtime');
    return s;
}
function wipeStore(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
}

/** A `fetch` slice serving the seed list + download bytes at the LIVE route's URL
 *  contract — the marketplace leg the panel consumes, driven without a server. */
function makeStarterFetch(recs: typeof records): CatalogFetch {
    const rows = recs.map((r) => ({
        id: r.id,
        name: r.manifest.name,
        semver: r.semver,
        category: r.manifest.category,
        ifcEntity: r.manifest.ifcEntity,
        schemaHash: r.schemaHash,
        publishedAt: r.publishedAt,
        availableSemvers: [r.semver],
    }));
    return async (url: string) => {
        if (url.endsWith('/api/v1/families')) {
            return {
                ok: true, status: 200,
                json: async () => ({ families: rows }),
                arrayBuffer: async () => new ArrayBuffer(0),
            };
        }
        const m = url.match(/\/api\/v1\/families\/([^/]+)\/download/);
        if (m) {
            const id = decodeURIComponent(m[1]);
            const rec = recs.find((r) => r.id === id);
            if (!rec) {
                return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
            }
            const b = rec.bytes;
            return {
                ok: true, status: 200,
                json: async () => ({}),
                arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
            };
        }
        return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    };
}

afterEach(() => {
    document.querySelectorAll('#pryzm-component-browser, [data-cdw-overlay]').forEach((n) => n.remove());
    componentCatalog.clear();
    wipeStore();
});

describe('§STARTER-SEED — the starter library packs, loads through the ONE catalogue, and resolves', () => {

    it('ARM A — ⭐⭐ the three seed files pack + load, and the Window resolves GlassWidth = 1050', async () => {
        expect(records.length).toBe(3);
        componentCatalog.clear();

        for (const rec of records) {
            const res = await componentCatalog.loadFromBytes(rec.bytes, { provenance: 'builtin' });
            expect(res.ok, res.ok ? '' : (res as any).message).toBe(true);
        }
        expect(componentCatalog.size()).toBe(3);

        // ⭐ THE §64 FORMULA, resolved out of the loaded document.
        const win = componentCatalog.entry(STARTER_COMPONENT_IDS.window);
        expect(win, 'the Window loaded').toBeDefined();
        const resolved = resolveParameter({
            parameters: win!.family.document.parameters as any,
            type: null,
            instanceOverrides: {},
        });
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.values.Width).toBe(1200);
        expect(resolved.values.FrameWidth).toBe(75);
        expect(resolved.values.GlassWidth).toBe(1050);
    }, BUDGET);

    it('ARM B — ⭐ FALSIFICATION: a corrupted seed REFUSES by name (never a silent empty); the byte-identical original restores clean', async () => {
        componentCatalog.clear();
        const win = records.find((r) => r.id === STARTER_COMPONENT_IDS.window)!;

        // Break the ZIP local-file header signature (`PK\x03\x04`).
        const corrupt = new Uint8Array(win.bytes);
        corrupt[0] ^= 0xff;
        corrupt[1] ^= 0xff;

        const bad = await componentCatalog.loadFromBytes(corrupt, { provenance: 'builtin' });
        expect(bad.ok, 'a corrupted seed must be REFUSED, not loaded').toBe(false);
        if (bad.ok) return;
        expect(bad.reason).toBe('unpack-failed');
        expect(bad.message).toMatch(/not-a-zip/i);
        // ⭐ The refusal wrote NOTHING — failure and empty stayed different values.
        expect(componentCatalog.has(win.id)).toBe(false);

        // Byte-identical restore loads clean.
        const restored = await componentCatalog.loadFromBytes(win.bytes, { provenance: 'builtin' });
        expect(restored.ok, restored.ok ? '' : (restored as any).message).toBe(true);
        expect(componentCatalog.has(win.id)).toBe(true);
    }, BUDGET);

    it('ARM C — ⭐⭐ the browser empty state OFFERS the starter library; loading the Window makes the SAME place dispatch resolve', async () => {
        componentCatalog.clear();
        wipeStore();

        const panel = new ComponentBrowserPanel({ starterFetch: makeStarterFetch(records) });
        panel.open();

        // The honest empty state renders SYNCHRONOUSLY.
        expect(document.querySelector('[data-component-browser-empty]'), 'the honest empty state').not.toBeNull();
        expect(document.querySelector('[data-component-browser-load]'), 'the file-open leg').not.toBeNull();
        expect(document.querySelector('[data-component-browser-new]'), 'the New Component leg').not.toBeNull();

        // …then the starter library appears (async marketplace browse).
        await vi.waitFor(() => {
            expect(document.querySelectorAll('[data-component-browser-starter]').length).toBe(3);
        }, { timeout: 10_000 });
        // D5 — nowhere in the panel does the user-facing text say "family".
        expect(document.getElementById('pryzm-component-browser')!.textContent).not.toMatch(/family/i);
        // Each offer wears the "Starter" provenance chip.
        expect(document.querySelectorAll('[data-component-browser-starter-provenance="starter"]').length).toBe(3);

        // Load the Window through the marketplace leg.
        const loadBtn = document.querySelector<HTMLButtonElement>(
            `[data-component-browser-starter-load="${STARTER_COMPONENT_IDS.window}"]`,
        );
        expect(loadBtn, 'the Window offer carries a Load button').not.toBeNull();
        loadBtn!.click();

        await vi.waitFor(() => {
            expect(componentCatalog.has(STARTER_COMPONENT_IDS.window)).toBe(true);
        }, { timeout: 10_000 });

        // The definition now renders as a loaded card, provenance 'marketplace'.
        const card = document.querySelector(`[data-component-browser-definition="${STARTER_COMPONENT_IDS.window}"]`);
        expect(card, 'the loaded Window is listed as a definition').not.toBeNull();
        expect(card!.querySelector('[data-component-browser-provenance="marketplace"]')).not.toBeNull();

        // ⭐ PLACE IT — the SAME dispatch the seam test proves, now against a
        // definition that entered through the browser's starter library.
        const winTypeId = records.find((r) => r.id === STARTER_COMPONENT_IDS.window)!.document.types[0].id as string;
        const componentId = `component_${ulidN(7)}`;
        const placed = await rt.bus.executeCommand('component.place', {
            componentId,
            levelId: LEVEL_ID,
            definitionId: STARTER_COMPONENT_IDS.window,
            typeId: winTypeId,
            definitionVersion: '1.0.0',
            origin: { x: 1, y: 0, z: 1 },
            rotation: 0,
        });
        expect(placed, 'the place dispatch resolved').toBeDefined();
        expect(store().getState().get(componentId)?.definitionId).toBe(STARTER_COMPONENT_IDS.window);

        panel.close();
    }, BUDGET);

    it('ARM D — ⭐⭐ "New Component" mints a minimal valid definition that opens in U3\'s workspace and accepts a parameter', async () => {
        componentCatalog.clear();

        // The mint alone — a minimal valid definition enters the ONE catalogue.
        const created = await createBlankComponentDefinition();
        expect(created.ok, created.ok ? '' : (created as any).refusal).toBe(true);
        if (!created.ok) return;
        expect(componentCatalog.has(created.definitionId)).toBe(true);
        const view = componentCatalog.view(created.definitionId)!;
        expect(view.parameters.length, 'the mint added exactly one parameter via the op').toBe(1);
        expect(view.parameters[0]!.name).toBe('Width');

        // The full front-door path: mint + open the workspace.
        const res = await openNewComponentWorkspace();
        expect(res.ok, !res.ok ? (res as any).refusal : '').toBe(true);
        if (!res.ok) return;
        // The workspace mounted its overlay on the definition.
        expect(document.querySelector('[data-cdw-overlay]'), 'U3 workspace opened').not.toBeNull();
        expect(res.document.parameters.length).toBe(1);

        // …and it accepts a parameter through the workspace's own op path.
        const addErr = await res.submitAddParameter({
            name: 'Height', dataType: 'length', kind: 'instance', defaultRaw: '2000',
        });
        expect(addErr, addErr ?? 'add parameter succeeded').toBeNull();
        expect(res.document.parameters.length, 'the workspace draft now carries two parameters').toBe(2);

        res.close();
    }, BUDGET);
});
