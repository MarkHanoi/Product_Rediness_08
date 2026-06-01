/**
 * pdfExportTestModal.ts — C29 PDF-α-2 dev-only modal that calls the
 * pure `buildSheetFromRooms` helper to compose a sheet, hands the result
 * to `sheetToPdfBytes` (from @pryzm/pdf-export), and offers the resulting
 * vector PDF as a browser Blob download.
 *
 * CONTRACT: docs/02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md.
 *
 * Strict scope:
 *   • Uses the canonical L4 entry `sheetToPdfBytes` and the L2 composer
 *     `buildSheetFromRooms` — does NOT inline sheet or PDF logic.
 *   • Native `<dialog>` element + vanilla DOM. No framework imports.
 *   • Styles live in `../styles/panels/pdfExportTestModal.ts` and are
 *     injected through AppTheme — no per-modal <style> tag.
 *   • Read-only test surface — does NOT mutate stores, commands, runtime.
 *   • No `(window as any)`; the runtime is accessed defensively through
 *     `unknown`/`Record<string, unknown>` casts (P4-compliant).
 *   • L7 file (apps/editor). No `import * as THREE`,
 *     no `requestAnimationFrame`.
 *
 * Sibling pattern reference: sheetGeneratorTestModal.ts (`sgtm-*`).
 *
 * Class prefix: `pdftm-` (PDF Test Modal).
 */

import {
    buildSheetFromRooms,
    type PaperSizeName,
    type RoomForSheet,
} from '@pryzm/drawing-primitives';
import { sheetToPdfBytes } from '@pryzm/pdf-export';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Loose structural runtime shape probed by the modal. Every field is
 * optional — the modal degrades to a hard-coded demo room set when no
 * usable room data is found.
 */
export interface RuntimeLike {
    readonly roomStore?: unknown;
    readonly projectContext?: { readonly projectName?: string };
    readonly user?: { readonly name?: string };
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
    return probes[0] !== undefined && Array.isArray(probes[0])
        ? (probes[0] as ReadonlyArray<unknown>)
        : [];
}

/**
 * Project a single room-like value into a {@link RoomForSheet}. Tries the
 * canonical PRYZM shape (`room.boundary.polygon` — `{x, z}` in METRES) plus
 * several common fallbacks. PRYZM rooms store coordinates in METRES with
 * the plan `y` axis named `z`; we multiply by 1000 to convert to mm.
 */
function roomToRoomForSheet(raw: unknown, idx: number): RoomForSheet | null {
    if (raw === null || raw === undefined || typeof raw !== 'object') return null;
    const room = raw as Record<string, unknown>;

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
            const yRaw = rec['z'] ?? rec['y'];
            if (typeof xRaw !== 'number' || typeof yRaw !== 'number') { ok = false; break; }
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
 * Hard-coded demo room set — used when the runtime has no rooms. Mirrors
 * the sibling sheetGeneratorTestModal demo set so the two modals render the
 * same plan when fired with no project loaded.
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

/** Format bytes as "27.5 KB" (or "1.2 MB" for >= 1 MiB). */
function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '? B';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Public entry ────────────────────────────────────────────────────────────

/**
 * Open the PDF Export dev modal.
 *
 * @param runtime  Optional explicit runtime override (used by tests). When
 *                 omitted the modal probes `window.runtime` for a room store.
 */
export function openPdfExportTestModal(runtime?: RuntimeLike): void {
    const resolvedRuntime: RuntimeLike =
        runtime
        ?? ((typeof window !== 'undefined' ? (window as unknown as { runtime?: unknown }).runtime : undefined) as RuntimeLike | undefined)
        ?? {};

    // ── <dialog> shell ──────────────────────────────────────────────────────
    const dialog = document.createElement('dialog');
    dialog.className = 'pdftm-dialog';

    const body = document.createElement('div');
    body.className = 'pdftm-body';
    dialog.appendChild(body);

    // Header
    const header = document.createElement('div');
    header.className = 'pdftm-header';
    const title = document.createElement('h2');
    title.className = 'pdftm-title';
    title.textContent = 'C29 PDF Export — Generate PDF (dev)';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pdftm-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => dialog.close());
    header.appendChild(title);
    header.appendChild(closeBtn);
    body.appendChild(header);

    // ── Content ─────────────────────────────────────────────────────────────
    const content = document.createElement('div');
    content.className = 'pdftm-content';
    body.appendChild(content);

    // Form row: paper + orientation + project name.
    const formRow = document.createElement('div');
    formRow.className = 'pdftm-form-row';

    const paperField = document.createElement('div');
    paperField.className = 'pdftm-field';
    const paperLabel = document.createElement('label');
    paperLabel.className = 'pdftm-field-label';
    paperLabel.textContent = 'Paper';
    const paperSelect = document.createElement('select');
    paperSelect.className = 'pdftm-select';
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

    const orientField = document.createElement('div');
    orientField.className = 'pdftm-field';
    const orientLabel = document.createElement('label');
    orientLabel.className = 'pdftm-field-label';
    orientLabel.textContent = 'Orientation';
    const orientSelect = document.createElement('select');
    orientSelect.className = 'pdftm-select';
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

    // Project name input.
    const projField = document.createElement('div');
    projField.className = 'pdftm-field pdftm-field--grow';
    const projLabel = document.createElement('label');
    projLabel.className = 'pdftm-field-label';
    projLabel.textContent = 'Project name';
    const projInput = document.createElement('input');
    projInput.type = 'text';
    projInput.className = 'pdftm-input';
    projInput.placeholder = 'Demo Project';
    const initialProj = (resolvedRuntime.projectContext?.projectName ?? '').trim();
    projInput.value = initialProj.length > 0 ? initialProj : 'Demo Project';
    projField.appendChild(projLabel);
    projField.appendChild(projInput);
    formRow.appendChild(projField);

    content.appendChild(formRow);

    // Status + Generate row.
    const statusRow = document.createElement('div');
    statusRow.className = 'pdftm-status-row';

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'pdftm-btn';
    generateBtn.textContent = 'Generate PDF';
    statusRow.appendChild(generateBtn);

    const status = document.createElement('div');
    status.className = 'pdftm-status';
    status.textContent = 'Idle';
    statusRow.appendChild(status);

    content.appendChild(statusRow);

    // ── Generate-state captured across clicks ───────────────────────────────
    let lastBytes: Uint8Array | null = null;
    let pendingUrl: string | null = null;
    const sheetNumber = 'A-101';
    const downloadFilename = `${sheetNumber}.pdf`;

    let downloadBtn: HTMLButtonElement;

    /** Set status text + style. */
    const setStatus = (text: string, kind: 'idle' | 'busy' | 'ok' | 'err' = 'idle'): void => {
        status.textContent = text;
        status.classList.remove('pdftm-status--ok', 'pdftm-status--err', 'pdftm-status--busy');
        if (kind === 'busy') status.classList.add('pdftm-status--busy');
        else if (kind === 'ok') status.classList.add('pdftm-status--ok');
        else if (kind === 'err') status.classList.add('pdftm-status--err');
    };

    /** Build + emit the PDF bytes. */
    const generate = async (): Promise<void> => {
        if (generateBtn.disabled) return;
        const paperName = (paperSelect.value as PaperSizeName);
        const orientation = (orientSelect.value as 'portrait' | 'landscape');
        const projectName = projInput.value.trim().length > 0
            ? projInput.value.trim()
            : 'Demo Project';
        const author = (resolvedRuntime.user?.name ?? 'PRYZM Dev').trim() || 'PRYZM Dev';

        // Project rooms → RoomForSheet[]. Fall back to demo on empty.
        const raw = probeRooms(resolvedRuntime);
        const projected: RoomForSheet[] = [];
        for (let i = 0; i < raw.length; i++) {
            const r = roomToRoomForSheet(raw[i], i);
            if (r !== null) projected.push(r);
        }
        const usingDemo = projected.length === 0;
        const rooms: ReadonlyArray<RoomForSheet> = usingDemo ? demoRooms() : projected;

        // Lock UI during the async generation.
        generateBtn.disabled = true;
        if (downloadBtn !== undefined) downloadBtn.disabled = true;
        lastBytes = null;
        setStatus('Generating...', 'busy');

        try {
            const { sheet, contentByViewportId } = buildSheetFromRooms(rooms, {
                paperName,
                orientation,
                projectName,
                sheetNumber,
                sheetName: 'GA Floor Plan',
                author,
            });

            const bytes = await sheetToPdfBytes(sheet, contentByViewportId, {
                title: projectName,
                author,
                subject: 'GA Floor Plan',
            });

            lastBytes = bytes;
            const where = usingDemo ? 'demo set' : `${projected.length} project room(s)`;
            setStatus(`Done - ${formatBytes(bytes.length)} from ${escHtml(where)}.`, 'ok');
            if (downloadBtn !== undefined) downloadBtn.disabled = false;
        } catch (err) {
            const msg = String((err as Error).message ?? err);
            setStatus(`Generation failed: ${msg}`, 'err');
            lastBytes = null;
            if (downloadBtn !== undefined) downloadBtn.disabled = true;
        } finally {
            generateBtn.disabled = false;
        }
    };

    generateBtn.addEventListener('click', () => { void generate(); });

    // ── Footer ──────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'pdftm-footer';

    downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'pdftm-btn pdftm-btn--secondary';
    downloadBtn.textContent = 'Download';
    downloadBtn.disabled = true;
    downloadBtn.addEventListener('click', () => {
        if (lastBytes === null) return;
        try {
            // Copy into a fresh ArrayBuffer so the Blob has a tight, owned
            // backing buffer regardless of Uint8Array view semantics.
            const copy = new Uint8Array(lastBytes.byteLength);
            copy.set(lastBytes);
            const blob = new Blob([copy.buffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            pendingUrl = url;
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Defer revoke so Safari/Firefox still complete the download.
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch { /* ignore */ }
                if (pendingUrl === url) pendingUrl = null;
            }, 1000);
        } catch (err) {
            const msg = String((err as Error).message ?? err);
            setStatus(`Download failed: ${msg}`, 'err');
        }
    });
    footer.appendChild(downloadBtn);

    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.type = 'button';
    closeFooterBtn.className = 'pdftm-btn pdftm-btn--secondary';
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.addEventListener('click', () => dialog.close());
    footer.appendChild(closeFooterBtn);

    content.appendChild(footer);

    // ── Cleanup ─────────────────────────────────────────────────────────────
    dialog.addEventListener('close', () => {
        // Revoke any pending blob URL + drop the byte buffer.
        if (pendingUrl !== null) {
            try { URL.revokeObjectURL(pendingUrl); } catch { /* ignore */ }
            pendingUrl = null;
        }
        lastBytes = null;
        dialog.remove();
    });
    dialog.addEventListener('click', (ev) => {
        if (ev.target === dialog) dialog.close();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
}
