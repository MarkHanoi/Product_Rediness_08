// §DOC-ROOM-INTERIOR-ELEVATIONS — scope-picker modal for "Interior elevations per room"
// (2026-06-26).
//
// Mirrors the furnish-scope modal's structure + brand (white panel + #6600FF accent,
// NO black; shared `alm-overlay` scrim; dismiss on Generate / Cancel / overlay-click /
// Escape). Adds the founder's three-way scope radio (All rooms / This level / Specific
// room) plus a level picker (for "This level") and a room picker (for "Specific room").
// Pure DOM glue — no engine imports, no store reads, no command dispatch. The caller
// supplies the level + room lists and receives the chosen RoomElevationScope.

import type { RoomElevationScope } from './roomInteriorElevations.js';

export interface RoomElevationModalLevel { readonly id: string; readonly name: string }
export interface RoomElevationModalRoom { readonly id: string; readonly name: string; readonly levelId: string }

export interface RoomElevationModalData {
    readonly levels: ReadonlyArray<RoomElevationModalLevel>;
    readonly rooms: ReadonlyArray<RoomElevationModalRoom>;
    /** Default "This level" target (the active level). */
    readonly activeLevelId?: string | null;
}

export interface RoomElevationModalCallbacks {
    /** User pressed Generate with a resolved scope. */
    readonly onGenerate: (scope: RoomElevationScope) => void;
    /** User cancelled (Cancel / overlay click / Escape). */
    readonly onCancel?: () => void;
}

const PURPLE = '#6600FF';
type ScopeKind = RoomElevationScope['kind'];

export class RoomInteriorElevationModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;

    get isOpen(): boolean { return this._el !== null; }

    /** Render the scope picker. Replaces any open instance. */
    show(data: RoomElevationModalData, cb: RoomElevationModalCallbacks): void {
        this.dismiss();

        let kind: ScopeKind = 'all';
        const defaultLevel = data.activeLevelId ?? data.levels[0]?.id ?? '';
        let levelId = defaultLevel;
        let roomId = data.rooms[0]?.id ?? '';

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';

        const panel = document.createElement('div');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Interior elevations per room');
        panel.style.cssText = [
            'background:#ffffff', 'color:#0f172a', 'border-radius:12px',
            'box-shadow:0 20px 60px rgba(102,0,255,0.25)',
            'width:min(460px,94vw)', 'overflow:hidden',
            'font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif',
            'border:1px solid #eadcff',
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = [
            'padding:16px 20px', 'font-size:16px', 'font-weight:650',
            'border-bottom:1px solid #f0e9ff', `color:${PURPLE}`,
        ].join(';');
        header.textContent = 'Interior elevations per room';

        const body = document.createElement('div');
        body.style.cssText = 'padding:16px 20px;display:flex;flex-direction:column;gap:12px';

        const blurb = document.createElement('div');
        blurb.style.cssText = 'color:#475569;font-size:12.5px';
        blurb.textContent = 'Generate an interior elevation per wall, centered on each room. Choose the scope.';
        body.appendChild(blurb);

        // ── Scope radios ────────────────────────────────────────────────────────
        const radioWrap = document.createElement('div');
        radioWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';

        const levelSelect = document.createElement('select');
        const roomSelect = document.createElement('select');

        const selectCss = [
            'margin-top:6px', 'width:100%', 'padding:7px 9px', 'border-radius:8px',
            'border:1px solid #e4d8ff', 'background:#ffffff', 'color:#0f172a',
            'font:13px system-ui,-apple-system,"Segoe UI",sans-serif', 'cursor:pointer',
        ].join(';');
        levelSelect.style.cssText = selectCss;
        roomSelect.style.cssText = selectCss;

        for (const l of data.levels) {
            const o = document.createElement('option');
            o.value = l.id; o.textContent = l.name;
            if (l.id === levelId) o.selected = true;
            levelSelect.appendChild(o);
        }
        for (const r of data.rooms) {
            const o = document.createElement('option');
            const levelName = data.levels.find(l => l.id === r.levelId)?.name;
            o.value = r.id;
            o.textContent = levelName ? `${r.name} · ${levelName}` : r.name;
            if (r.id === roomId) o.selected = true;
            roomSelect.appendChild(o);
        }
        levelSelect.addEventListener('change', () => { levelId = levelSelect.value; });
        roomSelect.addEventListener('change', () => { roomId = roomSelect.value; });

        const syncEnabled = (): void => {
            levelSelect.disabled = kind !== 'level';
            roomSelect.disabled = kind !== 'room';
            levelSelect.style.opacity = kind === 'level' ? '1' : '0.5';
            roomSelect.style.opacity = kind === 'room' ? '1' : '0.5';
        };

        const makeRadio = (
            value: ScopeKind, title: string, sub: string, child?: HTMLElement,
        ): HTMLLabelElement => {
            const row = document.createElement('label');
            row.style.cssText = [
                'display:block', 'padding:10px 12px', 'border-radius:10px', 'cursor:pointer',
                'background:#f8f5ff', 'border:1px solid #e4d8ff',
                'transition:border-color .12s,box-shadow .12s',
            ].join(';');
            const top = document.createElement('div');
            top.style.cssText = 'display:flex;align-items:center;gap:9px';
            const input = document.createElement('input');
            input.type = 'radio'; input.name = 'room-elev-scope'; input.value = value;
            input.checked = value === kind;
            input.style.accentColor = PURPLE;
            const txt = document.createElement('div');
            txt.style.cssText = 'display:flex;flex-direction:column;gap:1px';
            const t = document.createElement('span');
            t.style.cssText = 'font-weight:650;font-size:13.5px'; t.textContent = title;
            const s = document.createElement('span');
            s.style.cssText = 'font-size:11.5px;color:#64748b'; s.textContent = sub;
            txt.appendChild(t); txt.appendChild(s);
            top.appendChild(input); top.appendChild(txt);
            row.appendChild(top);
            if (child) row.appendChild(child);
            input.addEventListener('change', () => {
                if (input.checked) { kind = value; syncEnabled(); }
            });
            return row;
        };

        const roomCount = data.rooms.length;
        radioWrap.appendChild(makeRadio('all', 'All rooms', `Every detected room in the project (${roomCount})`));
        radioWrap.appendChild(makeRadio('level', 'This level', 'Every room on the chosen level', levelSelect));
        radioWrap.appendChild(makeRadio('room', 'Specific room', 'A single room you pick', roomSelect));
        body.appendChild(radioWrap);
        syncEnabled();

        // ── Footer ──────────────────────────────────────────────────────────────
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 20px;border-top:1px solid #f0e9ff;display:flex;justify-content:flex-end;gap:8px';

        const cancel = document.createElement('button');
        cancel.type = 'button'; cancel.textContent = 'Cancel';
        cancel.style.cssText = [
            'padding:8px 14px', 'border-radius:8px', 'cursor:pointer',
            'background:#ffffff', `color:${PURPLE}`, 'border:1px solid #e4d8ff', 'font-weight:600',
        ].join(';');
        cancel.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            this.dismiss(); cb.onCancel?.();
        });

        const generate = document.createElement('button');
        generate.type = 'button'; generate.textContent = 'Generate';
        generate.style.cssText = [
            'padding:8px 16px', 'border-radius:8px', 'cursor:pointer',
            `background:${PURPLE}`, 'color:#ffffff', `border:1px solid ${PURPLE}`, 'font-weight:650',
        ].join(';');
        generate.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const scope: RoomElevationScope =
                kind === 'level' ? { kind: 'level', levelId } :
                kind === 'room' ? { kind: 'room', roomId } :
                { kind: 'all' };
            this.dismiss();
            try { cb.onGenerate(scope); } catch (err) { console.error('[room-elev-modal] onGenerate threw:', err); }
        });

        footer.appendChild(cancel);
        footer.appendChild(generate);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);
        overlay.appendChild(panel);

        overlay.addEventListener('click', (e: MouseEvent) => {
            if (e.target === overlay) { this.dismiss(); cb.onCancel?.(); }
        });
        this._escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { this.dismiss(); cb.onCancel?.(); }
        };
        window.addEventListener('keydown', this._escHandler, { capture: true });

        document.body.appendChild(overlay);
        this._el = overlay;
    }

    dismiss(): void {
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler, { capture: true } as EventListenerOptions);
            this._escHandler = null;
        }
        if (this._el) { this._el.remove(); this._el = null; }
    }
}
