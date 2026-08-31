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
 *   storeRegistry.getStoreForType("room")         → room data
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
// §ROOMTYPE142 — the deterministic, table-driven "autofill room name from
// contents" classifier (@pryzm/room-topology/RoomAutoFillClassifier.ts) and the
// L-905 name-authorship + naming primitives (@pryzm/ai-host/intents/roomAutoLabel.ts),
// both REUSED rather than re-implemented (C84 EI-9). See openAutoFillModal below.
// §FIX-LAYER-ROOM-AUTOFILL-HOME (2026-08-30) — the classifier moved out of
// `@pryzm/spatial-index` (L1) into `@pryzm/room-topology` (L2), where the
// `RoomOccupancyType` it classifies into is declared. Same function, same call.
import { classifyRoomForAutofill } from '@pryzm/room-topology';
// §DEPT153 (L-12540+) — department is a PURE FUNCTION of the room's
// freshly-classified occupancy (see RoomDepartment.ts's header for why this is
// not a second contents classifier riding alongside `classifyRoomForAutofill`).
import { departmentForOccupancy } from '@pryzm/room-topology';
// Imported via the package's dedicated subpath export, NOT the '@pryzm/ai-host'
// root — the root barrel transitively imports the generative workflow chain
// (LayoutGenerator → ConstraintEngine, which constructs a singleton at module
// scope), which is both unrelated to these three pure functions and measurably
// heavy to load. The subpath reaches only roomAutoLabel.ts + its tiny transitive
// deps (roomOccupancyRef.ts, a Zod schema type) — same idiom as the package's
// existing './validators', './habitability' subpaths.
import { isAutoDefaultRoomName, nextAutoLabelIndex, formatAutoLabelName } from '@pryzm/ai-host/intents/room-auto-label';

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
        const inferenceEngine = window.roomTypeInferenceEngine; // TODO(TASK-08): legacy window global — replace with a runtime-composed engine slot
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

// ═══════════════════════════════════════════════════════════════════════════
// §ROOMTYPE142 — content-based bulk AUTOFILL (rename + reclassify), AD-HOC.
// ═══════════════════════════════════════════════════════════════════════════
//
// Founder, verbatim: *"Create an easy algorithm in the room schedule to
// autofill based on elements within the rooms ... This could be run AD-HOC,
// not always running, for performance. Create a small UI button. This should
// enable automatic renaming of the rooms: at the moment called 'Room
// 02-009', then will be 'Bedroom 002' or similar — choose."*
//
// DELIBERATELY A SIBLING of the AI-suggestion `RoomAutoOrganiser` above, not a
// merge into it: that class asks `RoomTypeInferenceEngine` for a fuzzy,
// single-best-guess confidence score per room; this asks
// `classifyRoomForAutofill` (@pryzm/spatial-index) for a deterministic,
// ordered, combination-aware rule match — the "EASY algorithm" the founder
// explicitly distinguished from an AI suggestion. Both dispatch through the
// bus and both end in ONE undo entry; they are two feature surfaces sharing
// one modal idiom (`_makeBtn`, the overlay/card CSS), not two rival engines
// for "what is this room".
//
// NAMING SCHEME (chosen + defended, per the brief): "<Label> <NN>" —
// `Bedroom 01`, `Kitchen-Living 02` — reusing `nextAutoLabelIndex` /
// `formatAutoLabelName` (@pryzm/ai-host/intents/roomAutoLabel.ts) VERBATIM.
// That module is the founder's OWN prior decision on this exact question
// (L-905: "make room 001 a bathroom" → "I want the label to be changed also —
// to Bedroom 01 for example. QUEUE IT!"), already shipped and tested for the
// single-room chat-rename gesture. Reusing it means the chat path and this
// bulk path produce IDENTICAL name shapes for identical room types — one
// naming authority, not two. The room's original code (`roomNumber`, e.g.
// "02-009") is NEVER touched by this feature — it is a SEPARATE field from
// `name`, so the storey/sequence information the founder was concerned about
// losing survives unconditionally in `roomNumber`, in the Room Schedule's own
// Number column, regardless of what `name` reads.
//
// MANUAL-NAME PROTECTION: `isAutoDefaultRoomName` (same module) — the ONE
// "did a human already name this room?" test in this codebase, matching
// empty/'Room'/the minted `Room NN-NNN` shape/`Room <own number>`. A room
// whose name fails that test is SKIPPED — name AND occupancy both left
// untouched — and reported separately, never silently folded into "renamed".

export interface RoomAutofillProposal {
    readonly roomId: string;
    readonly currentName: string;
    /** The rule's display label, e.g. "Bedroom", "Kitchen-Living", "Core". */
    readonly ruleLabel: string;
    readonly proposedName: string;
    readonly occupancyType: RoomOccupancyType;
    /**
     * §DEPT153 (L-12540+) — the department `departmentForOccupancy(occupancyType)`
     * derives. `undefined` means "leave this room's department alone" — it is
     * already human-authored (`departmentAuthored`) and BulkAutoClassifyRoomsCommand
     * must never silently overwrite a human's choice.
     */
    readonly department?: string;
    /** True when this room's department was skipped because a human already set
     *  it by hand — surfaced in the preview so "why does this row show no
     *  department change" has a visible answer, never a silent one. */
    readonly departmentAuthored: boolean;
}

export interface RoomAutofillPreview {
    /** Rooms that matched a rule AND have an auto-default name — these are
     *  what a checked "Apply" actually renames. */
    readonly toApply: readonly RoomAutofillProposal[];
    /** Rooms that matched NO rule — left alone, reported, never guessed. */
    readonly unclassifiedIds: readonly string[];
    /** Rooms that matched a rule but already carry a human-typed name — left
     *  alone (name AND occupancy both), reported, never clobbered. */
    readonly authoredSkipIds: readonly string[];
}

function _sameLevel(a: string | undefined, b: string | undefined): boolean {
    // Conservative like roomAutoLabel.ts's own helper: an unknown side never
    // MERGES levels, only ever fails to distinguish them (worst case an index
    // is skipped, never a duplicate name minted).
    return a === undefined || b === undefined || a === b;
}

/**
 * Classify every given room and decide, per room, whether it will be renamed,
 * left alone because it is unclassified, or left alone because a human
 * already named it. Pure read — no store writes, no dispatch. The caller
 * (the modal below) shows this to the user before anything is applied.
 *
 * Deterministic: room order in `roomIds` decides "taken name" collision order
 * within one call, and the SAME roomIds in the SAME store state always
 * produce the SAME proposedName for every room (no randomness, no wall-clock
 * read — `nextAutoLabelIndex` breaks ties on the smallest free integer).
 */
export function buildRoomAutofillProposals(roomIds: readonly string[]): RoomAutofillPreview {
    const roomStore = storeRegistry.getStoreForType('room') as any;
    const toApply: RoomAutofillProposal[] = [];
    const unclassifiedIds: string[] = [];
    const authoredSkipIds: string[] = [];
    if (!roomStore) return { toApply, unclassifiedIds, authoredSkipIds };

    const allRooms: any[] = typeof roomStore.getAll === 'function' ? roomStore.getAll() : [];
    // Names minted earlier in THIS preview, so two candidate rooms of the same
    // type on the same level become "Bedroom 01" and "Bedroom 02" even though
    // neither has been written to the store yet.
    const assignedInThisRun: { levelId?: string; name: string }[] = [];

    for (const roomId of roomIds) {
        const room = typeof roomStore.getById === 'function'
            ? roomStore.getById(roomId)
            : allRooms.find((r) => r.id === roomId);
        if (!room) { unclassifiedIds.push(roomId); continue; } // vanished — nothing to classify

        const classification = classifyRoomForAutofill(roomId);
        if (!classification) { unclassifiedIds.push(roomId); continue; } // UNCLASSIFIED — leave alone

        if (!isAutoDefaultRoomName(room.name, room.roomNumber)) {
            authoredSkipIds.push(roomId); // user-authored — leave alone, both fields
            continue;
        }

        const taken = [
            ...allRooms
                .filter((r) => r.id !== roomId && _sameLevel(r.levelId, room.levelId))
                .map((r) => r.name),
            ...assignedInThisRun
                .filter((a) => _sameLevel(a.levelId, room.levelId))
                .map((a) => a.name),
        ];
        const proposedName = formatAutoLabelName(classification.label, nextAutoLabelIndex(classification.label, taken));
        assignedInThisRun.push({ levelId: room.levelId, name: proposedName });

        // §DEPT153 — department follows the SAME freshly-classified occupancy,
        // one inference not two (RoomDepartment.ts header). Skipped when a
        // human already set this room's department by hand — never a silent
        // overwrite (§CONTEXT-DATA-HONESTY).
        const departmentAuthored = room.metadata?.departmentAuthored === true;
        const department = departmentAuthored ? undefined : departmentForOccupancy(classification.occupancyType);

        toApply.push({
            roomId,
            currentName: room.name ?? '',
            ruleLabel: classification.label,
            proposedName,
            occupancyType: classification.occupancyType,
            department,
            departmentAuthored,
        });
    }

    return { toApply, unclassifiedIds, authoredSkipIds };
}

/** Room ids for a scope — 'level' mirrors the existing Auto-Organise button's
 *  own scope; 'project' is available for a future project-wide entry point
 *  without any change to the preview/apply logic above. */
function _resolveAutofillScopeRoomIds(scope: { kind: 'level'; levelId: string } | { kind: 'project' }): string[] {
    const roomStore = storeRegistry.getStoreForType('room') as any;
    if (!roomStore) return [];
    const rooms: any[] = scope.kind === 'level'
        ? (typeof roomStore.getByLevel === 'function'
            ? roomStore.getByLevel(scope.levelId)
            : (roomStore.getAll?.() ?? []).filter((r: any) => r.levelId === scope.levelId))
        : (roomStore.getAll?.() ?? []);
    return rooms.map((r) => r.id);
}

/**
 * Open the Autofill confirmation modal for a scope. PREVIEW-then-APPLY (not
 * immediate-apply): a bulk rename can touch dozens of rooms on first use, and
 * showing the exact before/after per room — with a per-row checkbox — is the
 * humane default even though one undo entry would make a blind apply safe too.
 * On "Apply", the checked rows are sent as ONE `room.autoClassify.batch` bus
 * call — one command, one undo entry, regardless of how many rows are checked
 * (C16 §8.6).
 */
export function openAutoFillModal(scope: { kind: 'level'; levelId: string } | { kind: 'project' }): void {
    document.getElementById('room-autofill-modal')?.remove();

    const roomIds = _resolveAutofillScopeRoomIds(scope);
    const { toApply, unclassifiedIds, authoredSkipIds } = buildRoomAutofillProposals(roomIds);

    const overlay = document.createElement('div');
    overlay.id = 'room-autofill-modal';
    overlay.style.cssText = [
        'position:fixed;inset:0;',
        'background:var(--pryzm-panel-backdrop);',
        'backdrop-filter:var(--pryzm-panel-backdrop-blur);',
        '-webkit-backdrop-filter:var(--pryzm-panel-backdrop-blur);',
        'display:flex;align-items:center;justify-content:center;',
        'z-index:9000;',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    ].join('');

    const card = document.createElement('div');
    card.style.cssText = [
        'background:#fff;border-radius:12px;',
        'box-shadow:0 20px 60px rgba(0,0,0,0.25);',
        'width:520px;max-height:80vh;',
        'display:flex;flex-direction:column;',
        'overflow:hidden;',
    ].join('');

    const header = document.createElement('div');
    header.style.cssText = [
        'padding:16px 20px 12px;',
        'background:linear-gradient(135deg,#7c3aed 0%,#6600FF 100%);',
        'color:#fff;',
    ].join('');
    const scopeWord = scope.kind === 'level' ? 'this level' : 'the whole project';
    header.innerHTML = `
        <div style="font-size:15px;font-weight:700;letter-spacing:0.01em;">⚡ Autofill Rooms</div>
        <div style="font-size:11px;opacity:0.85;margin-top:3px;">
            ${roomIds.length} room${roomIds.length === 1 ? '' : 's'} scanned on ${scopeWord} —
            ${toApply.length} will get a name, occupancy &amp; department, ${authoredSkipIds.length} kept (named by hand),
            ${unclassifiedIds.length} unclassified (left alone).
        </div>`;
    card.appendChild(header);

    if (toApply.length === 0) {
        const emptyBody = document.createElement('div');
        emptyBody.style.cssText = 'padding:24px 20px;text-align:center;color:#666;font-size:13px;';
        emptyBody.innerHTML = `
            <div style="font-size:28px;margin-bottom:8px;">✨</div>
            <div>Nothing to rename right now.</div>
            <div style="font-size:11px;color:#aaa;margin-top:6px;">
                ${authoredSkipIds.length > 0 ? `${authoredSkipIds.length} room(s) already have a name you gave them — left untouched. ` : ''}
                ${unclassifiedIds.length > 0 ? `${unclassifiedIds.length} room(s) match no rule yet — add furniture or fixtures to classify them.` : ''}
            </div>`;
        card.appendChild(emptyBody);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 16px;border-top:1px solid #eee;display:flex;justify-content:flex-end;';
        footer.appendChild(_makeBtn('Close', '#6b7280', () => overlay.remove()));
        card.appendChild(footer);
    } else {
        const listBody = document.createElement('div');
        listBody.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:6px;';

        const cols = document.createElement('div');
        cols.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:9px;font-weight:700;color:#9e9e9e;text-transform:uppercase;letter-spacing:0.06em;padding:0 4px 4px;border-bottom:1px solid #eee;';
        cols.innerHTML = '<span>Current name</span><span>New name (rule)</span><span>Department</span>';
        listBody.appendChild(cols);

        const checkboxes: HTMLInputElement[] = [];

        toApply.forEach((p) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:auto 1fr 1fr 1fr;gap:6px;align-items:center;padding:5px 4px;border-bottom:1px dotted #f0f0f0;font-size:11px;';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.style.cssText = 'cursor:pointer;accent-color:#7c3aed;width:13px;height:13px;';
            checkboxes.push(cb);

            const fromEl = document.createElement('span');
            fromEl.style.cssText = 'color:#1a2035;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            fromEl.textContent = p.currentName || `Room ${p.roomId.substring(0, 6)}`;

            const toEl = document.createElement('span');
            toEl.style.cssText = 'font-weight:600;color:#7c3aed;';
            toEl.textContent = p.proposedName;
            toEl.title = `Rule matched: ${p.ruleLabel} → occupancy "${p.occupancyType}"`;

            // §DEPT153 — the department column: the derived value, or a visible
            // "kept" note when a human already set it by hand (never silently
            // blank, which would read as "nothing happens here").
            const deptEl = document.createElement('span');
            deptEl.style.cssText = p.departmentAuthored
                ? 'font-size:10px;color:#9b6a1a;font-style:italic;'
                : 'font-weight:600;color:#10b981;';
            deptEl.textContent = p.departmentAuthored ? 'kept (set by hand)' : (p.department ?? '—');
            deptEl.title = p.departmentAuthored
                ? 'This room already has a department you set — left untouched.'
                : `Derived from occupancy "${p.occupancyType}".`;

            row.appendChild(cb);
            row.appendChild(fromEl);
            row.appendChild(toEl);
            row.appendChild(deptEl);
            row.title = toEl.title;
            listBody.appendChild(row);
        });

        card.appendChild(listBody);

        const legend = document.createElement('div');
        legend.style.cssText = 'padding:5px 20px;font-size:9px;color:#aaa;border-top:1px solid #f0f0f0;background:#fafafa;';
        legend.textContent = 'Hover a row to see which rule matched. Uncheck a row to keep that room as-is. Department follows the matched occupancy — rooms already given a department by hand are kept.';
        card.appendChild(legend);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 16px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;align-items:center;';

        const selectAllChk = document.createElement('input');
        selectAllChk.type = 'checkbox';
        selectAllChk.checked = true;
        selectAllChk.title = 'Select / deselect all';
        selectAllChk.style.cssText = 'cursor:pointer;accent-color:#7c3aed;';
        selectAllChk.addEventListener('change', () => {
            checkboxes.forEach((c) => { c.checked = selectAllChk.checked; });
        });
        const selectAllLbl = document.createElement('label');
        selectAllLbl.style.cssText = 'font-size:10px;color:#666;cursor:pointer;';
        selectAllLbl.textContent = 'All';
        selectAllLbl.prepend(selectAllChk);

        const cancelBtn = _makeBtn('Cancel', '#6b7280', () => overlay.remove());
        const applyBtn = _makeBtn('Apply Selected', '#7c3aed', async () => {
            const selected = toApply.filter((_, i) => checkboxes[i]?.checked);
            if (selected.length === 0) { overlay.remove(); return; }
            applyBtn.disabled = true;
            applyBtn.textContent = 'Applying…';
            try {
                // ONE bus call, ONE command, ONE undo entry — C16 §8.6 — no
                // matter how many rows are checked. §DEPT153: department rides
                // the SAME patch, omitted per-room when already human-authored.
                await window.runtime?.bus?.executeCommand('room.autoClassify.batch', {
                    patches: selected.map((p) => ({
                        roomId: p.roomId,
                        name: p.proposedName,
                        occupancyType: p.occupancyType,
                        ...(p.department !== undefined ? { department: p.department } : {}),
                    })),
                });
            } catch (e) {
                console.error('[RoomAutoOrganiser] room.autoClassify.batch failed:', e);
            }
            overlay.remove();
        });

        footer.appendChild(selectAllLbl);
        footer.appendChild(cancelBtn);
        footer.appendChild(applyBtn);
        card.appendChild(footer);
    }

    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}
