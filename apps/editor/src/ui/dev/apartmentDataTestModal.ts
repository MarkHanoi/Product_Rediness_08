/**
 * apartmentDataTestModal.ts — BIM 2/3 D-α-4 dev-only modal that surfaces the
 * `ApartmentParametersStore` + `RoomParametersStore` as a read-only browser
 * + inspector so a user can audit the live L0 records without DevTools.
 *
 * CONTRACT: APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md
 *           §6 (Panel A — Apartment Data, read-only first slice).
 *           APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md
 *           §Z.−0a row D-α-4.
 *
 * Strict scope:
 *   • READ-ONLY. Every field is text — no inputs, no patch dispatch. The
 *     live-edit slice is D-α-5 (next sprint).
 *   • Probes the runtime defensively (same pattern as `modelTreeTestModal`
 *     and `sheetGeneratorTestModal`): the modal degrades to a small demo
 *     record set when no apartments are populated so it always shows
 *     something a user can click around.
 *   • Native `<dialog>` element + vanilla DOM. No framework imports.
 *   • Styles live in `../styles/panels/apartmentDataTestModal.ts` and are
 *     injected through AppTheme — no per-modal <style> tag.
 *   • No `(window as any)`; the runtime is read through the typed
 *     `window.runtime` slot declared in `apps/editor/src/types/globals.d.ts`.
 *   • L7 file (apps/editor). No `import * as THREE`, no
 *     `requestAnimationFrame`.
 *
 * Sibling pattern references:
 *   • modelTreeTestModal.ts (`mttm-*`)
 *   • sheetGeneratorTestModal.ts (`sgtm-*`)
 *
 * Class prefix: `adtm-` (Apartment Data Test Modal).
 */

import type {
    ApartmentParameters,
    RoomParameters,
} from '@pryzm/schemas/apartment';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Loose structural shape probed by the modal. Every field is optional — the
 * modal degrades to a hard-coded demo record set when no usable store is
 * found. Keeping this as a structural superset (no concrete class import)
 * means tests can pass any object with the right method shape.
 */
export interface ApartmentDataRuntimeLike {
    readonly apartmentParametersStore?: unknown;
    readonly roomParametersStore?: unknown;
}

/** Result of probing the runtime for a usable store pair. */
interface ProbedStores {
    readonly apartmentStore: unknown | null;
    readonly roomStore: unknown | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Defensive HTML-escape for any user-supplied string interpolated into
 *  template-literal HTML. The modal uses `.textContent` for cell values so
 *  escaping is belt-and-braces; we keep the helper here so every dev modal
 *  in this folder has the same shape. */
function escHtml(v: unknown): string {
    const div = document.createElement('div');
    div.textContent = String(v ?? '');
    return div.innerHTML;
}

/** Read a dotted path off an unknown host. Returns `undefined` on any
 *  throw or missing segment — never throws. */
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

/** Truncate the middle of a long id for display, keeping the head + tail
 *  visible. Anything ≤ 18 chars is returned unchanged. */
function truncateId(id: string): string {
    if (id.length <= 18) return id;
    return id.slice(0, 8) + '…' + id.slice(-6);
}

/** Format a metres value as `1.23 m` (2 dp) — `—` for non-numbers. */
function fmtMeters(v: unknown): string {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    return `${v.toFixed(2)} m`;
}

/** Format an area value as `12.3 m²` (1 dp) — `—` for non-numbers. */
function fmtArea(v: unknown): string {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    return `${v.toFixed(1)} m²`;
}

/** Format an arbitrary value for the key/value table — primitives go through
 *  String(); objects pretty-print one-line JSON (truncated). */
function fmtValue(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—';
    if (typeof v === 'string') return v.length === 0 ? '—' : v;
    try {
        const s = JSON.stringify(v);
        return s.length > 120 ? s.slice(0, 117) + '…' : s;
    } catch {
        return '[unserialisable]';
    }
}

// ── Runtime store probing ───────────────────────────────────────────────────

/**
 * Probe a runtime for the ApartmentParametersStore + RoomParametersStore
 * singletons. Tries the supplied runtime first, then `window.runtime.*`,
 * then bare `window.*`. Returns `null` for each slot when nothing usable
 * is found — the modal renders an empty-state banner in that case.
 */
function probeStores(runtime: ApartmentDataRuntimeLike | null | undefined): ProbedStores {
    const aptCandidates: Array<unknown> = [
        readPath(runtime, ['apartmentParametersStore']),
        readPath(typeof window !== 'undefined' ? (window as unknown) : null, ['runtime', 'apartmentParametersStore']),
        readPath(typeof window !== 'undefined' ? (window as unknown) : null, ['apartmentParametersStore']),
    ];
    const roomCandidates: Array<unknown> = [
        readPath(runtime, ['roomParametersStore']),
        readPath(typeof window !== 'undefined' ? (window as unknown) : null, ['runtime', 'roomParametersStore']),
        readPath(typeof window !== 'undefined' ? (window as unknown) : null, ['roomParametersStore']),
    ];
    return {
        apartmentStore: aptCandidates.find(s => s !== null && s !== undefined && typeof s === 'object') ?? null,
        roomStore: roomCandidates.find(s => s !== null && s !== undefined && typeof s === 'object') ?? null,
    };
}

/**
 * Pull every apartment record from a probed store. Tries `list()` first
 * (the canonical ApartmentParametersStore method), then `getAll()` for
 * generic stores. Returns `[]` on any failure — never throws.
 */
function listApartments(store: unknown): ReadonlyArray<unknown> {
    if (store === null || typeof store !== 'object') return [];
    const rec = store as Record<string, unknown>;
    for (const m of ['list', 'getAll']) {
        try {
            const fn = rec[m];
            if (typeof fn === 'function') {
                const out = (fn as () => unknown).call(store);
                if (Array.isArray(out)) return out;
            }
        } catch { /* fall through */ }
    }
    // Generic Store<T> exposes `state: Map<K, V>` — last resort probe.
    try {
        const st = rec['state'];
        if (st !== null && st !== undefined && typeof st === 'object') {
            const values = (st as { values?: () => Iterable<unknown> }).values;
            if (typeof values === 'function') return [...(values.call(st) as Iterable<unknown>)];
        }
    } catch { /* ignore */ }
    return [];
}

/**
 * Pull every room belonging to one apartment id. Tries the canonical
 * `forApartment(id)` method, then filters `list()` / `getAll()` by
 * `apartmentId`. Returns `[]` on any failure.
 */
function listRoomsForApartment(store: unknown, apartmentId: string): ReadonlyArray<unknown> {
    if (store === null || typeof store !== 'object') return [];
    const rec = store as Record<string, unknown>;
    // Canonical method
    try {
        const fn = rec['forApartment'];
        if (typeof fn === 'function') {
            const out = (fn as (id: string) => unknown).call(store, apartmentId);
            if (Array.isArray(out)) return out;
        }
    } catch { /* fall through */ }
    // Filter list() / getAll()
    for (const m of ['list', 'getAll']) {
        try {
            const fn = rec[m];
            if (typeof fn === 'function') {
                const out = (fn as () => unknown).call(store);
                if (Array.isArray(out)) {
                    return out.filter(r => {
                        if (r === null || r === undefined || typeof r !== 'object') return false;
                        return (r as Record<string, unknown>)['apartmentId'] === apartmentId;
                    });
                }
            }
        } catch { /* fall through */ }
    }
    return [];
}

// ── Demo fallback records ───────────────────────────────────────────────────

/** Hard-coded demo apartment + rooms — used when no real store data is
 *  available. Lets the modal always render something a user can click. */
function demoApartments(): ApartmentParameters[] {
    return [
        {
            id: 'demo-apt-A',
            shellAreaM2: { value: 82.5, min: 60, max: 120 },
            bedrooms: 2,
            bathrooms: 1,
            masterEnSuite: true,
            openPlanKitchenDining: true,
            livingRoom: true,
            entranceHall: true,
            typology: 'open-plan-mid-rise',
        },
        {
            id: 'demo-apt-B',
            shellAreaM2: { value: 36.0, min: 25, max: 50 },
            bedrooms: 0,
            bathrooms: 1,
            masterEnSuite: false,
            openPlanKitchenDining: true,
            livingRoom: false,
            entranceHall: false,
            typology: 'compact-studio',
        },
    ];
}

function demoRoomsFor(apartmentId: string): RoomParameters[] {
    if (apartmentId === 'demo-apt-A') {
        return [
            {
                id: 'demo-room-A-living',
                apartmentId: 'demo-apt-A',
                type: 'living',
                name: 'Living',
                areaM2: { value: 24.0, min: 14, max: 40 },
                widthM: { value: 4.0, min: 3, max: 6 },
                depthM: { value: 6.0, min: 3, max: 8 },
                daylightRequired: true,
                privacyTier: 1,
            },
            {
                id: 'demo-room-A-master',
                apartmentId: 'demo-apt-A',
                type: 'master',
                name: 'Master Bedroom',
                areaM2: { value: 14.0, min: 12, max: 20 },
                widthM: { value: 3.5, min: 3, max: 5 },
                depthM: { value: 4.0, min: 3, max: 5 },
                daylightRequired: true,
                privacyTier: 4,
                acousticIsolation: true,
            },
            {
                id: 'demo-room-A-bed2',
                apartmentId: 'demo-apt-A',
                type: 'bedroom',
                name: 'Bedroom 2',
                areaM2: { value: 11.0, min: 9, max: 15 },
                widthM: { value: 3.0, min: 2.5, max: 4 },
                depthM: { value: 3.5, min: 3, max: 4.5 },
                daylightRequired: true,
                privacyTier: 3,
            },
        ];
    }
    if (apartmentId === 'demo-apt-B') {
        return [
            {
                id: 'demo-room-B-main',
                apartmentId: 'demo-apt-B',
                type: 'living',
                name: 'Studio Living/Sleep',
                areaM2: { value: 28.0, min: 22, max: 40 },
                widthM: { value: 4.0, min: 3, max: 5 },
                depthM: { value: 7.0, min: 5, max: 9 },
                daylightRequired: true,
                privacyTier: 1,
            },
        ];
    }
    return [];
}

// ── Public entry ─────────────────────────────────────────────────────────────

/**
 * Open the Apartment Data (read-only) dev modal.
 *
 * @param runtime  Optional explicit runtime override (used by tests). When
 *                 omitted the modal reads `window.runtime` through the typed
 *                 globals augmentation — no `(window as any)` cast.
 */
export function openApartmentDataTestModal(runtime?: ApartmentDataRuntimeLike): void {
    // Resolve the runtime through the typed window slot when the caller did
    // not supply one explicitly. The cast is safe because
    // ApartmentDataRuntimeLike is a STRUCTURAL superset (every field optional).
    const resolvedRuntime: ApartmentDataRuntimeLike =
        runtime
        ?? ((typeof window !== 'undefined'
            ? (window as unknown as { runtime?: unknown }).runtime
            : undefined) as ApartmentDataRuntimeLike | undefined)
        ?? {};

    // ── <dialog> shell ───────────────────────────────────────────────────────
    const dialog = document.createElement('dialog');
    dialog.className = 'adtm-dialog';

    const body = document.createElement('div');
    body.className = 'adtm-body';
    dialog.appendChild(body);

    // Header
    const header = document.createElement('div');
    header.className = 'adtm-header';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'adtm-title';
    title.textContent = 'BIM 2/3 D-α — Apartment Data Panel (read-only dev)';
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);

    const headerActions = document.createElement('div');
    headerActions.className = 'adtm-header-actions';

    const readonlyPill = document.createElement('span');
    readonlyPill.className = 'adtm-readonly-pill';
    readonlyPill.textContent = 'Read-only';
    readonlyPill.title = 'Live editing arrives in D-α-5';
    headerActions.appendChild(readonlyPill);

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'adtm-btn adtm-btn--secondary';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.title = 'Re-read both stores and redraw';
    headerActions.appendChild(refreshBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'adtm-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => dialog.close());
    headerActions.appendChild(closeBtn);

    header.appendChild(headerActions);
    body.appendChild(header);

    // Subtitle
    const subtitle = document.createElement('div');
    subtitle.className = 'adtm-subtitle';
    subtitle.textContent =
        'Pick an apartment on the left to inspect its parameters + rooms. '
        + 'All values are read-only (live editing lands in D-α-5).';
    body.appendChild(subtitle);

    // Banner slot — filled by render() when the store is missing or empty.
    const bannerSlot = document.createElement('div');
    body.appendChild(bannerSlot);

    // ── Content (two-column) ─────────────────────────────────────────────────
    const content = document.createElement('div');
    content.className = 'adtm-content';
    body.appendChild(content);

    const columns = document.createElement('div');
    columns.className = 'adtm-columns';
    content.appendChild(columns);

    // LEFT — apartment list
    const colList = document.createElement('div');
    colList.className = 'adtm-col adtm-col--list';
    columns.appendChild(colList);

    const listLabel = document.createElement('div');
    listLabel.className = 'adtm-label';
    listLabel.textContent = 'Apartments';
    colList.appendChild(listLabel);

    const listHost = document.createElement('div');
    listHost.className = 'adtm-list-host';
    colList.appendChild(listHost);

    // RIGHT — detail panel
    const colDetail = document.createElement('div');
    colDetail.className = 'adtm-col adtm-col--detail';
    columns.appendChild(colDetail);

    const detailLabel = document.createElement('div');
    detailLabel.className = 'adtm-label';
    detailLabel.textContent = 'Detail';
    colDetail.appendChild(detailLabel);

    const detailHost = document.createElement('div');
    detailHost.className = 'adtm-detail-host';
    colDetail.appendChild(detailHost);

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'adtm-footer';
    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.type = 'button';
    closeFooterBtn.className = 'adtm-btn adtm-btn--secondary';
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.addEventListener('click', () => dialog.close());
    footer.appendChild(closeFooterBtn);
    content.appendChild(footer);

    // ── Render state ────────────────────────────────────────────────────────
    let selectedApartmentId: string | null = null;

    /** Render the apartment list column. */
    const renderList = (
        apartments: ReadonlyArray<ApartmentParameters>,
        roomStore: unknown,
        isDemo: boolean,
    ): void => {
        listHost.replaceChildren();
        if (apartments.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'adtm-list-empty';
            empty.textContent =
                'No apartments in the store yet. Generate an apartment layout to populate.';
            listHost.appendChild(empty);
            return;
        }
        for (const apt of apartments) {
            const row = document.createElement('div');
            row.className = 'adtm-list-row';
            if (apt.id === selectedApartmentId) {
                row.classList.add('adtm-list-row--selected');
            }
            row.setAttribute('data-apt-id', apt.id);
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');

            const nameEl = document.createElement('div');
            nameEl.className = 'adtm-list-row-name';
            // No `name` field on ApartmentParameters — derive from typology + id tail.
            const aptLabel = `${apt.typology} (${truncateId(apt.id)})`;
            nameEl.textContent = aptLabel;
            row.appendChild(nameEl);

            const idEl = document.createElement('div');
            idEl.className = 'adtm-list-row-id';
            idEl.textContent = apt.id;
            idEl.title = apt.id;
            row.appendChild(idEl);

            // Room count + total area (best-effort — pulls from the room store).
            const rooms = isDemo
                ? demoRoomsFor(apt.id)
                : (listRoomsForApartment(roomStore, apt.id) as ReadonlyArray<RoomParameters>);
            let totalArea = 0;
            for (const r of rooms) {
                const v = (r as RoomParameters)?.areaM2?.value;
                if (typeof v === 'number' && Number.isFinite(v)) totalArea += v;
            }
            const meta = document.createElement('div');
            meta.className = 'adtm-list-row-meta';
            const roomCountEl = document.createElement('span');
            roomCountEl.textContent = `${rooms.length} room${rooms.length === 1 ? '' : 's'}`;
            const areaEl = document.createElement('span');
            areaEl.textContent = totalArea > 0 ? `${totalArea.toFixed(1)} m² total` : '—';
            meta.appendChild(roomCountEl);
            meta.appendChild(areaEl);
            row.appendChild(meta);

            const onActivate = (): void => {
                selectedApartmentId = apt.id;
                // Re-render both columns so the selected style updates.
                render();
            };
            row.addEventListener('click', onActivate);
            row.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    onActivate();
                }
            });

            listHost.appendChild(row);
        }
    };

    /** Append one key/value row to the data table. */
    const appendDataRow = (
        table: HTMLElement,
        key: string,
        value: string,
        mono = false,
    ): void => {
        const k = document.createElement('div');
        k.className = 'adtm-data-key';
        k.textContent = key;
        const v = document.createElement('div');
        v.className = mono ? 'adtm-data-val adtm-data-val--mono' : 'adtm-data-val';
        v.textContent = value;
        table.appendChild(k);
        table.appendChild(v);
    };

    /** Render the detail panel for the selected apartment. */
    const renderDetail = (
        apt: ApartmentParameters | null,
        rooms: ReadonlyArray<RoomParameters>,
    ): void => {
        detailHost.replaceChildren();
        if (apt === null) {
            const empty = document.createElement('div');
            empty.className = 'adtm-detail-empty';
            empty.textContent =
                'Select an apartment on the left to inspect its data.';
            detailHost.appendChild(empty);
            return;
        }

        // ── Identity ────────────────────────────────────────────────────────
        const identitySection = document.createElement('div');
        const identityTitle = document.createElement('h3');
        identityTitle.className = 'adtm-section-title';
        identityTitle.textContent = 'Identity';
        identitySection.appendChild(identityTitle);

        const identityTable = document.createElement('div');
        identityTable.className = 'adtm-data-table';
        appendDataRow(identityTable, 'id', apt.id, true);
        appendDataRow(identityTable, 'typology', apt.typology);
        appendDataRow(identityTable, 'bedrooms', String(apt.bedrooms));
        appendDataRow(identityTable, 'bathrooms', String(apt.bathrooms));
        identitySection.appendChild(identityTable);
        detailHost.appendChild(identitySection);

        // ── Areas ───────────────────────────────────────────────────────────
        const areasSection = document.createElement('div');
        const areasTitle = document.createElement('h3');
        areasTitle.className = 'adtm-section-title';
        areasTitle.textContent = 'Areas';
        areasSection.appendChild(areasTitle);

        const areasTable = document.createElement('div');
        areasTable.className = 'adtm-data-table';
        const shell = apt.shellAreaM2;
        appendDataRow(areasTable, 'shell area (target)', fmtArea(shell.value));
        appendDataRow(areasTable, 'shell area (min)', fmtArea(shell.min));
        appendDataRow(
            areasTable,
            'shell area (max)',
            shell.max === Number.POSITIVE_INFINITY ? '∞' : fmtArea(shell.max),
        );
        let netArea = 0;
        for (const r of rooms) {
            const v = r?.areaM2?.value;
            if (typeof v === 'number' && Number.isFinite(v)) netArea += v;
        }
        appendDataRow(areasTable, 'net area (sum of rooms)', netArea > 0 ? fmtArea(netArea) : '—');
        const circulation = netArea > 0 && shell.value > 0
            ? Math.max(0, shell.value - netArea)
            : 0;
        appendDataRow(
            areasTable,
            'circulation area (derived)',
            circulation > 0 ? fmtArea(circulation) : '—',
        );
        areasSection.appendChild(areasTable);
        detailHost.appendChild(areasSection);

        // ── Programme ───────────────────────────────────────────────────────
        const progSection = document.createElement('div');
        const progTitle = document.createElement('h3');
        progTitle.className = 'adtm-section-title';
        progTitle.textContent = 'Programme';
        progSection.appendChild(progTitle);

        const progTable = document.createElement('div');
        progTable.className = 'adtm-data-table';
        appendDataRow(progTable, 'masterEnSuite', fmtValue(apt.masterEnSuite));
        appendDataRow(progTable, 'openPlanKitchenDining', fmtValue(apt.openPlanKitchenDining));
        appendDataRow(progTable, 'livingRoom', fmtValue(apt.livingRoom));
        appendDataRow(progTable, 'entranceHall', fmtValue(apt.entranceHall));
        progSection.appendChild(progTable);
        detailHost.appendChild(progSection);

        // ── Custom fields (any other keys on the apartment record) ──────────
        const known = new Set([
            'id', 'shellAreaM2', 'bedrooms', 'bathrooms', 'masterEnSuite',
            'openPlanKitchenDining', 'livingRoom', 'entranceHall', 'typology',
        ]);
        const extraKeys: string[] = [];
        for (const k of Object.keys(apt as Record<string, unknown>)) {
            if (!known.has(k)) extraKeys.push(k);
        }
        if (extraKeys.length > 0) {
            const extraSection = document.createElement('div');
            const extraTitle = document.createElement('h3');
            extraTitle.className = 'adtm-section-title';
            extraTitle.textContent = 'Other fields';
            extraSection.appendChild(extraTitle);
            const extraTable = document.createElement('div');
            extraTable.className = 'adtm-data-table';
            for (const k of extraKeys.sort()) {
                appendDataRow(extraTable, k, fmtValue((apt as Record<string, unknown>)[k]));
            }
            extraSection.appendChild(extraTable);
            detailHost.appendChild(extraSection);
        }

        // ── Rooms table ─────────────────────────────────────────────────────
        const roomsSection = document.createElement('div');
        const roomsTitle = document.createElement('h3');
        roomsTitle.className = 'adtm-section-title';
        roomsTitle.textContent = `Rooms (${rooms.length})`;
        roomsSection.appendChild(roomsTitle);

        if (rooms.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'adtm-rooms-empty';
            empty.textContent = 'No rooms found for this apartment.';
            roomsSection.appendChild(empty);
        } else {
            const table = document.createElement('table');
            table.className = 'adtm-rooms-table';
            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            for (const h of ['id', 'name', 'type', 'area', 'w × d', 'windows']) {
                const th = document.createElement('th');
                th.textContent = h;
                headRow.appendChild(th);
            }
            thead.appendChild(headRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            for (const r of rooms) {
                const tr = document.createElement('tr');

                const tdId = document.createElement('td');
                tdId.className = 'adtm-rooms-col-id';
                tdId.textContent = truncateId(r.id);
                tdId.title = r.id;
                tr.appendChild(tdId);

                const tdName = document.createElement('td');
                tdName.textContent = r.name;
                tr.appendChild(tdName);

                const tdType = document.createElement('td');
                tdType.textContent = r.type;
                tr.appendChild(tdType);

                const tdArea = document.createElement('td');
                tdArea.textContent = fmtArea(r.areaM2?.value);
                tr.appendChild(tdArea);

                const tdWxD = document.createElement('td');
                const w = r.widthM?.value;
                const d = r.depthM?.value;
                tdWxD.textContent = (typeof w === 'number' && typeof d === 'number')
                    ? `${fmtMeters(w)} × ${fmtMeters(d)}`
                    : '—';
                tr.appendChild(tdWxD);

                // No window count on RoomParameters yet — placeholder per spec.
                const tdWindows = document.createElement('td');
                tdWindows.textContent = '—';
                tdWindows.title = 'Window count not yet exposed on RoomParameters';
                tr.appendChild(tdWindows);

                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            roomsSection.appendChild(table);
        }
        detailHost.appendChild(roomsSection);
    };

    /** Top-level render — probes, lists, and (re)draws both columns. */
    const render = (): void => {
        bannerSlot.replaceChildren();
        const probed = probeStores(resolvedRuntime);

        // No store → banner + demo records.
        let apartments: ReadonlyArray<ApartmentParameters>;
        let usingDemo = false;
        if (probed.apartmentStore === null) {
            const banner = document.createElement('div');
            banner.className = 'adtm-banner';
            banner.innerHTML =
                'ApartmentParametersStore not available in this runtime. '
                + 'Run the AI Apartment Generator first. '
                + '<span style="color:#888">Showing demo records below.</span>';
            bannerSlot.appendChild(banner);
            apartments = demoApartments();
            usingDemo = true;
        } else {
            const raw = listApartments(probed.apartmentStore);
            // Schema-shape filter: keep only objects that look like ApartmentParameters.
            const valid: ApartmentParameters[] = [];
            for (const v of raw) {
                if (v !== null && v !== undefined && typeof v === 'object'
                    && typeof (v as Record<string, unknown>)['id'] === 'string'
                    && typeof (v as Record<string, unknown>)['typology'] === 'string'
                ) {
                    valid.push(v as ApartmentParameters);
                }
            }
            if (valid.length === 0) {
                const banner = document.createElement('div');
                banner.className = 'adtm-banner adtm-banner--info';
                banner.innerHTML =
                    'No apartments in the store yet. Generate an apartment layout '
                    + 'to populate. <span style="color:#888">Showing demo records '
                    + 'below.</span>';
                bannerSlot.appendChild(banner);
                apartments = demoApartments();
                usingDemo = true;
            } else {
                apartments = valid;
            }
        }

        // Auto-pick the first apartment when none is selected or the selection
        // is stale (e.g. selected id no longer present in the store).
        const ids = new Set(apartments.map(a => a.id));
        if (selectedApartmentId === null || !ids.has(selectedApartmentId)) {
            selectedApartmentId = apartments.length > 0 ? apartments[0].id : null;
        }

        renderList(apartments, probed.roomStore, usingDemo);

        // Resolve the selected apartment + its rooms for the detail column.
        const selected = apartments.find(a => a.id === selectedApartmentId) ?? null;
        let rooms: ReadonlyArray<RoomParameters> = [];
        if (selected !== null) {
            if (usingDemo) {
                rooms = demoRoomsFor(selected.id);
            } else {
                const raw = listRoomsForApartment(probed.roomStore, selected.id);
                const valid: RoomParameters[] = [];
                for (const v of raw) {
                    if (v !== null && v !== undefined && typeof v === 'object'
                        && typeof (v as Record<string, unknown>)['id'] === 'string'
                        && typeof (v as Record<string, unknown>)['type'] === 'string'
                    ) {
                        valid.push(v as RoomParameters);
                    }
                }
                rooms = valid;
            }
        }
        renderDetail(selected, rooms);

        // Defensive secondary use of escHtml — set a title attribute via
        // innerHTML-safe escape (no XSS even on hypothetically malformed
        // selected ids).
        if (selected !== null) {
            detailHost.title = escHtml(`apartment:${selected.id}`);
        } else {
            detailHost.title = '';
        }
    };

    refreshBtn.addEventListener('click', () => {
        render();
    });

    // Initial render
    render();

    // ── Cleanup ─────────────────────────────────────────────────────────────
    dialog.addEventListener('close', () => {
        dialog.remove();
    });

    // Backdrop click → close.
    dialog.addEventListener('click', (ev) => {
        if (ev.target === dialog) dialog.close();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
}
