import { BeamData, BeamSupport, BEAM_CONSTRAINTS } from './BeamTypes';
import { ProjectContext } from '../context/ProjectContext';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * §L-1087 — snap a delta-shifted world Y to the nanometre grid.
 *
 * WHY THIS EXISTS, MEASURED. `y += (newElevation - previousElevation)` is NOT
 * invertible in binary64: seeded at 2.6 and shifted +3 the result is exactly
 * 5.6, but shifting it back by -3 yields **2.5999999999999996**. So the undo of
 * a storey move would restore a record that is not the record the edit started
 * from — C84 EI-7 ("undo restores what the edit wrote") failing by 4e-16 m, and
 * failing PERMANENTLY, because every equality-based dirty check downstream would
 * then see a document that never returns to clean.
 *
 * Snapping to 1e-9 m removes exactly that float noise: it is a million times
 * finer than any tolerance this repo models with, and it leaves every coordinate
 * that lies on a decimal grid coarser than a nanometre — which is every authored
 * coordinate — bit-identical after a forward-and-back move. Stated honestly:
 * this is NOT a proof of invertibility for arbitrary doubles, it is a guarantee
 * for the domain (metre-magnitude coordinates on a decimal grid). A coordinate
 * carrying real sub-nanometre information would be quantised, and no BIM datum
 * carries any.
 *
 * `toFixed` rather than `Math.round(y * 1e9) / 1e9` because the multiplication
 * form silently degrades past |y| ~ 9e6 m, where `y * 1e9` leaves the exact
 * integer range of a double.
 */
function snapNanometre(y: number): number {
    return Number(y.toFixed(9));
}

export class BeamStore {
    private beams: Map<string, BeamData> = new Map();
    private projectContext: ProjectContext;

    constructor(projectContext: ProjectContext) {
        this.projectContext = projectContext;
        // §3.5 FIX: Removed 'bim-level-removed' auto-mutation listener from store.
        // Level-removal cascading is now handled by BeamLevelCleanupHandler (external).
    }

    /**
     * §3.5-compliant builder wiring: the builder subscribes to storeEventBus rather
     * than being called directly from mutation methods.
     * Store → storeEventBus → Builder  (not Store → Builder directly).
     */
    setBuilder(builder: { updateBeam: (beam: BeamData) => void; remove: (id: string) => void }): void {
        storeEventBus.subscribe((event) => {
            if (event.elementType !== 'beam') return;
            if (event.operation === 'create' || event.operation === 'update') {
                const beam = this.beams.get(event.elementId);
                if (beam) builder.updateBeam(beam);
            } else if (event.operation === 'delete') {
                builder.remove(event.elementId);
            }
        });
    }

    get activeLevelId(): string {
        return this.projectContext.activeLevelId;
    }

    add(beam: BeamData): void {
        beam.levelId = beam.levelId || this.activeLevelId;
        if (!beam.levelId) {
            throw new Error("Spatial Authority Violation: No active level selected for beam creation.");
        }
        beam.parentId = beam.levelId;
        
        // Initialize Mark property
        if (!beam.properties) beam.properties = {};
        if (!beam.properties.mark) {
            const count = this.beams.size + 1;
            beam.properties.mark = `BM${count.toString().padStart(3, '0')}`;
        }
        
        if (!beam.ifcData) {
            beam.ifcData = {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcBeam'
            };
        }

        this.beams.set(beam.id, beam);

        // §3.5: bimManager.registerElement() removed — spatial registration is the
        // responsibility of the Tool/Command layer, not the Store.
        storeEventBus.emit({ elementId: beam.id, elementType: 'beam', operation: 'create', timestamp: Date.now() });
        this.emitUpdate('add', beam);
    }

    get(id: string): BeamData | undefined {
        return this.beams.get(id);
    }

    /**
     * §L-1032 — `getById` alias, matching every other legacy element store.
     *
     * This store spelled its single-record read `get`, while `WallStore`,
     * `RoofStore`, `SlabStore`, `ColumnStore` and `CurtainWallStore` all spell it
     * `getById`. That divergence is not cosmetic: the level-change mirror's
     * `LegacyLevelMovableStore` (`apps/editor/src/engine/elementLevelChangedMirror.ts`)
     * declares `{ changeLevel, getById }` and its deps are typed with it **rather
     * than cast**, deliberately, so `tsc` is what proves the bridge is handed the
     * LEGACY store and not the plugin DTO store — a cast there would have made
     * the wiring un-checkable in exactly the place L-946's bug lived.
     *
     * So beam was the one family that could not satisfy the interface, for a
     * reason that had nothing to do with beams. The alias is the smaller repair:
     * widening the interface to `getById | get` would weaken the proof for all
     * twelve families to accommodate one store's naming.
     *
     * Returns the same reference `get()` does — same immutability contract, no
     * extra allocation. `get()` is kept; this is an addition, not a rename, so
     * no existing caller changes.
     */
    getById(id: string): BeamData | undefined {
        return this.beams.get(id);
    }

    getAll(): BeamData[] {
        return Array.from(this.beams.values());
    }

    getByLevel(levelId: string): BeamData[] {
        return this.getAll().filter(b => b.levelId === levelId);
    }

    getBySupport(supportId: string): BeamData[] {
        return this.getAll().filter(b => 
            b.startSupportId === supportId || b.endSupportId === supportId
        );
    }

    remove(id: string): boolean {
        const beam = this.beams.get(id);
        if (beam) {
            this.beams.delete(id);
            // §3.5: Builder must not be called from the store.
            // The builder responds to storeEventBus 'delete' events via DependencyResolver.
            storeEventBus.emit({ elementId: id, elementType: 'beam', operation: 'delete', timestamp: Date.now() });
            this.emitUpdate('remove', beam);
            return true;
        }
        return false;
    }

    update(id: string, updates: Partial<BeamData>): boolean {
        const beam = this.beams.get(id);
        if (beam) {
            const updated = { ...beam, ...updates };
            this.beams.set(id, updated);
            // §3.5: Builder must not be called from the store.
            // The builder responds to storeEventBus 'update' events via DependencyResolver.
            storeEventBus.emit({ elementId: id, elementType: 'beam', operation: 'update', timestamp: Date.now() });
            this.emitUpdate('update', updated);
            return true;
        }
        return false;
    }

    /**
     * §L-1032 — MOVE a beam to a different storey.
     *
     * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
     * `update()` above is a shallow MERGE — `{ ...beam, ...updates }`
     * (`BeamStore.ts:98-110`), which is exactly what
     * `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts` declares for
     * this store (`beam: { semantics: 'merge', evidence: 'BeamStore.ts:98-110' }`,
     * measured against the real class rather than read off a header). So unlike
     * the REPLACE stores a one-key `{levelId}` partial would not annihilate the
     * record here. It would still be WRONG, in two ways no caller can see:
     *
     *   • `add()` parents every beam to its storey (`beam.parentId = beam.levelId`,
     *     `:43`). A `{levelId}` merge leaves `parentId` pointing at the storey the
     *     beam just left, so the record disagrees with itself and the spatial tree
     *     keeps the stale edge.
     *   • `elementUndoStoreAdapter`'s §L-946 arm tests
     *     `typeof store.changeLevel === 'function'` BEFORE routing a `levelId`
     *     inverse patch. Without this method Ctrl+Z after a storey move falls
     *     through to the generic `update()` write — which moves `levelId` and
     *     leaves `parentId` behind, silently, and only on the undo leg, so the
     *     forward gesture looks correct and the model diverges on the way back.
     *
     * So the operation gets its own name, symmetric with `SlabStore.changeLevel`
     * (`packages/geometry-slab/src/SlabStore.ts:314`) and `RoofStore.changeLevel`
     * (`packages/geometry-roof/src/RoofStore.ts:153`).
     *
     * ─── WHY ONE 'update' AND NOT 'remove' + 'add' ──────────────────────────
     * `add()` mints `properties.mark` from `this.beams.size` and issues an IFC
     * GUID when either is absent (`:45-57`), so a remove+add round trip would
     * RENUMBER the beam and could re-issue its GUID — a move is not a delete. A
     * beam carries no join state, so one 'update' is everything the renderer needs.
     *
     * ─── §L-1087 — THE HEIGHT MOVES HERE, AND IT MOVES BY A DELTA ───────────
     * ⚠ THIS DOC COMMENT USED TO CLAIM *"the fragment builder re-derives its
     * world Y from `level.elevation` on every 'update'"*. **MEASURED FALSE.**
     * `BeamFragmentBuilder` seats the root at
     * `root.position.set(centre.x, centre.y, centre.z)`
     * (`packages/geometry-beam/src/BeamFragmentBuilder.ts:405`) where `centre.y`
     * is `(start.y + end.y) * 0.5` (`:352-356`) — the record's OWN absolute Y.
     * The file contains **no `getLevelById` call at all** (`grep -c getLevelById`
     * → 0). So a storey change that touched only `levelId` re-filed the beam on
     * the new plan, in the level browser and in IFC containment, and left the
     * mesh hovering at the OLD floor's height. Nothing reported a failure. That
     * is the silently-wrong element `WallRake.ts:50-62` forbids, and it is why
     * `beam` sat in `LEVEL_CHANGE_REFUSALS` with `disposition: 'deferred'`.
     *
     * The height now moves, under three rules that are each load-bearing:
     *
     *   • **The store never reaches for a level table.** It receives NUMBERS.
     *     This class holds a `ProjectContext` (`:9`) but that is the ACTIVE
     *     level, not the destination's elevation, and reading a level table here
     *     would put a second authority for "what is this storey's elevation"
     *     inside a store (C84 EI-9). The caller — which already holds the
     *     `bimManager` handle on both the forward and the inverse leg — resolves
     *     both elevations from the LEVEL AUTHORITY and hands them down.
     *   • **Missing elevations REFUSE.** Moving `levelId` while silently leaving
     *     `startPoint.y`/`endPoint.y` behind is the exact defect above, so an
     *     absent or non-finite elevation returns `undefined` and warns. A caller
     *     that gets `undefined` reports a NAMED refusal; a caller that got a
     *     half-move reported success. Fabricating an elevation instead would be
     *     §DIAG-WALL-LEVEL in a new place.
     *   • **DELTA, not assignment.** `y += (newElevation - previousElevation)`.
     *     A beam is rarely AT its floor datum — it sits at soffit height, near
     *     the top of the storey. `y = newElevation` would slam every beam to
     *     floor level; the delta preserves whatever offset above its floor the
     *     beam was authored with. Both endpoints move, because a beam's Y lives
     *     in `startPoint.y`/`endPoint.y` (`BeamTypes.ts:6-7`) — there is no
     *     `position` on this record.
     *
     * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
     * Spatial-authority registration (bimManager `level.childrenIds`, the
     * view-dependency element→level map) is NOT updated here — identical to the
     * contract `SlabStore.changeLevel` and `RoofStore.changeLevel` both state in
     * their own doc comments. `apps/editor/src/engine/elementLevelChangedMirror.ts`
     * owns that half, and it owns it for EVERY family so the ordering rule (move
     * the record FIRST, re-register SECOND, dirty BOTH storeys THIRD) lives in one
     * place rather than in thirteen stores.
     *
     * `metadata` is deliberately NOT stamped: no method in this store has ever
     * written it (`add`/`update`/`remove` all leave it alone), so bumping a
     * version counter here would mint a field this family does not carry.
     *
     * Returns the moved record, or `undefined` when there is nothing to move —
     * which the caller reports as a refusal rather than logging success over a
     * no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(
        id: string,
        newLevelId: string,
        opts?: { newElevation?: number; previousElevation?: number },
    ): BeamData | undefined {
        const existing = this.beams.get(id);
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to the active level.
        // `add()` may do `beam.levelId || this.activeLevelId` (`:39`) because a
        // NEW beam has no storey yet; applying the same fallback to a MOVE is the
        // §DIAG-WALL-LEVEL trap — it files the beam on whatever storey happens to
        // be open, usually the ground floor.
        if (!newLevelId) return undefined;
        // Already there: nothing moves, so nothing needs an elevation. This arm
        // is deliberately ABOVE the elevation gate — refusing a no-op for want of
        // a number that would be multiplied by zero would report a failure where
        // there is none.
        if (existing.levelId === newLevelId) return existing;

        // §L-1087 — THE ANTI-HALF-MOVE GATE. Without BOTH elevations this method
        // cannot move the height, and moving the storey ALONE is the defect, not
        // a partial success. Refuse, name why, leave the record untouched.
        const newElevation = opts?.newElevation;
        const previousElevation = opts?.previousElevation;
        if (typeof newElevation !== 'number' || !Number.isFinite(newElevation)
            || typeof previousElevation !== 'number' || !Number.isFinite(previousElevation)) {
            console.warn(
                `[BeamStore] §L-1087 REFUSED — beam '${id}' NOT moved to level '${newLevelId}'. ` +
                'changeLevel needs BOTH `previousElevation` and `newElevation`, resolved by the ' +
                'caller from the level authority (this store holds no level table and must never ' +
                'fabricate one — §DIAG-WALL-LEVEL). Got previousElevation=' +
                `${String(previousElevation)}, newElevation=${String(newElevation)}. ` +
                'Moving the storey without the height would leave the beam hovering at the old ' +
                "floor's level with nothing reporting it (BeamFragmentBuilder.ts:405).",
            );
            return undefined;
        }
        const deltaY = newElevation - previousElevation;

        // Same shallow-clone shape `update()` uses, so a move and a field edit
        // leave the map holding structurally identical objects — EXCEPT that the
        // two endpoint objects must be cloned explicitly. A shallow spread shares
        // them with `existing`, so `moved.startPoint.y += deltaY` would mutate the
        // PRE-mutation record too, and any caller holding it (the undo leg holds
        // exactly that) would see its "before" value silently become the "after".
        const moved: BeamData = {
            ...existing,
            levelId: newLevelId,
            startPoint: { ...existing.startPoint, y: snapNanometre(existing.startPoint.y + deltaY) },
            endPoint:   { ...existing.endPoint,   y: snapNanometre(existing.endPoint.y   + deltaY) },
        };
        // A beam parented to something ELSE than its storey keeps that parent.
        if (existing.parentId === existing.levelId) moved.parentId = newLevelId;

        this.beams.set(id, moved);

        storeEventBus.emit({ elementId: id, elementType: 'beam', operation: 'update', timestamp: Date.now() });
        // `emitUpdate` takes no `prevState`: this store's fan-out has never carried
        // one (`:250`), and widening its signature here would change the shape every
        // existing subscriber already receives.
        this.emitUpdate('update', moved);
        return moved;
    }

    calculateSpan(beam: BeamData): number {
        const dx = beam.endPoint.x - beam.startPoint.x;
        const dy = beam.endPoint.y - beam.startPoint.y;
        const dz = beam.endPoint.z - beam.startPoint.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    calculateSpanToDepthRatio(beam: BeamData): number {
        const span = this.calculateSpan(beam);
        return beam.depth > 0 ? span / beam.depth : Infinity;
    }

    validateBeamProportions(beam: BeamData): { 
        valid: boolean; 
        warnings: string[]; 
        errors: string[] 
    } {
        const warnings: string[] = [];
        const errors: string[] = [];
        const span = this.calculateSpan(beam);
        const ratio = this.calculateSpanToDepthRatio(beam);

        if (span < BEAM_CONSTRAINTS.MIN_SPAN) {
            errors.push(`Beam span ${span.toFixed(2)}m is below minimum ${BEAM_CONSTRAINTS.MIN_SPAN}m`);
        }

        if (span > BEAM_CONSTRAINTS.MAX_SPAN) {
            errors.push(`Beam span ${span.toFixed(2)}m exceeds maximum ${BEAM_CONSTRAINTS.MAX_SPAN}m`);
        }

        if (ratio > BEAM_CONSTRAINTS.MAX_SPAN_TO_DEPTH_RATIO) {
            errors.push(`Span-to-depth ratio ${ratio.toFixed(1)} exceeds maximum ${BEAM_CONSTRAINTS.MAX_SPAN_TO_DEPTH_RATIO}`);
        } else if (ratio > BEAM_CONSTRAINTS.RECOMMENDED_SPAN_TO_DEPTH_RATIO) {
            warnings.push(`Span-to-depth ratio ${ratio.toFixed(1)} exceeds recommended ${BEAM_CONSTRAINTS.RECOMMENDED_SPAN_TO_DEPTH_RATIO}`);
        }

        if (beam.depth < span * BEAM_CONSTRAINTS.MIN_DEPTH_RATIO) {
            warnings.push(`Beam depth may be insufficient for span. Consider depth >= ${(span * BEAM_CONSTRAINTS.MIN_DEPTH_RATIO).toFixed(2)}m`);
        }

        if (beam.width < BEAM_CONSTRAINTS.MIN_WIDTH) {
            errors.push(`Beam width ${beam.width.toFixed(2)}m is below minimum ${BEAM_CONSTRAINTS.MIN_WIDTH}m`);
        }

        if (beam.depth < BEAM_CONSTRAINTS.MIN_DEPTH) {
            errors.push(`Beam depth ${beam.depth.toFixed(2)}m is below minimum ${BEAM_CONSTRAINTS.MIN_DEPTH}m`);
        }

        return {
            valid: errors.length === 0,
            warnings,
            errors
        };
    }

    getSupportCount(beam: BeamData): number {
        let count = 0;
        if (beam.startSupportId) count++;
        if (beam.endSupportId) count++;
        return count;
    }

    hasValidSupports(beam: BeamData): boolean {
        return this.getSupportCount(beam) >= 2;
    }

    findPotentialSupports(
        point: { x: number; y: number; z: number },
        tolerance: number = 0.5
    ): BeamSupport[] {
        const supports: BeamSupport[] = [];
        
        const columnStore = window.columnStore; // TODO(TASK-08)
        if (columnStore) {
            const columns = columnStore.getAll?.() ?? [];
            for (const col of columns) {
                const dx = Math.abs(col.position.x - point.x);
                const dy = Math.abs(col.position.y - point.y);
                if (dx <= tolerance && dy <= tolerance) {
                    supports.push({
                        elementId: col.id,
                        elementType: 'column',
                        connectionPoint: { x: col.position.x, y: col.position.y, z: point.z }
                    });
                }
            }
        }

        const wallStore = window.wallStore; // TODO(TASK-08)
        if (wallStore) {
            const walls = wallStore.getAll?.() ?? [];
            for (const wall of walls) {
                if (wall.loadBearing && this.isPointNearWall(point, wall, tolerance)) {
                    supports.push({
                        elementId: wall.id,
                        elementType: 'wall',
                        connectionPoint: point
                    });
                }
            }
        }

        return supports;
    }

    private isPointNearWall(
        point: { x: number; y: number; z: number },
        wall: any,
        tolerance: number
    ): boolean {
        const wallLine = {
            x1: wall.start.x,
            y1: wall.start.y,
            x2: wall.end.x,
            y2: wall.end.y
        };

        const dx = wallLine.x2 - wallLine.x1;
        const dy = wallLine.y2 - wallLine.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        if (len === 0) return false;

        const t = Math.max(0, Math.min(1, 
            ((point.x - wallLine.x1) * dx + (point.y - wallLine.y1) * dy) / (len * len)
        ));

        const closestX = wallLine.x1 + t * dx;
        const closestY = wallLine.y1 + t * dy;

        const dist = Math.sqrt(
            Math.pow(point.x - closestX, 2) + 
            Math.pow(point.y - closestY, 2)
        );

        return dist <= tolerance + (wall.thickness || 0.2) / 2;
    }

    private emitUpdate(action: 'add' | 'update' | 'remove', beam: BeamData): void {
        _bus.emit('beam-store-update', { action, beam }); // F.events.17
        
        _bus.emit('ai-model-update', { source: 'BeamStore', action, elementType: 'beam', elementId: beam.id }); // F.events.17
    }
}
