// §04-STAIR-BUILDER-REBUILD-CONTRACT — Phase 4
// Uses THREE.Group (stairRoots) instead of single Mesh per stair.
// All colours come from ColourPalette — no hex literals inside.
// Builder is driven by eventBus subscriptions (§01-BIM-ENGINE-CORE §1.4) — no window.

import * as THREE from '@pryzm/renderer-three/three';
import { StairData, StairProperties, DEFAULT_STAIR_PROPERTIES } from './StairTypes';
import { StairStore } from './StairStore';
import { StairMaterialResolver } from './StairMaterialResolver';
import { StairStringerBuilder } from './StairStringerBuilder';
import { StairPlanRepresentation } from './StairPlanRepresentation';
import { StairTypeStore } from './StairTypeStore';

import { stairPlanSymbolRegistry } from '@pryzm/scene-committer';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface StairMeshData {
    treads: THREE.BufferGeometry[];
    risers: THREE.BufferGeometry[];
    stringers?: THREE.BufferGeometry[];
    combined: THREE.BufferGeometry;
}

export class StairMeshBuilder {
    private stairStore: StairStore;
    private stairRoots: Map<string, THREE.Group> = new Map();
    private previewRoot?: THREE.Group;
    private scene?: THREE.Scene;
    private materialResolver: StairMaterialResolver;
    private stringerBuilder: StairStringerBuilder;
    private planRep: StairPlanRepresentation;
    private typeStore?: StairTypeStore;
    /**
     * §STAIR-AUDIT-2026 F12 fix (FIXED 2026-04-25): every window listener
     * registered in the constructor stores its `removeEventListener`
     * counterpart here so `dispose()` can detach them on project switch.
     */
    private _disposers: Array<() => void> = [];

    constructor(
        stairStore: StairStore,
        scene?: THREE.Scene,
        typeStore?: StairTypeStore
    ) {
        this.stairStore = stairStore;
        this.scene = scene;
        this.typeStore = typeStore;
        this.materialResolver = new StairMaterialResolver();
        this.stringerBuilder = new StairStringerBuilder();
        this.planRep = new StairPlanRepresentation();

        // §01-BIM-ENGINE-CORE §1.4 — Builder is driven exclusively by window CustomEvents.
        // The store must never call the builder directly (§3.5 Store Is Data Only).
        //
        // §FIX-STAIR-EVENT-PAYLOAD (C11 §7.0): StairStore emits `bim-stair-added` /
        // `bim-stair-updated` / `bim-stair-removed` with a lightweight `{ id }`
        // payload (the F.events.18 / TASK-10 convention — the store is the
        // authoritative source). The handlers below previously read
        // `payload.stair` / `payload.stairId`, which `StairStore` never sends —
        // so the stair body mesh was NEVER built on creation. They now resolve the
        // StairData from the store by id, while still accepting an inline `.stair`
        // (the transform-drag `runtime.events` channel sends the full object).
        const resolveStair = (payload: { id?: string; stair?: unknown } | null | undefined): StairData | undefined => {
            if (payload?.stair) return payload.stair as StairData;
            return payload?.id ? this.stairStore?.get(payload.id) : undefined;
        };
        const onAdded = (e: Event) => {
            const stair = resolveStair((e as CustomEvent).detail);
            if (stair) this.updateStair(stair, false);
        };
        const onUpdated = (e: Event) => {
            const stair = resolveStair((e as CustomEvent).detail);
            if (stair) this.updateStair(stair, false);
        };
        const onRemoved = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const stairId = detail?.stairId ?? detail?.id;
            if (stairId) this.removeStair(stairId);
        };
        window.addEventListener('bim-stair-added', onAdded);
        window.addEventListener('bim-stair-updated', onUpdated);
        const _unsubStairUpdated = (window as any).runtime?.events?.on('bim-stair-updated', (payload: { id?: string; stair?: unknown }) => { // F.events.15
            const stair = resolveStair(payload);
            if (stair) this.updateStair(stair, false);
        });
        window.addEventListener('bim-stair-removed', onRemoved);
        this._disposers.push(
            () => window.removeEventListener('bim-stair-added', onAdded),
            () => window.removeEventListener('bim-stair-updated', onUpdated),
            () => _unsubStairUpdated?.(),
            () => window.removeEventListener('bim-stair-removed', onRemoved),
        );
    }

    setTypeStore(ts: StairTypeStore): void {
        this.typeStore = ts;
    }

    // ── Public API: build / update / remove ───────────────────────────────────

    updateStair(stair: StairData, isPreview: boolean = false): void {
        // §57 Day 4 (DAILY-USE 2026-05-21, Round 32) — capture _priorVersion
        // from the existing root BEFORE removeStair() nukes the stairRoots-map
        // entry. Same pattern Round 19 established for columns (and Round 31
        // recognised was already in place for doors/windows). Without this
        // capture, every rebuild would stamp version = 1 → NMEexporter's
        // proxy-cache key would never invalidate after the first build →
        // stale plan-view geometry after stair moves / property edits.
        // Defaults to 0 for the first build of any given stair.
        const _priorVersion: number =
            (this.stairRoots.get(stair.id)?.userData?.version as number | undefined) ?? 0;

        // §STAIR-PREVIEW-FLOW — pass isPreview so the per-build remove log is
        // silenced during the live drag preview (it fires on every rebuild).
        this.removeStair(stair.id, isPreview);

        if (!stair.startPosition || !stair.flights || stair.flights.length === 0) {
            console.warn('[StairMeshBuilder] Cannot build stair: missing startPosition or flights', stair);
            return;
        }

        const meshData = this.buildStairGeometry(stair, isPreview);
        if (!meshData.combined || meshData.combined.getAttribute('position') === null ||
            meshData.combined.getAttribute('position').count === 0) {
            console.warn('[StairMeshBuilder] Built empty geometry for stair', stair.id);
            return;
        }

        const mat = isPreview
            ? new THREE.MeshStandardMaterial({
                color: 0x42A5F5,
                transparent: true,
                opacity: 0.45
              })
            : this.materialResolver.getTreadMaterial(stair.properties ?? DEFAULT_STAIR_PROPERTIES);

        const mesh = new THREE.Mesh(meshData.combined, mat);
        mesh.name = `stair-mesh-${stair.id}`;

        const totalRiserCount = stair.riserCount || stair.flights.reduce((sum, f) => sum + f.riserCount, 0);

        const userData = {
            id: stair.id,
            elementId: stair.id,
            elementType: 'Stair',
            type: 'stair',
            modelId: 'model-default',
            selectable: !isPreview,
            baseLevelId: stair.baseLevelId,
            topLevelId: stair.topLevelId,
            levelId: stair.levelId || stair.baseLevelId,
            width: stair.width,
            riserCount: totalRiserCount,
            riserHeight: stair.riserHeight,
            treadDepth: stair.treadDepth,
            shape: stair.shape,
            fireRating: stair.fireRating,
            accessibilityType: stair.accessibilityType,
            typeId: stair.typeId,
            ifcData: stair.ifcData || { guid: crypto.randomUUID(), ifcClass: 'IfcStair' },
            // §57 Day 4 — monotonic per-build counter (captured BEFORE
            // removeStair() above). Mirrors WallFragmentBuilder.ts:668 /
            // SlabFragmentBuilder.ts:368 / RoofFragmentBuilder.ts:244 /
            // ColumnFragmentBuilder.ts:249 (Round 19). Enables the
            // NMEexporter's proxy-cache key to invalidate after every
            // rebuild — necessary precondition for promotion to
            // EdgeProjectorService.CACHEABLE_ELEMENT_TYPES.
            version: _priorVersion + 1,
        };

        const group = new THREE.Group();
        group.name = `stair-${stair.id}`;
        group.userData = { ...userData };
        mesh.userData = { ...userData };
        group.add(mesh);

        // ── Plan representation (walking line, break line, direction arrow) ─────
        // Added as children of the group so they travel with the stair.
        // Hidden by default — the view-mode handler in initScene shows them
        // only when a plan view (Top / Ground Floor) is active.
        //
        // Phase 5 Performance: objects are registered in stairPlanSymbolRegistry
        // so the view-activated handler can toggle them in O(k) without a
        // full scene.traverse() on every view switch.
        if (!isPreview) {
            const walkLine = this.planRep.buildWalkingLine(stair);
            walkLine.name = `stair-walk-line-${stair.id}`;
            walkLine.visible = false;
            walkLine.userData.levelId = stair.levelId || stair.baseLevelId;
            group.add(walkLine);
            stairPlanSymbolRegistry.register(walkLine);

            const breakLine = this.planRep.buildBreakLine(stair);
            breakLine.name = `stair-break-line-${stair.id}`;
            breakLine.visible = false;
            breakLine.userData.levelId = stair.levelId || stair.baseLevelId;
            group.add(breakLine);
            stairPlanSymbolRegistry.register(breakLine);

            const arrow = this.planRep.buildDirectionArrow(stair);
            arrow.name = `stair-arrow-${stair.id}`;
            arrow.visible = false;
            arrow.userData.levelId = stair.levelId || stair.baseLevelId;
            group.add(arrow);
            stairPlanSymbolRegistry.register(arrow);
        }

        this.stairRoots.set(stair.id, group);
        if (!isPreview) {
            elementRegistry.registerRoot(stair.id, group);
        }

        if (this.scene) {
            this.scene.add(group);
        }

        if (!isPreview) {
            console.log(`[StairMeshBuilder] Built group for stair ${stair.id} (${stair.shape}, ${totalRiserCount} risers, preview=${isPreview})`);
        }
    }

    removeStair(stairId: string, silentLog: boolean = false): void {
        const existing = this.stairRoots.get(stairId);
        if (existing) {
            if (this.scene) {
                this.scene.remove(existing);
            }
            existing.traverse(child => {
                // Phase 5: unregister plan-representation objects from the registry
                // so the O(k) view-activated handler does not reference stale objects.
                const t = child.userData?.type as string | undefined;
                if (
                    t === 'stair-walking-line' ||
                    t === 'stair-break-line' ||
                    t === 'stair-direction-arrow'
                ) {
                    stairPlanSymbolRegistry.unregister(child);
                }

                const asMesh = child as THREE.Mesh;
                const asLine = child as THREE.Line;
                if (asMesh.isMesh || asLine.isLine) {
                    asMesh.geometry?.dispose();
                    const mat = asMesh.material;
                    if (mat instanceof THREE.Material) {
                        mat.dispose();
                    } else if (Array.isArray(mat)) {
                        mat.forEach(m => m.dispose());
                    }
                }
            });
            this.stairRoots.delete(stairId);
            elementRegistry.unregisterRoot(stairId);
            if (!silentLog) {
                console.log(`[StairMeshBuilder] Removed group for stair ${stairId}`);
            }
        }
    }

    // ── Preview API ───────────────────────────────────────────────────────────

    buildPreview(stair: StairData): void {
        this.clearPreview();
        const meshData = this.buildStairGeometry(stair, true);
        if (!meshData.combined || meshData.combined.getAttribute('position') === null) return;

        const mat = new THREE.MeshStandardMaterial({
            color: 0x42A5F5,
            transparent: true,
            opacity: 0.45
        });
        const mesh = new THREE.Mesh(meshData.combined, mat);
        mesh.name = 'stair-preview';
        mesh.userData = { isPreview: true };

        this.previewRoot = new THREE.Group();
        this.previewRoot.name = 'stair-preview-group';
        this.previewRoot.userData = { isPreview: true };
        this.previewRoot.add(mesh);

        if (this.scene) {
            this.scene.add(this.previewRoot);
        }
    }

    clearPreview(): void {
        if (this.previewRoot) {
            if (this.scene) {
                this.scene.remove(this.previewRoot);
            }
            this.previewRoot.traverse(child => {
                if ((child as THREE.Mesh).isMesh) {
                    const m = child as THREE.Mesh;
                    m.geometry?.dispose();
                    if (m.material instanceof THREE.Material) m.material.dispose();
                }
            });
            this.previewRoot = undefined;
        }
    }

    rebuildAll(): void {
        const ids = Array.from(this.stairRoots.keys());
        ids.forEach(id => this.removeStair(id));

        const stairs = this.stairStore.getAll();
        stairs.forEach(stair => this.updateStair(stair));

        console.log(`[StairMeshBuilder] Rebuilt all ${stairs.length} stairs`);
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    getGroup(stairId: string): THREE.Group | undefined {
        return this.stairRoots.get(stairId);
    }

    getMesh(stairId: string): THREE.Mesh | undefined {
        const group = this.stairRoots.get(stairId);
        if (!group) return undefined;
        for (const child of group.children) {
            if ((child as THREE.Mesh).isMesh) return child as THREE.Mesh;
        }
        return undefined;
    }

    setScene(scene: THREE.Scene): void {
        this.scene = scene;
    }

    /**
     * §STAIR-AUDIT-2026 F12 fix (FIXED 2026-04-25): detaches all window
     * listeners and tears down geometry.  Must be called by `BimWorld` on
     * project switch to avoid leaking three listeners + a closure over the
     * previous `stairStore` / `materialResolver` / `stringerBuilder` / `scene`.
     */
    dispose(): void {
        this._disposers.forEach(d => {
            try { d(); } catch (e) { console.warn('[StairMeshBuilder] disposer failed', e); }
        });
        this._disposers = [];
        const ids = Array.from(this.stairRoots.keys());
        ids.forEach(id => this.removeStair(id));
        this.clearPreview();
    }

    // ── Geometry construction ─────────────────────────────────────────────────

    buildStairGeometry(stair: StairData, isPreview: boolean = false): StairMeshData {
        if (!isPreview) {
            console.log('[StairMeshBuilder] Building geometry for:', stair.id, stair.shape);
        }

        let effectiveProps: StairProperties = { ...DEFAULT_STAIR_PROPERTIES, ...stair.properties };

        if (stair.typeId && this.typeStore) {
            const typeDefaults = this.typeStore.resolveDefaults(stair.typeId);
            if (typeDefaults) {
                effectiveProps = { ...DEFAULT_STAIR_PROPERTIES, ...(typeDefaults as Partial<StairProperties>), ...stair.properties };
            }
        }

        const treads: THREE.BufferGeometry[] = [];
        const risers: THREE.BufferGeometry[] = [];

        const startVec = new THREE.Vector3(
            stair.startPosition.x,
            stair.startPosition.y,
            stair.startPosition.z
        );
        let currentPosition = startVec.clone();
        let currentElevation = stair.startPosition.y;

        const treadThickness = 0.05;
        const riserThickness = 0.02;

        // ── Direction-rotation helper ─────────────────────────────────────────
        // BoxGeometry default: X=width, Y=thickness, Z=depth (faces +Z).
        // rotationToDir() computes the Matrix4 that rotates +Z to the given XZ direction,
        // so applyMatrix4(rotationToDir(dir)) aligns any canonical geometry with that dir.
        const DEFAULT_FORWARD = new THREE.Vector3(0, 0, 1);
        const rotationToDir = (dir: THREE.Vector3): THREE.Matrix4 => {
            const flatDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
            if (flatDir.lengthSq() < 0.0001) return new THREE.Matrix4();
            const q = new THREE.Quaternion().setFromUnitVectors(DEFAULT_FORWARD, flatDir);
            return new THREE.Matrix4().makeRotationFromQuaternion(q);
        };

        stair.flights.forEach((flight, flightIndex) => {
            // U-shape second flight: override XZ position, keep currentElevation for Y.
            if (flight.startOverride) {
                currentPosition = new THREE.Vector3(
                    flight.startOverride.x,
                    stair.startPosition.y,
                    flight.startOverride.z
                );
            }

            const direction = new THREE.Vector3(
                flight.direction.x,
                flight.direction.y,
                flight.direction.z
            ).normalize();

            // Rotation matrix: aligns canonical +Z geometry to this flight's travel direction.
            const flatDir = new THREE.Vector3(direction.x, 0, direction.z).normalize();
            const rotMatrix = rotationToDir(direction);

            // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — honour per-flight tread depth
            // when present (set by StairPathAdapter for 2D-polyline-driven stairs)
            // so each flight occupies exactly its drawn segment length. Falls
            // back to the stair-wide nominal value for legacy callers.
            const flightTread = flight.treadDepth ?? stair.treadDepth;

            for (let i = 0; i < flight.riserCount; i++) {
                currentElevation += stair.riserHeight;

                // Advance position along the flight's travel direction (XZ only).
                currentPosition.add(flatDir.clone().multiplyScalar(flightTread));

                // ── Tread ────────────────────────────────────────────────────
                // Canonical: X=width (perp to travel), Y=thickness, Z=treadDepth (along +Z).
                // After rotMatrix: Z axis → flatDir, so treadDepth lies along travel direction.
                const treadGeometry = new THREE.BoxGeometry(stair.width, treadThickness, flightTread);
                treadGeometry.applyMatrix4(rotMatrix);
                const treadCenter = currentPosition.clone().setY(currentElevation - treadThickness / 2);
                treadGeometry.translate(treadCenter.x, treadCenter.y, treadCenter.z);
                treads.push(treadGeometry);

                // ── Riser ────────────────────────────────────────────────────
                // Canonical: X=width, Y=riserHeight, Z=riserThickness (thin face along +Z).
                // After rotMatrix: Z axis → flatDir, so riser face is perpendicular to travel.
                //
                // The riser sits at the BACK EDGE of tread i (= front edge of tread i-1).
                // currentPosition is the tread CENTRE, so the back edge is flightTread/2 behind.
                if (effectiveProps.riserVisible) {
                    const riserGeometry = new THREE.BoxGeometry(stair.width, stair.riserHeight, riserThickness);
                    riserGeometry.applyMatrix4(rotMatrix);
                    const riserCenter = currentPosition.clone()
                        .add(flatDir.clone().multiplyScalar(-flightTread / 2))
                        .setY(currentElevation - stair.riserHeight / 2);
                    riserGeometry.translate(riserCenter.x, riserCenter.y, riserCenter.z);
                    risers.push(riserGeometry);
                }

                // ── Nosing ───────────────────────────────────────────────────
                // Canonical: X=width, Y=nosingThickness, Z=nosingDepth (overhang along +Z).
                // After rotMatrix: Z axis → flatDir, nosing overhangs forward along travel.
                //
                // BUG-FIX §NOSING-01: The nosing must sit at the LEADING (forward) edge of
                // the tread, not near its centre.  currentPosition is the tread centre, so
                // the leading edge is +flightTread/2 forward; we then retreat nosingDepth/2
                // so the box is centred on that edge.
                if (effectiveProps.nosingType !== 'none') {
                    const nosingDepth = effectiveProps.nosingDepth;
                    const nosingThickness = 0.015;
                    const nosingGeometry = new THREE.BoxGeometry(stair.width, nosingThickness, nosingDepth);
                    nosingGeometry.applyMatrix4(rotMatrix);
                    const nosingCenter = currentPosition.clone()
                        .add(flatDir.clone().multiplyScalar(flightTread / 2 - nosingDepth / 2))
                        .setY(currentElevation + nosingThickness / 2);
                    nosingGeometry.translate(nosingCenter.x, nosingCenter.y, nosingCenter.z);
                    treads.push(nosingGeometry);
                }
            }

            // ── Landing after this flight ─────────────────────────────────────────
            if (stair.landings && stair.landings[flightIndex]) {
                const landing = stair.landings[flightIndex];
                const nextFlight = stair.flights[flightIndex + 1];

                // Distinguish U-style (180° switchback, runs adjacent) from L-style
                // (90° corner) by the angle between this and the next flight.
                // A negative dot product near -1 means anti-parallel (U landing).
                const nextDirVec = nextFlight
                    ? new THREE.Vector3(nextFlight.direction.x, 0, nextFlight.direction.z).normalize()
                    : null;
                const isUSwitchback = !!(nextDirVec && flatDir.dot(nextDirVec) < -0.7);

                if (isUSwitchback) {
                    // ── U-shape landing ──────────────────────────────────────────
                    // Run 1 and Run 2 are directly ADJACENT (no gap between them).
                    // The landing (landing.depth = 2 × stair.width) spans BOTH runs:
                    //   Run 1: perpDir 0 to -width  (left half of landing)
                    //   Run 2: perpDir -width to -2*width  (right half of landing)
                    //
                    // After rotationToDir(perpDir):
                    //   box-X (stair.width)   → flatDir   direction (flight 1 axis)
                    //   box-Z (landing.depth) → perpDir   direction (2*width total)
                    //
                    // Landing centre = currentPosition + perpDir*(width/2)
                    //   → near edge at currentPos + perpDir*0     = Run 1 centreline
                    //     but since box half-extent = depth/2 = width:
                    //   → near edge (+perpDir side) = currentPos + 0      = +width/2 offset = Run1 far edge ✓
                    //   → far  edge (-perpDir side) = currentPos - width/2 - width = Run2 far edge ✓
                    //
                    // In plain terms: centre at -width/2 in perpDir (left edge of Run 1)
                    // so the slab covers Run1 in +perpDir half and Run2 in -perpDir half.
                    //
                    // §STAIR-U-LANDING-SIDE (2026-06-09, ROOT B fix) — the perpDir must
                    // MIRROR the side flight 2 was actually placed on. flight 2's
                    // `startOverride` is offset perpendicular to flight 1 toward
                    // `stair.secondRunSide` (StairCreationController._computeUPerpDir /
                    // HouseLayoutExecutor._buildFlights, which folds the U toward the plate
                    // interior). The landing slab spans BOTH runs, so it must extend toward
                    // the SAME side — previously it was HARDCODED to LEFT (`-flatDir.z,
                    // flatDir.x`), so a RIGHT-fold U-stair drew the landing on the wrong
                    // side → it projected past the footprint even when the footprint rect
                    // (which absorbs flight 2's override on either side) was correct.
                    //   left  perp = (-flatDir.z, 0, +flatDir.x)   [legacy default]
                    //   right perp = (+flatDir.z, 0, -flatDir.x)
                    // `secondRunSide` absent / 'left' ⇒ byte-identical to the old path.
                    const perpDir = stair.secondRunSide === 'right'
                        ? new THREE.Vector3(flatDir.z, 0, -flatDir.x).normalize()
                        : new THREE.Vector3(-flatDir.z, 0, flatDir.x).normalize();
                    const landingRotMatrix = rotationToDir(perpDir);

                    // Shift the landing FORWARD so it begins at the far edge of the
                    // last tread of Run 1 (and the far edge of the first tread of Run 2).
                    // Both runs' top treads touch the landing's near flatDir edge. ✓
                    // Uses flightTread (per-flight) so a 2D-driven U-2 with non-default
                    // tread depth still aligns the landing edge with Run 1's last tread.
                    const flatShift = flatDir.clone().multiplyScalar(flightTread / 2 + stair.width / 2);
                    const landingGeometry = new THREE.BoxGeometry(stair.width, treadThickness, landing.depth);
                    landingGeometry.applyMatrix4(landingRotMatrix);
                    const landingCenter = currentPosition.clone()
                        .add(flatShift)
                        .add(perpDir.clone().multiplyScalar(stair.width / 2))
                        .setY(currentElevation - treadThickness / 2);
                    landingGeometry.translate(landingCenter.x, landingCenter.y, landingCenter.z);
                    treads.push(landingGeometry);
                    // Do NOT advance currentPosition — flight[1] sets it from startOverride.

                } else {
                    // ── L-shape (or I-shape mid-landing) ────────────────────────
                    // The landing is a rectangular platform at the corner connecting
                    // flight 1 and flight 2. After applying rotationToDir(nextDir):
                    //   box-X (stair.width)   → flatDir direction (flight 1's axis)
                    //   box-Z (landing.depth) → nextDir direction (flight 2's axis)
                    //
                    // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — TWO LAYOUT MODES:
                    //
                    // (A) Corner-pinned mode (used by 2D-polyline-driven stairs):
                    //     `nextFlight.startOverride` is set to the user-drawn polyline
                    //     corner.  With per-flight tread depth (also provided by the
                    //     adapter), `currentPosition` after flight 1 already equals
                    //     the polyline corner B.  Place the landing CENTRED on the
                    //     corner so the 3D footprint matches the 2D preview exactly.
                    //     We do NOT advance currentPosition — flight 2's startOverride
                    //     takes over.
                    //
                    // (B) Auto-advance mode (legacy StairCreationController flow):
                    //     no startOverride on the next flight.  Place the landing at
                    //     `currentPosition + flatDir*(tread/2 + width/2)` so it begins
                    //     at the far edge of the last tread, then advance currentPosition
                    //     past the landing into flight 2's start (with the half-tread
                    //     correction §LANDING-01 to butt the first tread against the
                    //     landing without a gap).
                    const nextDir = nextFlight
                        ? new THREE.Vector3(nextFlight.direction.x, 0, nextFlight.direction.z).normalize()
                        : flatDir.clone();
                    const landingRotMatrix = rotationToDir(nextDir);

                    const cornerPinned = !!nextFlight?.startOverride;

                    const landingGeometry = new THREE.BoxGeometry(stair.width, treadThickness, landing.depth);
                    landingGeometry.applyMatrix4(landingRotMatrix);

                    let landingCenter: THREE.Vector3;
                    if (cornerPinned) {
                        // Mode A — landing centred on the polyline corner.
                        //
                        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — when the 2D
                        // adapter reserves landing space inside each segment,
                        // currentPosition (= flight 1's end) is BEFORE the
                        // polyline corner by `width/2` along flight 1's dir.
                        // The adapter therefore passes `landing.center` set
                        // to the actual polyline corner so we can ignore the
                        // offset currentPosition here.  When the override is
                        // absent (legacy / no-consumption stairs) we fall back
                        // to currentPosition, which equals the corner under
                        // the old per-flight-tread scheme.
                        const cornerSrc = landing.center ?? {
                            x: currentPosition.x, y: currentPosition.y, z: currentPosition.z,
                        };
                        landingCenter = new THREE.Vector3(
                            cornerSrc.x,
                            currentElevation - treadThickness / 2,
                            cornerSrc.z,
                        );
                    } else {
                        // Mode B — legacy auto-advance.
                        const flatShift = flatDir.clone().multiplyScalar(flightTread / 2 + stair.width / 2);
                        landingCenter = currentPosition.clone()
                            .add(flatShift)
                            .setY(currentElevation - treadThickness / 2);
                    }
                    landingGeometry.translate(landingCenter.x, landingCenter.y, landingCenter.z);
                    treads.push(landingGeometry);

                    if (!cornerPinned) {
                        // BUG-FIX §LANDING-01: Advance currentPosition forward by flatShift,
                        // then advance nextDir by (depth/2 - flightTread/2).
                        //
                        // Without the flightTread/2 correction the first step of flight 2
                        // advances a full tread past the landing edge, leaving a half-tread
                        // gap between the landing and that first step.  Retreating by
                        // flightTread/2 here means the first step advance lands the tread
                        // centre exactly at (landing far edge + tread/2), i.e. the tread
                        // butts right up against the landing with no gap.
                        const flatShift = flatDir.clone().multiplyScalar(flightTread / 2 + stair.width / 2);
                        currentPosition
                            .add(flatShift)
                            .add(nextDir.clone().multiplyScalar(landing.depth / 2 - flightTread / 2));
                    }
                    // cornerPinned: do NOT advance — flight 2's startOverride sets it.
                }
            }
        });

        const stringerGeometries = isPreview ? [] : this.stringerBuilder.buildStringerGeometries(stair);

        const allGeometries = [...treads, ...risers, ...stringerGeometries];
        const combined = this.mergeGeometries(allGeometries);

        return { treads, risers, stringers: stringerGeometries, combined };
    }

    private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
        if (geometries.length === 0) {
            return new THREE.BufferGeometry();
        }

        const positions: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];
        let indexOffset = 0;

        for (const geometry of geometries) {
            const positionAttr = geometry.getAttribute('position');
            const normalAttr = geometry.getAttribute('normal');
            const indexAttr = geometry.getIndex();

            if (positionAttr) {
                for (let i = 0; i < positionAttr.count; i++) {
                    positions.push(positionAttr.getX(i), positionAttr.getY(i), positionAttr.getZ(i));
                }
            }
            if (normalAttr) {
                for (let i = 0; i < normalAttr.count; i++) {
                    normals.push(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
                }
            }
            if (indexAttr) {
                for (let i = 0; i < indexAttr.count; i++) {
                    indices.push(indexAttr.getX(i) + indexOffset);
                }
            }
            indexOffset += positionAttr ? positionAttr.count : 0;
        }

        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        if (indices.length > 0) {
            merged.setIndex(indices);
        }

        return merged;
    }
}
