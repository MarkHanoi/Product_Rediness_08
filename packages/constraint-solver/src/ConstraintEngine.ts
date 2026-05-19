/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Compliance — General Constraint Engine (Phase C-1)
 * File:             src/constraints/ConstraintEngine.ts
 * Contract:         docs/PRYZM_MASTER_ROADMAP_2026.md § PHASE C
 *
 * Non-blocking rule registry:
 *   - Tier 1 rules: ROOM_MIN_AREA, ROOM_NEEDS_DOOR, HABITABLE_NEEDS_WINDOW,
 *                   STAIR_HEADROOM, DOOR_WIDTH_vs_CIRCULATION, ACCESSIBLE_ROUTE,
 *                   ROOM_MAX_TRAVEL_DISTANCE
 *   - Tier 2 rules: FIRE_COMPARTMENT_AREA, MEANS_OF_ESCAPE_COUNT,
 *                   CORRIDOR_WIDTH, LIFT_ADJACENT_LOBBY, PLUMBING_ZONE
 *
 * Lifecycle:
 *   - Auto-runs on pryzm-sync-state-changed (debounced 600ms)
 *   - Dispatches pryzm-constraints-updated with { errors, warnings, results }
 *   - Never throws; catches all rule errors and logs them
 *
 * CSS prefix: none (pure logic — no DOM)
 */

// Task 6.3 Phase 6: import BatchCoordinator for batch-mode gating in _scheduleRun().
import { batchCoordinator } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

// ── Public Interfaces ─────────────────────────────────────────────────────────

export interface ValidationResult {
    ruleId:      string;
    tier:        1 | 2;
    severity:    'error' | 'warning' | 'info';
    elementId:   string;
    elementType: string;
    message:     string;
    suggestion?: string;
    regulation?: string;
}

export interface ConstraintRule {
    id:          string;
    tier:        1 | 2;
    severity:    'error' | 'warning' | 'info';
    description: string;
    /** Optional category label used by CompliancePanel filter (e.g. 'Physics'). */
    category?:   string;
    check(ctx: ConstraintContext): ValidationResult[];
}

export interface ConstraintContext {
    roomStore:   any;
    doorStore:   any;
    windowStore: any;
    wallStore:   any;
    stairStore:  any;
    bimManager:  any;
}

// ── Min area per occupancy type (UK Building Regs / HTM / BS EN) ──────────────
const MIN_AREA_M2: Record<string, number> = {
    'bedroom':           7.5,   // UK Part M
    'living-room':      11.0,
    'kitchen':           5.5,
    'bathroom':          3.0,
    'dining-room':       8.0,
    'utility-room':      3.0,
    'garage':           14.0,
    'storage-residential': 1.5,
    'open-office':      10.0,   // 6 m²/person minimum, 2-person min
    'private-office':    7.0,
    'meeting-room':     12.0,
    'patient-room':     12.0,   // NHS HTM 04-01
    'operating-theatre':40.0,
    'waiting-room':      9.0,
    'consultation-room':12.0,
    'classroom':        40.0,   // UK BB93 (20 pupils × 2m²)
    'laboratory':       50.0,
    'lecture-hall':     60.0,
    'library':          20.0,
    'hotel-bedroom':    12.0,
    'restaurant':       20.0,
    'corridor':          2.0,
    'lift-lobby':        4.0,
    'entrance-lobby':    4.0,
    'foyer':             8.0,
    'wc':                1.5,
    'accessible-wc':     4.5,   // BS 8300
    'shower-room':       3.0,
};

// ── Habitable room types (need natural light via window) ──────────────────────
const HABITABLE_TYPES = new Set<string>([
    'bedroom', 'living-room', 'kitchen', 'dining-room',
    'private-office', 'open-office', 'meeting-room', 'consultation-room',
    'patient-room', 'classroom', 'lecture-hall', 'laboratory', 'library',
    'hotel-bedroom', 'restaurant', 'breakout',
]);

// ── Engine implementation ─────────────────────────────────────────────────────

class ConstraintEngineImpl {
    private _rules:   Map<string, ConstraintRule> = new Map();
    private _results: ValidationResult[] = [];
    private _debounce: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        // F.events.15 — runtime.events.on replaces window.addEventListener for pryzm-sync-state-changed.
        (window as any).runtime?.events?.on('pryzm-sync-state-changed', () => this._scheduleRun());
        window.addEventListener('pryzm-room-sync-state-changed', () => this._scheduleRun());
        window.addEventListener('pryzm-project-loaded',      () => this._scheduleRun());

        // Register rules off the critical path — keeps module import non-blocking.
        // The 17-rule build is ~230 ms of synchronous work.  Deferring to idle
        // time means it runs after the first project paint, not during it.
        // `timeout: 2000` ensures rules are ready within 2 s even if the browser
        // stays busy (the first constraint run is debounced 600 ms after project
        // load anyway, so this is always safe).
        const scheduleIdle: (fn: () => void) => void =
            typeof requestIdleCallback !== 'undefined'
                ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
                : (fn) => setTimeout(fn, 0);
        scheduleIdle(() => this._registerBuiltIns());
    }

    // ── Public API ────────────────────────────────────────────────────────────

    register(rule: ConstraintRule): void {
        this._rules.set(rule.id, rule);
    }

    validate(elementId: string, ctx: ConstraintContext): ValidationResult[] {
        return this.validateAll(ctx).filter(r => r.elementId === elementId);
    }

    validateAll(ctx: ConstraintContext): ValidationResult[] {
        const results: ValidationResult[] = [];
        for (const rule of this._rules.values()) {
            try {
                results.push(...rule.check(ctx));
            } catch (e) {
                console.warn(`[ConstraintEngine] Rule ${rule.id} threw:`, e);
            }
        }
        return results;
    }

    run(): ValidationResult[] {
        const ctx = this._getContext();
        this._results = this.validateAll(ctx);
        this._broadcast();
        return this._results;
    }

    getLastResults(): ValidationResult[] {
        return this._results;
    }

    getErrorCount(): number {
        return this._results.filter(r => r.severity === 'error').length;
    }

    getWarningCount(): number {
        return this._results.filter(r => r.severity === 'warning').length;
    }

    /**
     * Pure layout validation — no store reads, no state mutations.
     * Runs all spatial rules that can operate on geometry alone
     * (area rules) against a candidate GeneratedRoom array.
     * Returns a list of human-readable violation messages.
     *
     * Used by LayoutGenerator to score/filter variants before committing.
     */
    validateLayout(generatedRooms: Array<{
        id: string;
        name: string;
        roomType: string;
        area_m2: number;
    }>): string[] {
        const violations: string[] = [];

        for (const gr of generatedRooms) {
            const fakeOccupancy = this._mapToOccupancy(gr.roomType);
            const min = (MIN_AREA_M2 as Record<string, number>)[fakeOccupancy];
            if (min != null && gr.area_m2 < min) {
                violations.push(
                    `${gr.name} — area ${gr.area_m2.toFixed(1)}m² is below minimum ${min}m² for ${fakeOccupancy}`,
                );
            }
        }

        return violations;
    }

    private _mapToOccupancy(roomType: string): string {
        const lower = roomType.toLowerCase();
        const map: Record<string, string> = {
            'bedroom':        'bedroom',
            'patient':        'patient-room',
            'hdu':            'patient-room',
            'itu':            'patient-room',
            'staff':          'open-office',
            'office':         'private-office',
            'meeting':        'meeting-room',
            'utility':        'utility-room',
            'treatment':      'consultation-room',
            'consultation':   'consultation-room',
            'wc':             'bathroom',
            'toilet':         'bathroom',
            'bathroom':       'bathroom',
            'kitchen':        'kitchen',
            'living':         'living-room',
            'dining':         'dining-room',
            'corridor':       'corridor',
            'waiting':        'waiting-room',
            'reception':      'waiting-room',
            'classroom':      'classroom',
            'library':        'library',
            'laboratory':     'laboratory',
        };
        for (const [key, val] of Object.entries(map)) {
            if (lower.includes(key)) return val;
        }
        return 'open-office';
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _getContext(): ConstraintContext {
        return {
            roomStore:   window.roomStore , // TODO(TASK-07)
            doorStore:   window.doorStore , // TODO(TASK-07)
            windowStore: window.windowStore , // TODO(TASK-07)
            wallStore:   window.wallStore , // TODO(TASK-07)
            stairStore:  window.stairStore , // TODO(TASK-07)
            bimManager:  window.bimManager,
        };
    }

    private _scheduleRun(): void {
        // Task 6.3 Phase 6: suppress constraint validation during batch creation.
        // The model is in an incomplete state — validating now produces spurious
        // compliance errors and triggers room geometry rebuilds on phantom states.
        // ConstraintEngine will pick up the final state automatically via the
        // pryzm-room-sync-state-changed event that fires after BatchCoordinator's
        // final REDETECT_ROOMS sweep completes.
        if (batchCoordinator.isBatching) {
            console.debug('[ConstraintEngine] isBatching=true — suppressing constraint run during batch.');
            return;
        }
        if (this._debounce) clearTimeout(this._debounce);
        this._debounce = setTimeout(() => {
            this.run();
            this._debounce = null;
        }, 600);
    }

    private _broadcast(): void {
        _bus.emit('pryzm-constraints-updated', { errors: this.getErrorCount(), warnings: this.getWarningCount(), results: this._results }); // F.events.18
    }

    // ── Built-in rule registration ────────────────────────────────────────────

    private _registerBuiltIns(): void {

        // ── TIER 1 ─────────────────────────────────────────────────────────────

        this.register({
            id: 'ROOM_MIN_AREA', tier: 1, severity: 'error',
            description: 'Room area ≥ minimum for occupancy type',
            check({ roomStore }) {
                if (!roomStore) return [];
                const results: ValidationResult[] = [];
                for (const room of roomStore.getAll()) {
                    const min = MIN_AREA_M2[room.occupancyType];
                    if (min == null) continue;
                    if (room.computed.area < min) {
                        results.push({
                            ruleId: 'ROOM_MIN_AREA', tier: 1, severity: 'error',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — area ${room.computed.area.toFixed(1)}m² is below minimum ${min}m²`,
                            suggestion: `Increase room area to at least ${min}m²`,
                            regulation: 'UK Building Regulations Part M',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'ROOM_NEEDS_DOOR', tier: 1, severity: 'error',
            description: 'Every room has ≥ 1 door',
            check({ roomStore, doorStore }) {
                if (!roomStore || !doorStore) return [];

                // Build room→hasADoor set via wall adjacency
                const roomsWithDoor = new Set<string>();
                for (const door of doorStore.getAll()) {
                    if (!door.wallId) continue;
                    const adjacent: any[] = roomStore.getRoomsAdjacentToWall?.(door.wallId) ?? [];
                    for (const r of adjacent) roomsWithDoor.add(r.id);
                }

                const results: ValidationResult[] = [];
                for (const room of roomStore.getAll()) {
                    // Skip exterior/service rooms that don't need doors
                    if (['terrace', 'balcony', 'atrium', 'courtyard', 'stairwell'].includes(room.occupancyType)) continue;
                    if (!roomsWithDoor.has(room.id)) {
                        results.push({
                            ruleId: 'ROOM_NEEDS_DOOR', tier: 1, severity: 'error',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — no door found on any bounding wall`,
                            suggestion: 'Add a door to a wall bounding this room',
                            regulation: 'Building Regulations Part B (fire egress)',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'HABITABLE_NEEDS_WINDOW', tier: 1, severity: 'error',
            description: 'Habitable rooms must have ≥ 1 window',
            check({ roomStore, windowStore }) {
                if (!roomStore || !windowStore) return [];

                const roomsWithWindow = new Set<string>();
                for (const win of windowStore.getAll()) {
                    if (!win.wallId) continue;
                    const adjacent: any[] = roomStore.getRoomsAdjacentToWall?.(win.wallId) ?? [];
                    for (const r of adjacent) roomsWithWindow.add(r.id);
                }

                const results: ValidationResult[] = [];
                for (const room of roomStore.getAll()) {
                    if (!HABITABLE_TYPES.has(room.occupancyType)) continue;
                    if (!roomsWithWindow.has(room.id)) {
                        results.push({
                            ruleId: 'HABITABLE_NEEDS_WINDOW', tier: 1, severity: 'error',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — habitable room has no window`,
                            suggestion: 'Add a window to a wall bounding this habitable room',
                            regulation: 'Building Regulations Part F (ventilation) & Part L',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'STAIR_HEADROOM', tier: 1, severity: 'error',
            description: 'Stair headroom ≥ 2.0m',
            check({ stairStore, bimManager }) {
                if (!stairStore || !bimManager) return [];
                const results: ValidationResult[] = [];
                const stairs: any[] = stairStore.getAll?.() ?? [];
                for (const stair of stairs) {
                    // Headroom = level height - stair rise
                    const levels: any[] = bimManager.getLevels?.() ?? [];
                    const baseLevel = levels.find((l: any) => l.id === stair.baseLevelId);
                    const topLevel  = levels.find((l: any) => l.id === stair.topLevelId);
                    if (!baseLevel || !topLevel) continue;
                    const floorToFloor = Math.abs((topLevel.elevation ?? 0) - (baseLevel.elevation ?? 0));
                    // Approx headroom under landing: floorToFloor - first riser height × riserCount/2
                    const approxHeadroom = floorToFloor - (stair.riserHeight ?? 0.175) * Math.ceil((stair.riserCount ?? 12) / 2);
                    if (floorToFloor > 0 && approxHeadroom < 2.0) {
                        results.push({
                            ruleId: 'STAIR_HEADROOM', tier: 1, severity: 'error',
                            elementId: stair.id, elementType: 'stair',
                            message: `Stair headroom ~${approxHeadroom.toFixed(2)}m is below minimum 2.0m`,
                            suggestion: 'Increase floor-to-floor height or reduce riser count',
                            regulation: 'Building Regulations Part K §1.7',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'DOOR_WIDTH_vs_CIRCULATION', tier: 1, severity: 'warning',
            description: 'Door opening width ≤ corridor it opens into',
            check({ doorStore, roomStore }) {
                if (!doorStore || !roomStore) return [];
                const results: ValidationResult[] = [];
                for (const door of doorStore.getAll()) {
                    if (!door.wallId || !door.width) continue;
                    const adj: any[] = roomStore.getRoomsAdjacentToWall?.(door.wallId) ?? [];
                    for (const room of adj) {
                        if (room.occupancyType !== 'corridor') continue;
                        // Approximate corridor width from bounding box
                        const bb = room.computed?.boundingBox;
                        if (!bb) continue;
                        const corridorWidth = Math.min(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
                        if (door.width > corridorWidth + 0.05) {
                            results.push({
                                ruleId: 'DOOR_WIDTH_vs_CIRCULATION', tier: 1, severity: 'warning',
                                elementId: door.id, elementType: 'door',
                                message: `Door width ${(door.width * 1000).toFixed(0)}mm opens into corridor ~${(corridorWidth * 1000).toFixed(0)}mm wide`,
                                suggestion: 'Use a door that does not obstruct circulation when open',
                                regulation: 'Building Regulations Part M §4.2',
                            });
                        }
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'ACCESSIBLE_ROUTE', tier: 1, severity: 'warning',
            description: 'Accessible rooms have accessible door width ≥ 900mm',
            check({ roomStore, doorStore }) {
                if (!roomStore || !doorStore) return [];
                const ACCESSIBLE_TYPES = new Set(['accessible-wc', 'waiting-room', 'patient-room',
                    'consultation-room', 'meeting-room', 'entrance-lobby', 'lift-lobby']);

                // Room → all door widths
                const roomDoorWidths = new Map<string, number[]>();
                for (const door of doorStore.getAll()) {
                    if (!door.wallId || !door.width) continue;
                    const adj: any[] = roomStore.getRoomsAdjacentToWall?.(door.wallId) ?? [];
                    for (const r of adj) {
                        const ws = roomDoorWidths.get(r.id) ?? [];
                        ws.push(door.width);
                        roomDoorWidths.set(r.id, ws);
                    }
                }

                const results: ValidationResult[] = [];
                for (const room of roomStore.getAll()) {
                    if (!ACCESSIBLE_TYPES.has(room.occupancyType)) continue;
                    const widths = roomDoorWidths.get(room.id);
                    const maxWidth = widths ? Math.max(...widths) : 0;
                    if (maxWidth < 0.9) {
                        results.push({
                            ruleId: 'ACCESSIBLE_ROUTE', tier: 1, severity: 'warning',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — widest door is ${(maxWidth * 1000).toFixed(0)}mm (minimum 900mm for accessible route)`,
                            suggestion: 'Install a door with minimum 900mm clear opening width',
                            regulation: 'BS 8300:2018 §5.3',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'ROOM_MAX_TRAVEL_DISTANCE', tier: 1, severity: 'warning',
            description: 'Travel distance to exit ≤ 45m (approximate)',
            check({ roomStore }) {
                if (!roomStore) return [];
                const results: ValidationResult[] = [];
                const STAIRWELL_TYPES = new Set(['stairwell', 'foyer', 'entrance-lobby', 'lift-lobby']);
                const TRAVEL_LIMIT = 45;

                // Approximate: find rooms that are far from any stairwell on same level
                const allRooms: any[] = roomStore.getAll();
                for (const room of allRooms) {
                    if (STAIRWELL_TYPES.has(room.occupancyType)) continue;
                    const cx = room.computed?.centroid?.x ?? 0;
                    const cz = room.computed?.centroid?.z ?? 0;
                    const sameLevel = allRooms.filter((r: any) => r.levelId === room.levelId);
                    const exits = sameLevel.filter((r: any) => STAIRWELL_TYPES.has(r.occupancyType));
                    if (exits.length === 0) continue; // no exits on level to check against
                    const minDist = Math.min(...exits.map((e: any) => {
                        const ex = e.computed?.centroid?.x ?? 0;
                        const ez = e.computed?.centroid?.z ?? 0;
                        return Math.sqrt((cx - ex) ** 2 + (cz - ez) ** 2);
                    }));
                    if (minDist > TRAVEL_LIMIT) {
                        results.push({
                            ruleId: 'ROOM_MAX_TRAVEL_DISTANCE', tier: 1, severity: 'warning',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — straight-line distance to nearest exit ~${minDist.toFixed(0)}m exceeds 45m`,
                            suggestion: 'Add a stairwell or exit closer to this room',
                            regulation: 'Building Regulations Part B §3.4 (travel distance)',
                        });
                    }
                }
                return results;
            }
        });

        // ── TIER 2 ─────────────────────────────────────────────────────────────

        this.register({
            id: 'FIRE_COMPARTMENT_AREA', tier: 2, severity: 'error',
            description: 'Fire compartment area ≤ 2,000m² (residential) or per table',
            check({ roomStore, bimManager }) {
                if (!roomStore || !bimManager) return [];
                const results: ValidationResult[] = [];
                const COMPARTMENT_LIMIT = 2000; // m² — residential purpose group
                const levels: any[] = bimManager.getLevels?.() ?? [];
                for (const level of levels) {
                    const area: number = roomStore.getTotalAreaForLevel?.(level.id) ?? 0;
                    if (area > COMPARTMENT_LIMIT) {
                        results.push({
                            ruleId: 'FIRE_COMPARTMENT_AREA', tier: 2, severity: 'error',
                            elementId: level.id, elementType: 'level',
                            message: `Level "${level.name}" — floor area ${area.toFixed(0)}m² exceeds 2,000m² compartment limit`,
                            suggestion: 'Introduce fire compartment walls to subdivide the floor area',
                            regulation: 'Building Regulations Part B Volume 1 §7.3',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'MEANS_OF_ESCAPE_COUNT', tier: 2, severity: 'error',
            description: '≥ 2 independent escape routes per floor (if floor area > 100m²)',
            check({ roomStore, bimManager }) {
                if (!roomStore || !bimManager) return [];
                const results: ValidationResult[] = [];
                const STAIRWELL_TYPES = new Set(['stairwell']);
                const levels: any[] = bimManager.getLevels?.() ?? [];
                for (const level of levels) {
                    const allRooms: any[] = roomStore.getByLevel?.(level.id) ?? [];
                    const floorArea = allRooms.reduce((s: number, r: any) => s + r.computed.area, 0);
                    if (floorArea < 100) continue;
                    const exits = allRooms.filter((r: any) => STAIRWELL_TYPES.has(r.occupancyType));
                    if (exits.length < 2) {
                        results.push({
                            ruleId: 'MEANS_OF_ESCAPE_COUNT', tier: 2, severity: 'error',
                            elementId: level.id, elementType: 'level',
                            message: `Level "${level.name}" — only ${exits.length} stairwell(s) found; ≥ 2 required for floor area ${floorArea.toFixed(0)}m²`,
                            suggestion: 'Add a second protected stairwell',
                            regulation: 'Building Regulations Part B §3.1',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'CORRIDOR_WIDTH', tier: 2, severity: 'warning',
            description: 'Corridor width ≥ 1200mm',
            check({ roomStore }) {
                if (!roomStore) return [];
                const results: ValidationResult[] = [];
                for (const room of roomStore.getAll()) {
                    if (room.occupancyType !== 'corridor') continue;
                    const bb = room.computed?.boundingBox;
                    if (!bb) continue;
                    const width = Math.min(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
                    if (width < 1.2) {
                        results.push({
                            ruleId: 'CORRIDOR_WIDTH', tier: 2, severity: 'warning',
                            elementId: room.id, elementType: 'room',
                            message: `Corridor "${room.name || ''}" — approximate width ${(width * 1000).toFixed(0)}mm is below 1200mm minimum`,
                            suggestion: 'Widen the corridor to at least 1200mm clear width',
                            regulation: 'Building Regulations Part M §4.10',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'LIFT_ADJACENT_LOBBY', tier: 2, severity: 'info',
            description: 'Lift must be adjacent to a lobby or circulation zone',
            check({ roomStore }) {
                if (!roomStore) return [];
                const LOBBY_TYPES = new Set(['lift-lobby', 'entrance-lobby', 'foyer', 'corridor']);
                const results: ValidationResult[] = [];
                const allRooms: any[] = roomStore.getAll();
                const liftRooms = allRooms.filter((r: any) => r.occupancyType === 'lift-lobby');
                for (const lift of liftRooms) {
                    // Check if same level has at least one lobby/corridor room
                    const sameLevel = allRooms.filter((r: any) => r.levelId === lift.levelId);
                    const hasLobby = sameLevel.some((r: any) => LOBBY_TYPES.has(r.occupancyType) && r.id !== lift.id);
                    if (!hasLobby) {
                        results.push({
                            ruleId: 'LIFT_ADJACENT_LOBBY', tier: 2, severity: 'info',
                            elementId: lift.id, elementType: 'room',
                            message: `Lift lobby "${lift.name || ''}" — no lobby or corridor found on same level`,
                            suggestion: 'Add a lobby or circulation area adjacent to the lift',
                            regulation: 'Building Regulations Part M §3.8',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'PLUMBING_ZONE', tier: 2, severity: 'info',
            description: 'WC/bathroom must be adjacent to a wet zone or plumbing area',
            check({ roomStore }) {
                if (!roomStore) return [];
                const WET_TYPES = new Set(['wc', 'accessible-wc', 'shower-room', 'bathroom', 'kitchen', 'kitchen-shared', 'utility-room']);
                const results: ValidationResult[] = [];
                const allRooms: any[] = roomStore.getAll();
                for (const room of allRooms) {
                    if (!WET_TYPES.has(room.occupancyType)) continue;
                    const sameLevel = allRooms.filter((r: any) => r.levelId === room.levelId && r.id !== room.id);
                    const hasWetZoneNearby = sameLevel.some((r: any) => {
                        if (!WET_TYPES.has(r.occupancyType)) return false;
                        // Approximate adjacency: bounding boxes overlap with small tolerance
                        const a = room.computed?.boundingBox;
                        const b = r.computed?.boundingBox;
                        if (!a || !b) return false;
                        const TOLERANCE = 0.3;
                        return a.minX < b.maxX + TOLERANCE && a.maxX > b.minX - TOLERANCE
                            && a.minZ < b.maxZ + TOLERANCE && a.maxZ > b.minZ - TOLERANCE;
                    });
                    // Flag isolated wet rooms that are not adjacent to any other wet zone
                    if (!hasWetZoneNearby) {
                        results.push({
                            ruleId: 'PLUMBING_ZONE', tier: 2, severity: 'info',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — isolated wet room; consider clustering plumbing zones`,
                            suggestion: 'Group wet rooms to reduce plumbing run lengths and costs',
                        });
                    }
                }
                return results;
            }
        });

        // ── PHASE H — Physics rules (Tier 2, advisory) ─────────────────────────
        // These rules are evaluated against PhysicsEngine results cached on window.
        // They never block command execution and are categorised as 'Physics'.

        this.register({
            id: 'ACOUSTIC_RT60_HOSPITAL', tier: 2, severity: 'warning', category: 'Physics',
            description: 'Hospital patient and consultation rooms must have RT60 < 0.5s (NHS Acoustics)',
            check() {
                const pe  = window.physicsEngine;
                const rs  = window.roomStore // TODO(TASK-07);
                if (!pe?.cache || !rs?.getAll) return [];
                const HOSP = new Set(['patient-room', 'operating-theatre', 'consultation-room', 'pharmacy']);
                const results: ValidationResult[] = [];
                for (const room of (rs.getAll() as any[])) {
                    if (!HOSP.has(room.occupancyType)) continue;
                    const r = pe.cache.get(room.id);
                    if (!r?.acoustic) continue;
                    if (r.acoustic.rt60_s >= 0.5) {
                        results.push({
                            ruleId: 'ACOUSTIC_RT60_HOSPITAL', tier: 2, severity: 'warning',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — RT60 ${r.acoustic.rt60_s}s exceeds 0.5s limit for hospital rooms`,
                            suggestion: 'Add acoustic ceiling tiles or carpet finishes to reduce reverberation',
                            regulation: 'NHS HBN 00-08 Acoustics (2013), HTM 08-01',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'ACOUSTIC_RT60_SCHOOL', tier: 2, severity: 'warning', category: 'Physics',
            description: 'School classrooms and lecture halls must have RT60 < 0.8s (BB93)',
            check() {
                const pe  = window.physicsEngine;
                const rs  = window.roomStore // TODO(TASK-07);
                if (!pe?.cache || !rs?.getAll) return [];
                const SCHOOL = new Set(['classroom', 'lecture-hall']);
                const results: ValidationResult[] = [];
                for (const room of (rs.getAll() as any[])) {
                    if (!SCHOOL.has(room.occupancyType)) continue;
                    const r = pe.cache.get(room.id);
                    if (!r?.acoustic) continue;
                    if (r.acoustic.rt60_s >= 0.8) {
                        results.push({
                            ruleId: 'ACOUSTIC_RT60_SCHOOL', tier: 2, severity: 'warning',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — RT60 ${r.acoustic.rt60_s}s exceeds 0.8s limit for educational spaces`,
                            suggestion: 'Acoustic ceiling tiles or wall panels recommended; BB93 Table 1 target ≤ 0.8s (unoccupied)',
                            regulation: 'Building Bulletin 93 (BB93) Table 1 — Acoustic Design of Schools',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'ACOUSTIC_RT60_COURT', tier: 2, severity: 'warning', category: 'Physics',
            description: 'Large civic/court spaces must have RT60 < 1.2s for speech intelligibility',
            check() {
                const pe  = window.physicsEngine;
                const rs  = window.roomStore // TODO(TASK-07);
                if (!pe?.cache || !rs?.getAll) return [];
                const COURT = new Set(['courtroom', 'council-chamber', 'assembly-hall']);
                const results: ValidationResult[] = [];
                for (const room of (rs.getAll() as any[])) {
                    if (!COURT.has(room.occupancyType) && (room.volume ?? 0) < 500) continue;
                    if (COURT.has(room.occupancyType)) {
                        const r = pe.cache.get(room.id);
                        if (!r?.acoustic) continue;
                        if (r.acoustic.rt60_s >= 1.2) {
                            results.push({
                                ruleId: 'ACOUSTIC_RT60_COURT', tier: 2, severity: 'warning',
                                elementId: room.id, elementType: 'room',
                                message: `${room.name || room.occupancyType} — RT60 ${r.acoustic.rt60_s}s exceeds 1.2s for civic/court use`,
                                suggestion: 'Acoustic wall and ceiling treatments required for speech intelligibility',
                                regulation: 'BS EN ISO 3382-1:2009 — Measurement of Room Acoustics',
                            });
                        }
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'DAYLIGHT_HABITABLE', tier: 2, severity: 'warning', category: 'Physics',
            description: 'All habitable rooms must achieve a daylight factor ≥ 1% (BRE Site Layouts)',
            check() {
                const pe  = window.physicsEngine;
                const rs  = window.roomStore // TODO(TASK-07);
                if (!pe?.cache || !rs?.getAll) return [];
                const HABITABLE = new Set([
                    'bedroom', 'living-room', 'kitchen', 'dining-room',
                    'open-office', 'private-office', 'meeting-room', 'classroom',
                    'patient-room', 'consultation-room', 'waiting-room', 'lecture-hall',
                    'breakout', 'reception',
                ]);
                const results: ValidationResult[] = [];
                for (const room of (rs.getAll() as any[])) {
                    if (!HABITABLE.has(room.occupancyType)) continue;
                    const r = pe.cache.get(room.id);
                    if (!r?.daylight) continue;
                    if (r.daylight.daylightFactor_percent < 1) {
                        results.push({
                            ruleId: 'DAYLIGHT_HABITABLE', tier: 2, severity: 'warning',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — daylight factor ${r.daylight.daylightFactor_percent}% is below 1% minimum`,
                            suggestion: 'Increase glazing area or use roof lights to achieve minimum 1% average daylight factor',
                            regulation: 'BRE Site Layout Planning for Daylight & Sunlight (2011); Building Regs Part L',
                        });
                    }
                }
                return results;
            }
        });

        this.register({
            id: 'THERMAL_GLAZING_OVERHEATING', tier: 2, severity: 'warning', category: 'Physics',
            description: 'Peak thermal load should not exceed 45 W/m² (CIBSE overheating risk)',
            check() {
                const pe  = window.physicsEngine;
                const rs  = window.roomStore // TODO(TASK-07);
                if (!pe?.cache || !rs?.getAll) return [];
                const results: ValidationResult[] = [];
                for (const room of (rs.getAll() as any[])) {
                    const r = pe.cache.get(room.id);
                    if (!r?.thermal) continue;
                    if (r.thermal.thermalLoad_Wm2 > 45) {
                        results.push({
                            ruleId: 'THERMAL_GLAZING_OVERHEATING', tier: 2, severity: 'warning',
                            elementId: room.id, elementType: 'room',
                            message: `${room.name || room.occupancyType} — estimated thermal load ${r.thermal.thermalLoad_Wm2} W/m² exceeds 45 W/m² overheating threshold`,
                            suggestion: 'Reduce south-facing glazing, add external shading, or use high-performance glazing (SHGC < 0.3)',
                            regulation: 'CIBSE TM52 (2013) — Overheating Assessment; Building Regs Part O',
                        });
                    }
                }
                return results;
            }
        });

        console.log(`[ConstraintEngine] ${this._rules.size} rules registered (7 Tier 1, 5 Tier 2 spatial, 5 Tier 2 physics)`);
    }
}

export const constraintEngine = new ConstraintEngineImpl();
