// @migration S91-WIRE: moved from src/spatial/RoomAutoOrganiser.ts (intra-src L7.5; src/core/ dep blocks Wave-9 package promotion to packages/geometry-kernel/spatial/ — deferred)
/**
 * RoomAutoOrganiser.ts
 *
 * ## MODIFICATION DECLARATION
 * Phase:     C — Feature 12 (Smart Automation / Auto Organise)
 * Contract:  18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.12
 *            05-BIM-UI-ARCHITECTURE-CONTRACT §1 (mutations only through commandManager)
 *            01-BIM-ENGINE-CORE-CONTRACT §3 (each rename = separate undoable command)
 *            07-BIM-SECURITY-CONTRACT §1 (no Anthropic calls)
 *            03-BIM-SEMANTIC-MODEL-CONTRACT §1 (no `any` in public API)
 *
 * PURPOSE:
 *   Runs RoomTypeInferenceEngine across all rooms on a level, generates a
 *   proposed change-set, and presents it to the user in a confirmation modal.
 *   On "Apply All", fires a sequence of SetRoomOccupancyCommand and
 *   RenameRoomCommand through commandManager — never writes directly to stores.
 *
 * DATA FLOW (read-only until user confirms):
 *   window.roomStore.getAll()                     → room data // TODO(TASK-08)
 *   window.roomTypeInferenceEngine.inferLevel()   → ProposedChange list
 *   bus.executeCommand()                          → mutations (after confirm only)
 *
 * RULES:
 *   - No store writes before user confirmation.
 *   - All mutations after confirm go through the command bus (bus.executeCommand).
 *   - No THREE.js imports.
 *   - No Anthropic / fetch AI calls.
 *   - No `any` in the public API types.
 */

import type { RoomOccupancyType } from '@pryzm/room-topology';
import { storeRegistry } from '@pryzm/core-app-model';

// ── Public Types ──────────────────────────────────────────────────────────────

export interface ProposedChange {
    roomId: string;
    currentName: string;
    currentType: RoomOccupancyType;
    proposedName: string;
    proposedType: RoomOccupancyType;
    confidence: number;
    reason: string;
    /** True if name should also be changed. */
    renameRequired: boolean;
}

// ── Type → default name map ───────────────────────────────────────────────────

const TYPE_DEFAULT_NAMES: Record<string, string> = {
    'bedroom':          'Bedroom',
    'living-room':      'Living Room',
    'kitchen':          'Kitchen',
    'bathroom':         'Bathroom',
    'dining-room':      'Dining Room',
    'utility-room':     'Utility Room',
    'garage':           'Garage',
    'storage-residential': 'Store',
    'open-office':      'Open Office',
    'private-office':   'Office',
    'meeting-room':     'Meeting Room',
    'reception':        'Reception',
    'breakout':         'Breakout',
    'server-room':      'Server Room',
    'retail-floor':     'Retail',
    'stockroom':        'Stockroom',
    'changing-room':    'Changing Room',
    'patient-room':     'Patient Room',
    'operating-theatre':'Theatre',
    'waiting-room':     'Waiting Room',
    'consultation-room':'Consultation',
    'pharmacy':         'Pharmacy',
    'classroom':        'Classroom',
    'laboratory':       'Lab',
    'lecture-hall':     'Lecture Hall',
    'library':          'Library',
    'staff-room':       'Staff Room',
    'hotel-bedroom':    'Bedroom',
    'restaurant':       'Restaurant',
    'bar':              'Bar',
    'function-room':    'Function Room',
    'spa':              'Spa',
    'warehouse':        'Warehouse',
    'loading-bay':      'Loading Bay',
    'plant-room':       'Plant Room',
    'electrical-room':  'Electrical Room',
    'corridor':         'Corridor',
    'stairwell':        'Stairwell',
    'lift-lobby':       'Lift Lobby',
    'entrance-lobby':   'Lobby',
    'foyer':            'Foyer',
    'wc':               'WC',
    'accessible-wc':    'Accessible WC',
    'shower-room':      'Shower Room',
    'kitchen-shared':   'Kitchen',
    'prayer-room':      'Prayer Room',
    'terrace':          'Terrace',
    'balcony':          'Balcony',
    'atrium':           'Atrium',
    'courtyard':        'Courtyard',
    'unclassified':     'Room',
};

// ── Service ───────────────────────────────────────────────────────────────────

export class RoomAutoOrganiser {

    /**
     * Analyse all rooms on a level and produce a list of proposed changes.
     * Rooms where inference returns null are skipped.
     * Pure read — no store writes.
     *
     * @param levelId  The level to analyse.
     */
    propose(levelId: string): ProposedChange[] {
        const roomStore = storeRegistry.getStoreForType("room") as any;
        const inferenceEngine = window.roomTypeInferenceEngine;
        if (!roomStore || !inferenceEngine) return [];

        const rooms = typeof roomStore.getByLevel === 'function'
            ? roomStore.getByLevel(levelId)
            : roomStore.getAll().filter((r: { levelId: string }) => r.levelId === levelId);

        // Track how many rooms we've seen of each type for sequential naming
        const typeCounter: Record<string, number> = {};
        const proposals: ProposedChange[] = [];

        // Sort rooms by area (largest first) for consistent sequential naming
        const sortedRooms = [...rooms].sort((a: any, b: any) =>
            (b.computed?.area ?? 0) - (a.computed?.area ?? 0),
        );

        for (const room of sortedRooms) {
            let suggestion: { suggested: RoomOccupancyType; confidence: number; reason: string } | null = null;
            try {
                suggestion = inferenceEngine.inferType(room.id);
            } catch { /* inference error — skip */ }

            if (!suggestion) continue;
            if (suggestion.suggested === room.occupancyType) continue; // already correct

            const baseName = TYPE_DEFAULT_NAMES[suggestion.suggested] ?? 'Room';
            typeCounter[suggestion.suggested] = (typeCounter[suggestion.suggested] ?? 0) + 1;
            const count = typeCounter[suggestion.suggested];
            const proposedName = count === 1 ? baseName : `${baseName} ${count}`;

            // Only suggest a name change if the room is unnamed or has a generic placeholder
            const currentName: string = room.name ?? '';
            const isGeneric = !currentName || /^room\s*\d*$/i.test(currentName.trim());
            const renameRequired = isGeneric && proposedName !== currentName;

            proposals.push({
                roomId:        room.id,
                currentName,
                currentType:   room.occupancyType,
                proposedName,
                proposedType:  suggestion.suggested,
                confidence:    suggestion.confidence,
                reason:        suggestion.reason,
                renameRequired,
            });
        }

        return proposals;
    }

    /**
     * Execute approved proposals through commandManager.
     * Each command is individually undoable per 01-BIM-ENGINE-CORE-CONTRACT §3.
     *
     * @param proposals  The full or filtered list of proposals to apply.
     */
    async apply(proposals: ProposedChange[]): Promise<void> {
        // [P6-E.5.1] Migrated: guard on runtime.bus (dispatch is already via window.runtime?.bus below).
        if (!window.runtime?.bus) return;

        for (const change of proposals) {
            // [F-1.3] Bus-primary: commandManager exfiltrated to SetRoomOccupancyHandler (plugins/rooms).
            window.runtime?.bus?.executeCommand('room.setOccupancy', { roomId: change.roomId, occupancy: change.proposedType })
                .catch((e: Error) => console.error('[RoomAutoOrganiser] room.setOccupancy failed:', e));

            if (change.renameRequired) {
                    // [F-1.3] Bus-primary: commandManager exfiltrated to RenameRoomHandler (plugins/rooms).
                    window.runtime?.bus?.executeCommand('room.rename', { roomId: change.roomId, name: change.proposedName })
                        .catch((e: Error) => console.error('[RoomAutoOrganiser] room.rename failed:', e));
            }
        }
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const roomAutoOrganiser = new RoomAutoOrganiser();

if (typeof window !== 'undefined') {
    window.roomAutoOrganiser = roomAutoOrganiser;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * Open the Auto-Organise confirmation modal for a given level.
 * Reads proposals, shows them to the user, and applies on confirm.
 */
export function openAutoOrganiseModal(levelId: string): void {
    // Remove any existing modal
    document.getElementById('room-auto-organise-modal')?.remove();

    const proposals = roomAutoOrganiser.propose(levelId);

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'room-auto-organise-modal';
    overlay.style.cssText = [
        'position:fixed;inset:0;',
        // §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(0,0,0,0.45) — black, brand-violation).
        'background:var(--pryzm-panel-backdrop);',
        'backdrop-filter:var(--pryzm-panel-backdrop-blur);',
        '-webkit-backdrop-filter:var(--pryzm-panel-backdrop-blur);',
        'display:flex;align-items:center;justify-content:center;',
        'z-index:9000;',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    ].join('');

    // Card
    const card = document.createElement('div');
    card.style.cssText = [
        'background:#fff;border-radius:12px;',
        'box-shadow:0 20px 60px rgba(0,0,0,0.25);',
        'width:480px;max-height:80vh;',
        'display:flex;flex-direction:column;',
        'overflow:hidden;',
    ].join('');

    // Header
    const header = document.createElement('div');
    header.style.cssText = [
        'padding:16px 20px 12px;',
        'background:linear-gradient(135deg,#7c3aed 0%,#6600FF 100%);',
        'color:#fff;',
    ].join('');
    header.innerHTML = `
        <div style="font-size:15px;font-weight:700;letter-spacing:0.01em;">⚡ Auto-Organise Rooms</div>
        <div style="font-size:11px;opacity:0.85;margin-top:3px;">
            ${proposals.length === 0
                ? 'All rooms already have optimal types — nothing to change.'
                : `${proposals.length} room${proposals.length === 1 ? '' : 's'} can be improved. Review and apply below.`
            }
        </div>`;
    card.appendChild(header);

    if (proposals.length === 0) {
        // Empty state
        const emptyBody = document.createElement('div');
        emptyBody.style.cssText = 'padding:24px 20px;text-align:center;color:#666;font-size:13px;';
        emptyBody.innerHTML = `
            <div style="font-size:28px;margin-bottom:8px;">✨</div>
            <div>Every room's type already matches its contents.</div>
            <div style="font-size:11px;color:#aaa;margin-top:6px;">Place furniture or plumbing fixtures inside rooms to get smarter suggestions.</div>`;
        card.appendChild(emptyBody);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 16px;border-top:1px solid #eee;display:flex;justify-content:flex-end;';
        const closeBtn = _makeBtn('Close', '#6b7280', () => overlay.remove());
        footer.appendChild(closeBtn);
        card.appendChild(footer);
    } else {
        // Proposal list
        const listBody = document.createElement('div');
        listBody.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:6px;';

        // Column headers
        const cols = document.createElement('div');
        cols.style.cssText = 'display:grid;grid-template-columns:1fr 110px 1fr 60px;gap:6px;font-size:9px;font-weight:700;color:#9e9e9e;text-transform:uppercase;letter-spacing:0.06em;padding:0 4px 4px;border-bottom:1px solid #eee;';
        cols.innerHTML = '<span>Room</span><span>Current type</span><span>Suggested type</span><span>Confidence</span>';
        listBody.appendChild(cols);

        const checkboxes: HTMLInputElement[] = [];

        proposals.forEach(p => {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:auto 1fr 110px 1fr 60px;gap:6px;align-items:center;padding:5px 4px;border-bottom:1px dotted #f0f0f0;font-size:11px;';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.style.cssText = 'cursor:pointer;accent-color:#7c3aed;width:13px;height:13px;';
            checkboxes.push(cb);

            const nameEl = document.createElement('span');
            nameEl.style.cssText = 'font-weight:500;color:#1a2035;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            nameEl.textContent = p.currentName || `Room ${p.roomId.substring(0, 6)}`;
            nameEl.title = p.renameRequired ? `Will be renamed to "${p.proposedName}"` : '';

            const fromEl = document.createElement('span');
            fromEl.style.cssText = 'font-size:10px;color:#888;';
            fromEl.textContent = p.currentType.replace(/-/g, ' ');

            const toEl = document.createElement('span');
            toEl.style.cssText = 'font-weight:600;color:#7c3aed;';
            toEl.textContent = p.proposedType.replace(/-/g, ' ');
            if (p.renameRequired) {
                toEl.title = `Rename: "${p.proposedName}"`;
                toEl.textContent += ' ✎';
            }

            const confEl = document.createElement('span');
            confEl.style.cssText = 'color:#10b981;font-size:10px;font-weight:600;';
            confEl.textContent = `${Math.round(p.confidence * 100)}%`;

            row.appendChild(cb);
            row.appendChild(nameEl);
            row.appendChild(fromEl);
            row.appendChild(toEl);
            row.appendChild(confEl);

            // Reason tooltip on hover
            row.title = p.reason;

            listBody.appendChild(row);
        });

        card.appendChild(listBody);

        // Legend
        const legend = document.createElement('div');
        legend.style.cssText = 'padding:5px 20px;font-size:9px;color:#aaa;border-top:1px solid #f0f0f0;background:#fafafa;';
        legend.textContent = '✎ = room will also be renamed • Hover a row to see the detection reason';
        card.appendChild(legend);

        // Footer buttons
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 16px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;align-items:center;';

        const selectAllChk = document.createElement('input');
        selectAllChk.type = 'checkbox';
        selectAllChk.checked = true;
        selectAllChk.title = 'Select / deselect all';
        selectAllChk.style.cssText = 'cursor:pointer;accent-color:#7c3aed;';
        selectAllChk.addEventListener('change', () => {
            checkboxes.forEach(c => { c.checked = selectAllChk.checked; });
        });
        const selectAllLbl = document.createElement('label');
        selectAllLbl.style.cssText = 'font-size:10px;color:#666;cursor:pointer;';
        selectAllLbl.textContent = 'All';
        selectAllLbl.prepend(selectAllChk);

        const cancelBtn = _makeBtn('Cancel', '#6b7280', () => overlay.remove());
        const applyBtn  = _makeBtn('Apply Selected', '#7c3aed', async () => {
            applyBtn.disabled = true;
            applyBtn.textContent = 'Applying…';
            const selected = proposals.filter((_, i) => checkboxes[i]?.checked);
            await roomAutoOrganiser.apply(selected);
            overlay.remove();
        });

        footer.appendChild(selectAllLbl);
        footer.appendChild(cancelBtn);
        footer.appendChild(applyBtn);
        card.appendChild(footer);
    }

    overlay.appendChild(card);

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
}

// ── Button helper ─────────────────────────────────────────────────────────────

function _makeBtn(label: string, bg: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
        `padding:7px 16px;font-size:12px;font-weight:600;`,
        `background:${bg};color:#fff;border:none;border-radius:6px;cursor:pointer;`,
        `transition:opacity 0.1s;`,
    ].join('');
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.85'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    btn.addEventListener('click', onClick);
    return btn;
}
