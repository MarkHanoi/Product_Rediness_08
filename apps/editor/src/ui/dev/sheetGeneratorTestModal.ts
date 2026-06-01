/**
 * sheetGeneratorTestModal.ts — C24 SHT-α-5 dev-only modal that calls the
 * pure `buildSheetFromRooms` helper, pipes the result through
 * `sheetToSvgWithContent`, and renders the result inline as an `<svg>` so
 * a user can preview a generated sheet without DevTools.
 *
 * CONTRACT: docs/02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md.
 *
 * Strict scope:
 *   • Uses the canonical L2 helpers from `@pryzm/drawing-primitives` — does
 *     NOT inline sheet composition logic.
 *   • Native `<dialog>` element + vanilla DOM. No framework imports.
 *   • Styles live in `../styles/panels/sheetGeneratorTestModal.ts` and are
 *     injected through AppTheme — no per-modal <style> tag.
 *   • Read-only test surface — does NOT mutate stores, commands, runtime.
 *   • No `(window as any)`; the runtime is accessed defensively through
 *     `unknown`/`Record<string, unknown>` casts (P4-compliant).
 *   • L7 file (apps/editor). No `import * as THREE`,
 *     no `requestAnimationFrame`.
 *
 * Sibling pattern reference: modelTreeTestModal.ts (`mttm-*`).
 *
 * Class prefix: `sgtm-` (Sheet Generator Test Modal).
 */

import {
    buildSheetFromRooms,
    sheetToSvgWithContent,
    type PaperSizeName,
    type RoomForSheet,
} from '@pryzm/drawing-primitives';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Loose structural runtime shape probed by the modal. Every field is
 * optional — the modal degrades to a hard-coded demo room set when no
 * usable room data is found.
 */
export interface RuntimeLike {
    readonly roomStore?: unknown;
    readonly projectContext?: { readonly projectName?: string };
}

/** Allowed paper-size names exposed by the picker. */
const PAPER_CHOICES: ReadonlyArray<PaperSizeName> = ['A0', 'A1', 'A2', 'A3', 'A4'];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Defensive HTML-escape for any user-supplied string interpolated into
 *  template-literal HTML. Mirrors the sibling-modal pattern. */
function escHtml(v: unknown): string {
    const div = document.createElement('div');
    div.textContent = String(v ?? '');
    return div.innerHTML;
}

/**
 * Read a dotted path off an unknown host. Returns `undefined` on any
 * throw or missing segment — never throws.
 */
function readPath(host: unknown, path: ReadonlyArray<string>): unknown {
    try {
        let cur: unknown = host;
        for (const key of path) {
            if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
            cur = (cur as Record<string, unknown>)[key];
        }
        return cur;
    } catch {
        return undefined;
    }
}

/**
 * Probe a runtime for a room collection. Tries `runtime.roomStore.getAll()`,
 * `runtime.roomStore.list()`, then the raw `runtime.roomStore.rooms` array,
 * and finally falls back to `window.runtime.roomStore.*`. Returns an empty
 * array when nothing usable is found.
 */
function probeRooms(runtime: RuntimeLike | null | undefined): ReadonlyArray<unknown> {
    const probes: Array<unknown> = [];
    const candidates: Array<unknown> = [
        readPath(runtime, ['roomStore']),
        readPath(typeof window !== 'undefined' ? (window as unknown) : null, ['runtime', 'roomStore']),
        readPath(typeof window !== 'undefined' ? (window as unknown) : null, ['roomStore']),
    ];
    for (const store of candidates) {
        if (store === null || store === undefined || typeof store !== 'object') continue;
        const rec = store as Record<string, unknown>;
        // getAll()
        try {
            const fn = rec['getAll'];
            if (typeof fn === 'function') {
                const out = (fn as () => unknown).call(store);
                if (Array.isArray(out) && out.length > 0) return out;
                if (Array.isArray(out)) probes.push(out);
            }
        } catch { /* ignore */ }
        // list()
        try {
            const fn = rec['list'];
            if (typeof fn === 'function') {
                const out = (fn as () => unknown).call(store);
                if (Array.isArray(out) && out.length > 0) return out;
                if (Array.isArray(out)) probes.push(out);
            }
        } catch { /* ignore */ }
        // .rooms
        const direct = rec['rooms'];
        if (Array.isArray(direct) && direct.length > 0) return direct;
        if (Array.isArray(direct)) probes.push(direct);
    }
    // Nothing populated — return the first empty array if we saw one
    // (signals "store exists but no rooms"), otherwise an empty list.
    return probes[0] !== undefined && Array.isArray(probes[0])
        ? (probes[0] as ReadonlyArray<unknown>)
        : [];
}

/**
 * Project a single room-like value into a {@link RoomForSheet}. Tries the
 * canonical PRYZM shape (`room.boundary.polygon` — `{x, z}` in METRES) plus
 * several common fallbacks (`polygon`, `points`, `boundary` as a raw
 * polygon array). Returns `null` when no usable polygon shape is found.
 *
 * The PRYZM room store stores polygon coordinates in METRES with the plan
 * `y` axis named `z`; we multiply by 1000 to convert to millimetres (the
 * sheet helper's required unit).
 */
function roomToRoomForSheet(raw: unknown, idx: number): RoomForSheet | null {
    if (raw === null || raw === undefined || typeof raw !== 'object') return null;
    const room = raw as Record<string, unknown>;

    // Resolve a polygon — try each shape in turn.
    const candidates: Array<unknown> = [
        readPath(room, ['boundary', 'polygon']),
        room['polygon'],
        room['points'],
        room['boundary'],
    ];

    let polygon: ReadonlyArray<{ x: number; y: number }> | null = null;
    for (const cand of candidates) {
        if (!Array.isArray(cand)) continue;
        const pts: Array<{ x: number; y: number }> = [];
        let ok = true;
        for (const v of cand) {
            if (v === null || v === undefined || typeof v !== 'object') { ok = false; break; }
            const rec = v as Record<string, unknown>;
            const xRaw = rec['x'];
            // Prefer canonical `z` (PRYZM rooms), fall back to `y` (other shapes).
            const yRaw = rec['z'] ?? rec['y'];
            if (typeof xRaw !== 'number' || typeof yRaw !== 'number') { ok = false; break; }
            // METRES → MILLIMETRES.
            pts.push({ x: xRaw * 1000, y: yRaw * 1000 });
        }
        if (ok && pts.length >= 3) { polygon = pts; break; }
    }
    if (polygon === null) return null;

    const id = typeof room['id'] === 'string' ? (room['id'] as string) : `room-${idx}`;
    const name = typeof room['name'] === 'string' && (room['name'] as string).length > 0
        ? (room['name'] as string)
        : (typeof room['occupancyType'] === 'string' && (room['occupancyType'] as string).length > 0
            ? (room['occupancyType'] as string)
            : undefined);

    const out: RoomForSheet = name !== undefined
        ? { id, name, points: polygon }
        : { id, points: polygon };
    return out;
}

/**
 * Hard-coded demo room set — used when the runtime has no rooms (e.g. a
 * fresh project, or the modal is opened before any apartment is generated).
 * Three rectangles + one L-shape, sized so they comfortably fit at 1:100 on
 * A3 landscape. Coordinates are in MILLIMETRES already (no conversion).
 */
function demoRooms(): RoomForSheet[] {
    return [
        {
            id: 'demo-living',
            name: 'Living',
            fill: '#fde68a',
            points: [
                { x: 0, y: 0 },
                { x: 5000, y: 0 },
                { x: 5000, y: 4000 },
                { x: 0, y: 4000 },
            ],
        },
        {
            id: 'demo-kitchen',
            name: 'Kitchen',
            fill: '#bbf7d0',
            points: [
                { x: 5000, y: 0 },
                { x: 8000, y: 0 },
                { x: 8000, y: 3000 },
                { x: 5000, y: 3000 },
            ],
        },
        {
            id: 'demo-bedroom',
            name: 'Bedroom',
            fill: '#bfdbfe',
            points: [
                { x: 0, y: 4000 },
                { x: 4000, y: 4000 },
                { x: 4000, y: 7500 },
                { x: 0, y: 7500 },
            ],
        },
        {
            id: 'demo-bath-L',
            name: 'Bathroom',
            fill: '#e9d5ff',
            points: [
                { x: 4000, y: 4000 },
                { x: 6500, y: 4000 },
                { x: 6500, y: 5500 },
                { x: 8000, y: 5500 },
                { x: 8000, y: 7500 },
                { x: 4000, y: 7500 },
            ],
        },
    ];
}

/** Trigger a Blob download for a string payload. Pure DOM, no I/O. */
function downloadSvgString(svg: string, filename: string): void {
    try {
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Defer revoke so Safari/Firefox still complete the download.
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 1000);
    } catch (err) {
        console.warn('[sheetGeneratorTestModal] downloadSvgString failed:', err);
    }
}

// ── Public entry ────────────────────────────────────────────────────────────

/**
 * Open the Sheet Generator dev modal.
 *
 * @param runtime  Optional explicit runtime override (used by tests). When
 *                 omitted the modal probes `window.runtime` for a room store.
 */
export function openSheetGeneratorTestModal(runtime?: RuntimeLike): void {
    // Resolve the runtime through the typed window slot when the caller did
    // not supply one explicitly. The cast to RuntimeLike is safe because
    // RuntimeLike is a STRUCTURAL superset (every field optional).
    const resolvedRuntime: RuntimeLike =
        runtime
        ?? ((typeof window !== 'undefined' ? (window as unknown as { runtime?: unknown }).runtime : undefined) as RuntimeLike | undefined)
        ?? {};

    // ── <dialog> shell ──────────────────────────────────────────────────────
    const dialog = document.createElement('dialog');
    dialog.className = 'sgtm-dialog';

    const body = document.createElement('div');
    body.className = 'sgtm-body';
    dialog.appendChild(body);

    // Header
    const header = document.createElement('div');
    header.className = 'sgtm-header';
    const title = document.createElement('h2');
    title.className = 'sgtm-title';
    title.textContent = 'C24 Sheets — Test Sheet Generator (dev)';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sgtm-close';
    closeBtn.textContent = '×'; // ×
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => dialog.close());
    header.appendChild(title);
    header.appendChild(closeBtn);
    body.appendChild(header);

    // ── Content ─────────────────────────────────────────────────────────────
    const content = document.createElement('div');
    content.className = 'sgtm-content';
    body.appendChild(content);

    // Form row: paper + orientation + Generate + status.
    const formRow = document.createElement('div');
    formRow.className = 'sgtm-form-row';

    // Paper selector.
    const paperField = document.createElement('div');
    paperField.className = 'sgtm-field';
    const paperLabel = document.createElement('label');
    paperLabel.className = 'sgtm-field-label';
    paperLabel.textContent = 'Paper';
    const paperSelect = document.createElement('select');
    paperSelect.className = 'sgtm-select';
    for (const name of PAPER_CHOICES) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        paperSelect.appendChild(opt);
    }
    paperSelect.value = 'A3';
    paperField.appendChild(paperLabel);
    paperField.appendChild(paperSelect);
    formRow.appendChild(paperField);

    // Orientation selector.
    const orientField = document.createElement('div');
    orientField.className = 'sgtm-field';
    const orientLabel = document.createElement('label');
    orientLabel.className = 'sgtm-field-label';
    orientLabel.textContent = 'Orientation';
    const orientSelect = document.createElement('select');
    orientSelect.className = 'sgtm-select';
    for (const o of ['landscape', 'portrait'] as const) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        orientSelect.appendChild(opt);
    }
    orientSelect.value = 'landscape';
    orientField.appendChild(orientLabel);
    orientField.appendChild(orientSelect);
    formRow.appendChild(orientField);

    // Generate button.
    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'sgtm-btn';
    generateBtn.textContent = 'Generate';
    formRow.appendChild(generateBtn);

    // Status line.
    const status = document.createElement('div');
    status.className = 'sgtm-status';
    status.textContent = 'Pick a paper size and click Generate.';
    formRow.appendChild(status);

    content.appendChild(formRow);

    // SVG host.
    const svgHost = document.createElement('div');
    svgHost.className = 'sgtm-svg-host';
    const placeholder = document.createElement('div');
    placeholder.className = 'sgtm-svg-host-empty';
    placeholder.textContent = 'Click Generate to render a sheet.';
    svgHost.appendChild(placeholder);
    content.appendChild(svgHost);

    // ── Generate-state captured across clicks ───────────────────────────────
    let lastSvg: string | null = null;
    const lastSheetNumber = 'A-101';

    // Footer's Download button is created BELOW the generate() closure but
    // its `disabled` flag is toggled from inside the closure — declare the
    // slot up-front so the closure has a stable reference.
    let downloadBtn: HTMLButtonElement;

    /** Run the helper + composer, render the result inline. */
    const generate = (): void => {
        const paperName = (paperSelect.value as PaperSizeName);
        const orientation = (orientSelect.value as 'portrait' | 'landscape');

        // Probe + project rooms.
        const raw = probeRooms(resolvedRuntime);
        const projected: RoomForSheet[] = [];
        for (let i = 0; i < raw.length; i++) {
            const r = roomToRoomForSheet(raw[i], i);
            if (r !== null) projected.push(r);
        }
        const usingDemo = projected.length === 0;
        const rooms: ReadonlyArray<RoomForSheet> = usingDemo ? demoRooms() : projected;

        const projectName = (resolvedRuntime.projectContext?.projectName ?? '') !== ''
            ? (resolvedRuntime.projectContext!.projectName as string)
            : 'Demo Project';

        try {
            const { sheet, contentByViewportId } = buildSheetFromRooms(rooms, {
                paperName,
                orientation,
                projectName,
                sheetNumber: lastSheetNumber,
                sheetName: 'GA Floor Plan',
            });
            const svg = sheetToSvgWithContent(sheet, contentByViewportId);
            lastSvg = svg;
            svgHost.innerHTML = svg;
            const scale = sheet.titleBlock.scale ?? '?';
            const where = usingDemo ? 'demo set' : `${projected.length} project room(s)`;
            status.textContent = `Rendered ${rooms.length} room(s) from ${escHtml(where)} at scale ${escHtml(scale)}.`;
            if (downloadBtn !== undefined) downloadBtn.disabled = false;
        } catch (err) {
            const msg = String((err as Error).message ?? err);
            svgHost.innerHTML = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'sgtm-svg-host-empty';
            errDiv.textContent = `Generation failed: ${msg}`;
            svgHost.appendChild(errDiv);
            status.textContent = 'Generation failed — see the canvas below.';
            lastSvg = null;
            if (downloadBtn !== undefined) downloadBtn.disabled = true;
        }
    };

    generateBtn.addEventListener('click', generate);

    // ── Footer ──────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'sgtm-footer';

    downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'sgtm-btn sgtm-btn--secondary';
    downloadBtn.textContent = 'Download SVG';
    downloadBtn.disabled = true;
    downloadBtn.addEventListener('click', () => {
        if (lastSvg === null) return;
        downloadSvgString(lastSvg, `${lastSheetNumber}.svg`);
    });
    footer.appendChild(downloadBtn);

    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.type = 'button';
    closeFooterBtn.className = 'sgtm-btn sgtm-btn--secondary';
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.addEventListener('click', () => dialog.close());
    footer.appendChild(closeFooterBtn);

    content.appendChild(footer);

    // ── Cleanup ─────────────────────────────────────────────────────────────
    dialog.addEventListener('close', () => {
        dialog.remove();
    });
    dialog.addEventListener('click', (ev) => {
        if (ev.target === dialog) dialog.close();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
}
