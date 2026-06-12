import * as THREE from '@pryzm/renderer-three/three';
import { StairRailingConfig, RailingType } from './StairRailingTypes';
import { StairRailingStore } from './StairRailingStore';
import { StairStore } from './StairStore';
import { StairData } from './StairTypes';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export class StairRailingBuilder {
    private meshGroups: Map<string, THREE.Group> = new Map();
    private scene?: THREE.Scene;
    private stairStore?: StairStore;

    constructor(
        private railingStore: StairRailingStore,
        scene?: THREE.Scene,
        stairStore?: StairStore
    ) {
        this.scene = scene;
        this.stairStore = stairStore;

        window.addEventListener('bim-stair-railing-added', (e: Event) => {
            // §FIX-STAIR-RAILING-EVENT (C11 §7.0): StairRailingStore.add() emits a
            // lightweight `{ id }` notification — the store is the authoritative
            // source of the StairRailingConfig (see the §P0-A40 design note in
            // StairRailingStore: "consumers read the store"). The previous code
            // destructured `detail.railing`, which the store NEVER sends, so
            // `railing` was always undefined and EVERY railing mesh build was
            // silently skipped by the stairId guard below. Resolve from the store.
            const { id } = (e as CustomEvent<{ id: string }>).detail;
            const railing = id ? this.railingStore.get(id) : undefined;
            // Explicit guard before resolveStair() so any legacy path bypassing
            // canExecute (direct commandManager bridge, undo replay) surfaces a
            // loud traceable error rather than silently skipping buildRailing().
            // The authoritative rejection is in CreateStairRailingHandler.canExecute().
            if (!railing?.stairId) {
                console.error(
                    '[StairRailingBuilder] railing.stairId is undefined — skipping mesh build.',
                    'This indicates a handler validation bug, or the railing id is not in the store.',
                    'The authoritative rejection is in CreateStairRailingHandler.canExecute().',
                    { railingId: id },
                );
                return;
            }
            const stair = this.resolveStair(railing.stairId);
            if (stair) this.buildRailing(railing, stair);
        });

        window.addEventListener('bim-stair-railing-removed', (e: Event) => {
            // §FIX-STAIR-RAILING-EVENT: StairRailingStore.remove() and
            // CreateStairRailingCommand.undo() emit `{ id }` — not `{ railingId }`.
            const { id } = (e as CustomEvent<{ id: string }>).detail;
            if (id) this.removeRailing(id);
        });

        window.addEventListener('bim-stair-removed', (e: Event) => {
            // §FIX-STAIR-RAILING-EVENT: StairStore emits `{ id }`, not `{ stairId }`.
            const { id } = (e as CustomEvent<{ id: string }>).detail;
            if (id) this.railingStore.getByStairId(id).forEach(r => this.removeRailing(r.id));
        });

        // Parametric rebuild: when stair geometry params change, rebuild all its railings.
        // F.events.15 — runtime.events.on picks up dispatches from registerTransformDragHandler (snap-back).
        (window as any).runtime?.events?.on('bim-stair-updated', (payload: { id?: string; stair?: StairData }) => {
            // §FIX-STAIR-RAILING-EVENT: accept an inline `.stair` (transform-drag
            // channel) or resolve the `{ id }` form StairStore emits.
            const stair = payload?.stair ?? (payload?.id ? this.resolveStair(payload.id) : undefined);
            if (!stair) return;
            const railings = this.railingStore.getByStairId(stair.id);
            railings.forEach(r => {
                const effectiveRailing: StairRailingConfig = {
                    ...r,
                    railingType: stair.properties?.railingType ?? r.railingType ?? 'flat-bar',
                };
                this.buildRailing(effectiveRailing, stair);
            });
        });
        window.addEventListener('bim-stair-updated', (e: Event) => {
            // §FIX-STAIR-RAILING-EVENT: StairStore emits `bim-stair-updated` as `{ id }`.
            const detail = (e as CustomEvent<{ stair?: StairData; id?: string }>).detail;
            const stair = detail?.stair ?? (detail?.id ? this.resolveStair(detail.id) : undefined);
            if (!stair) return;
            const railings = this.railingStore.getByStairId(stair.id);
            railings.forEach(r => {
                // When the stair's properties.railingType is set (e.g. changed via the
                // property panel), it takes priority over the per-railing stored type so
                // that user changes propagate immediately on rebuild.
                const effectiveRailing: StairRailingConfig = {
                    ...r,
                    railingType: stair.properties?.railingType ?? r.railingType ?? 'flat-bar',
                };
                this.buildRailing(effectiveRailing, stair);
            });
        });
    }

    setStairStore(stairStore: StairStore): void {
        this.stairStore = stairStore;
    }

    private resolveStair(stairId: string): StairData | undefined {
        return this.stairStore?.getById(stairId) as StairData | undefined;
    }

    buildRailing(railing: StairRailingConfig, stair: StairData): void {
        // §89 (plan-view incremental projection) — capture the prior version
        // BEFORE removeRailing() drops the old group, then stamp +1 on the new
        // group below. This lets EdgeProjectorService's per-element projection
        // cache invalidate the railing on rebuild and HIT on unchanged
        // projections (same capture-then-+1 pattern as stair/beam/furniture).
        // Without a monotonic version the cache would serve stale railing
        // geometry (the #60 class of bug) — so this MUST land before
        // 'stair-railing' is added to CACHEABLE_ELEMENT_TYPES.
        const priorVersion =
            (this.meshGroups.get(railing.id)?.userData?.version as number | undefined) ?? 0;
        this.removeRailing(railing.id);

        const group = new THREE.Group();
        group.name = `stair-railing-${railing.id}`;

        const effectiveType: RailingType = railing.railingType
            ?? (stair.properties?.railingType)
            ?? 'flat-bar';

        if (effectiveType === 'none') {
            this.buildRailingType_none(group, railing, stair);
        } else if (effectiveType === 'glass-panel') {
            this.buildRailingType_glassPanel(group, railing, stair);
        } else if (effectiveType === 'circular') {
            this.buildRailingType_circular(group, railing, stair);
        } else {
            // 'flat-bar' (default)
            this.buildRailingType_flatBar(group, railing, stair);
        }

        group.userData = {
            id: railing.id,
            elementId: railing.id,
            elementType: 'stair-railing',
            stairId: railing.stairId,
            levelId: stair.levelId || stair.baseLevelId,
            selectable: false,
            version: priorVersion + 1, // §89 — per-element plan-projection cache key
        };

        group.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.userData = {
                    ...child.userData,
                    id: railing.id,
                    elementId: railing.id,
                    elementType: 'stair-railing',
                    stairId: railing.stairId,
                    levelId: stair.levelId || stair.baseLevelId,
                    selectable: false,
                };
            }
        });

        this.meshGroups.set(railing.id, group);
        this.scene?.add(group);
        elementRegistry.registerRoot(railing.id, group);

        console.log(`[StairRailingBuilder] Built railing ${railing.id} (${railing.side}, type=${effectiveType}) for stair ${railing.stairId} — ${stair.flights.length} flight(s)`);
    }

    // ── Shared flight-position tracker ─────────────────────────────────────────
    private resolveFlightPositions(railing: StairRailingConfig, stair: StairData): Array<{
        flightStart: THREE.Vector3;
        flatDir: THREE.Vector3;
        sideAxis: THREE.Vector3;
        offset: THREE.Vector3;
        totalRun: number;
        totalRise: number;
        landing: any;
        nextFlight: any;
        flightIndex: number;
        sideSign: number;
    }> {
        const sideSign = railing.side === 'left' ? 1 : -1;
        let trackPos = new THREE.Vector3(
            stair.startPosition.x,
            stair.startPosition.y,
            stair.startPosition.z
        );
        let trackElev = stair.startPosition.y;

        const result: Array<{
            flightStart: THREE.Vector3;
            flatDir: THREE.Vector3;
            sideAxis: THREE.Vector3;
            offset: THREE.Vector3;
            totalRun: number;
            totalRise: number;
            landing: any;
            nextFlight: any;
            flightIndex: number;
            sideSign: number;
        }> = [];

        stair.flights.forEach((flight, flightIndex) => {
            const dir = new THREE.Vector3(
                flight.direction.x,
                flight.direction.y,
                flight.direction.z
            ).normalize();
            const flatDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
            const sideAxis = new THREE.Vector3(-flatDir.z, 0, flatDir.x).normalize();
            const offset = sideAxis.clone().multiplyScalar(sideSign * (stair.width / 2));

            let flightStart: THREE.Vector3;
            if (flight.startOverride) {
                trackPos = new THREE.Vector3(
                    flight.startOverride.x,
                    stair.startPosition.y,
                    flight.startOverride.z
                );
                flightStart = new THREE.Vector3(trackPos.x, trackElev, trackPos.z);
            } else {
                flightStart = new THREE.Vector3(trackPos.x, trackElev, trackPos.z);
            }

            // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — honour per-flight tread depth.
            const flightTread = flight.treadDepth ?? stair.treadDepth;
            const totalRun = flight.riserCount * flightTread;
            const totalRise = flight.riserCount * stair.riserHeight;
            const landing = stair.landings?.[flightIndex];
            const nextFlight = stair.flights[flightIndex + 1];

            result.push({
                flightStart,
                flatDir,
                sideAxis,
                offset,
                totalRun,
                totalRise,
                landing,
                nextFlight,
                flightIndex,
                sideSign,
            });

            // Advance tracker for next flight
            trackPos.add(flatDir.clone().multiplyScalar(totalRun));
            if (landing) {
                if (nextFlight && !nextFlight.startOverride) {
                    // Legacy auto-advance: mirror StairMeshBuilder's auto-advance branch.
                    // When `nextFlight.startOverride` is set (corner-pinned mode), the
                    // next iteration's startOverride block sets trackPos to the corner.
                    const nextFlatDir = new THREE.Vector3(
                        nextFlight.direction.x, 0, nextFlight.direction.z
                    ).normalize();
                    trackPos
                        .add(flatDir.clone().multiplyScalar(flightTread / 2 + stair.width / 2))
                        .add(nextFlatDir.clone().multiplyScalar(landing.depth / 2 - flightTread / 2));
                }
            }
            trackElev += totalRise;
        });

        return result;
    }

    // ── Flat-bar type: rectangular top rail + square balusters ─────────────────
    private buildRailingType_flatBar(
        group: THREE.Group,
        railing: StairRailingConfig,
        stair: StairData
    ): void {
        const railMat = this.makeMaterial(railing.material, 0x7a5c38);
        const sideSign = railing.side === 'left' ? 1 : -1;

        const flights = this.resolveFlightPositions(railing, stair);
        flights.forEach(f => {
            const { flightStart, flatDir, offset, totalRun, totalRise } = f;
            const railHeight = railing.topRailHeight;

            // ── Top rail (flat rectangular profile along slope) ─────────────────
            const railW = 0.05;
            const railH = 0.03;
            const startPoint = flightStart.clone().add(offset).setY(flightStart.y + railHeight);
            const endPoint = flightStart.clone()
                .add(flatDir.clone().multiplyScalar(totalRun))
                .add(offset)
                .setY(flightStart.y + totalRise + railHeight);
            const railMesh = this.buildBoxRail(startPoint, endPoint, railW, railH, railMat.clone());
            group.add(railMesh);

            // ── Balusters (square profile) ──────────────────────────────────────
            const balSpacing = railing.balusterSpacing;
            const balCount = Math.max(1, Math.floor(totalRun / balSpacing));
            for (let i = 0; i <= balCount; i++) {
                const t = i / balCount;
                const balBaseElev = flightStart.y + t * totalRise;
                const balBasePos = flightStart.clone()
                    .add(flatDir.clone().multiplyScalar(t * totalRun))
                    .add(offset)
                    .setY(balBaseElev);
                const bw = railing.balusterWidth;
                const balGeom = new THREE.BoxGeometry(bw, railHeight, bw);
                const bal = new THREE.Mesh(balGeom, railMat.clone());
                bal.position.set(balBasePos.x, balBasePos.y + railHeight / 2, balBasePos.z);
                bal.userData.elementType = 'stair-railing';
                bal.userData.selectable = false;
                group.add(bal);
            }

            // ── Start/end posts ──────────────────────────────────────────────────
            if (railing.postAtStart && f.flightIndex === 0) {
                this.addPost(group, flightStart.clone().add(offset), flightStart.y, railHeight, 0.06, railMat.clone());
            }
            if (railing.postAtEnd) {
                const endBase = flightStart.clone()
                    .add(flatDir.clone().multiplyScalar(totalRun))
                    .add(offset);
                this.addPost(group, endBase, flightStart.y + totalRise, railHeight, 0.06, railMat.clone());
            }

            // ── Landing segment ──────────────────────────────────────────────────
            this.buildLandingSegment(group, f, railing, stair, sideSign, railMat.clone(), (s, e) => this.buildBoxRail(s, e, railW, railH, railMat.clone()), flights);
        });
    }

    // ── Circular type: round top rail + round balusters ────────────────────────
    private buildRailingType_circular(
        group: THREE.Group,
        railing: StairRailingConfig,
        stair: StairData
    ): void {
        const railMat = this.makeMaterial(railing.material, 0x7a5c38);
        const sideSign = railing.side === 'left' ? 1 : -1;

        const flights = this.resolveFlightPositions(railing, stair);
        flights.forEach(f => {
            const { flightStart, flatDir, offset, totalRun, totalRise } = f;
            const railHeight = railing.topRailHeight;

            // ── Top rail (round profile) ────────────────────────────────────────
            const startPoint = flightStart.clone().add(offset).setY(flightStart.y + railHeight);
            const endPoint = flightStart.clone()
                .add(flatDir.clone().multiplyScalar(totalRun))
                .add(offset)
                .setY(flightStart.y + totalRise + railHeight);
            const railGeom = this.buildRailGeometry(startPoint, endPoint, 0.025);
            const railMesh = new THREE.Mesh(railGeom, railMat.clone());
            railMesh.userData.elementType = 'stair-railing';
            railMesh.userData.selectable = false;
            group.add(railMesh);

            // ── Balusters (round profile) ────────────────────────────────────────
            const balSpacing = railing.balusterSpacing;
            const balCount = Math.max(1, Math.floor(totalRun / balSpacing));
            for (let i = 0; i <= balCount; i++) {
                const t = i / balCount;
                const balBaseElev = flightStart.y + t * totalRise;
                const balBasePos = flightStart.clone()
                    .add(flatDir.clone().multiplyScalar(t * totalRun))
                    .add(offset)
                    .setY(balBaseElev);
                const bw = railing.balusterWidth;
                const balGeom = new THREE.CylinderGeometry(bw / 2, bw / 2, railHeight, 8);
                const bal = new THREE.Mesh(balGeom, railMat.clone());
                bal.position.set(balBasePos.x, balBasePos.y + railHeight / 2, balBasePos.z);
                bal.userData.elementType = 'stair-railing';
                bal.userData.selectable = false;
                group.add(bal);
            }

            // ── Start/end posts ──────────────────────────────────────────────────
            if (railing.postAtStart && f.flightIndex === 0) {
                this.addPost(group, flightStart.clone().add(offset), flightStart.y, railHeight, 0.06, railMat.clone());
            }
            if (railing.postAtEnd) {
                const endBase = flightStart.clone()
                    .add(flatDir.clone().multiplyScalar(totalRun))
                    .add(offset);
                this.addPost(group, endBase, flightStart.y + totalRise, railHeight, 0.06, railMat.clone());
            }

            // ── Landing segment ──────────────────────────────────────────────────
            this.buildLandingSegment(group, f, railing, stair, sideSign, railMat.clone(), (s, e) => {
                const geom = this.buildRailGeometry(s, e, 0.025);
                const mesh = new THREE.Mesh(geom, railMat.clone());
                mesh.userData.elementType = 'stair-railing';
                mesh.userData.selectable = false;
                return mesh;
            }, flights);
        });
    }

    // ── Glass-panel type: rectangular top rail + glass panel infill ─────────────
    private buildRailingType_glassPanel(
        group: THREE.Group,
        railing: StairRailingConfig,
        stair: StairData
    ): void {
        const railMat = this.makeMaterial(railing.material, 0x888899);
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            transparent: true,
            opacity: 0.35,
            roughness: 0.1,
            metalness: 0.1,
            side: THREE.DoubleSide,
        });
        const sideSign = railing.side === 'left' ? 1 : -1;

        const flights = this.resolveFlightPositions(railing, stair);
        flights.forEach(f => {
            const { flightStart, flatDir, offset, totalRun, totalRise } = f;
            const railHeight = railing.topRailHeight;

            // ── Top rail ──────────────────────────────────────────────────────
            const startPoint = flightStart.clone().add(offset).setY(flightStart.y + railHeight);
            const endPoint = flightStart.clone()
                .add(flatDir.clone().multiplyScalar(totalRun))
                .add(offset)
                .setY(flightStart.y + totalRise + railHeight);
            const topRailMesh = this.buildBoxRail(startPoint, endPoint, 0.05, 0.04, railMat.clone());
            group.add(topRailMesh);

            // ── Bottom rail ────────────────────────────────────────────────────
            const botStart = flightStart.clone().add(offset).setY(flightStart.y + 0.1);
            const botEnd = flightStart.clone()
                .add(flatDir.clone().multiplyScalar(totalRun))
                .add(offset)
                .setY(flightStart.y + totalRise + 0.1);
            const botRailMesh = this.buildBoxRail(botStart, botEnd, 0.05, 0.04, railMat.clone());
            group.add(botRailMesh);

            // ── Glass panels (slope-following parallelogram quads) ───────────────
            // Each panel is built from its four world-space corners so the geometry
            // exactly tracks the stair slope — no quaternion baking required.
            const panelWidth = 0.6;
            const panelCount = Math.max(1, Math.floor(totalRun / panelWidth));
            const panelH = railHeight - 0.15;

            for (let i = 0; i < panelCount; i++) {
                const t0 = i / panelCount;
                const t1 = (i + 1) / panelCount;

                // Bottom edge follows the stringer (inclined with the stair)
                const baseL = flightStart.clone()
                    .add(flatDir.clone().multiplyScalar(t0 * totalRun))
                    .add(offset)
                    .setY(flightStart.y + t0 * totalRise + 0.05);
                const baseR = flightStart.clone()
                    .add(flatDir.clone().multiplyScalar(t1 * totalRun))
                    .add(offset)
                    .setY(flightStart.y + t1 * totalRise + 0.05);

                // Top edge is directly above the bottom edge (vertical lift)
                const topL = baseL.clone().setY(baseL.y + panelH);
                const topR = baseR.clone().setY(baseR.y + panelH);

                // Build as a quad (two triangles) from the four corners
                const positions = new Float32Array([
                    baseL.x, baseL.y, baseL.z,
                    baseR.x, baseR.y, baseR.z,
                    topR.x,  topR.y,  topR.z,
                    topL.x,  topL.y,  topL.z,
                ]);
                const panelGeom = new THREE.BufferGeometry();
                panelGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                panelGeom.setIndex([0, 1, 2, 0, 2, 3]);
                panelGeom.computeVertexNormals();

                const panelMesh = new THREE.Mesh(panelGeom, glassMat.clone());
                panelMesh.userData.elementType = 'stair-railing';
                panelMesh.userData.selectable = false;
                group.add(panelMesh);
            }

            // ── Start/end posts ──────────────────────────────────────────────────
            if (railing.postAtStart && f.flightIndex === 0) {
                this.addPost(group, flightStart.clone().add(offset), flightStart.y, railHeight, 0.05, railMat.clone());
            }
            if (railing.postAtEnd) {
                const endBase = flightStart.clone()
                    .add(flatDir.clone().multiplyScalar(totalRun))
                    .add(offset);
                this.addPost(group, endBase, flightStart.y + totalRise, railHeight, 0.05, railMat.clone());
            }

            // ── Landing segment ──────────────────────────────────────────────────
            this.buildLandingSegment(group, f, railing, stair, sideSign, railMat.clone(), (s, e) => this.buildBoxRail(s, e, 0.05, 0.04, railMat.clone()), flights);
        });
    }

    // ── None type: top rail only, no balusters ──────────────────────────────────
    private buildRailingType_none(
        group: THREE.Group,
        railing: StairRailingConfig,
        stair: StairData
    ): void {
        const railMat = this.makeMaterial(railing.material, 0x888899);
        const sideSign = railing.side === 'left' ? 1 : -1;

        const flights = this.resolveFlightPositions(railing, stair);
        flights.forEach(f => {
            const { flightStart, flatDir, offset, totalRun, totalRise } = f;
            const railHeight = railing.topRailHeight;

            const startPoint = flightStart.clone().add(offset).setY(flightStart.y + railHeight);
            const endPoint = flightStart.clone()
                .add(flatDir.clone().multiplyScalar(totalRun))
                .add(offset)
                .setY(flightStart.y + totalRise + railHeight);
            const geom = this.buildRailGeometry(startPoint, endPoint, 0.025);
            const mesh = new THREE.Mesh(geom, railMat.clone());
            mesh.userData.elementType = 'stair-railing';
            mesh.userData.selectable = false;
            group.add(mesh);

            this.buildLandingSegment(group, f, railing, stair, sideSign, railMat.clone(), (s, e) => {
                const g = this.buildRailGeometry(s, e, 0.025);
                const m = new THREE.Mesh(g, railMat.clone());
                m.userData.elementType = 'stair-railing';
                m.userData.selectable = false;
                return m;
            }, flights);
        });
    }

    // ── Shared landing segment builder ──────────────────────────────────────────
    // Builds the horizontal rail that connects the end of a flight to the start of
    // the next flight, bridging the landing gap.
    //
    // BUG-FIX §LANDING-L-SHAPE: For L-shape stairs the original code used `flatDir`
    // (the current flight direction) to advance along the landing. This placed the
    // endpoint of the landing segment in the wrong direction. The fix uses
    // `nextFlatDir` (the NEXT flight's direction), which is the axis along which
    // the landing platform extends.
    //
    // BUG-FIX §LANDING-U-SHAPE: For U-shape stairs the second flight uses a
    // startOverride whose XZ is already positioned so that the left railing
    // of flight 1 and the left railing of flight 2 terminate at the same physical
    // point. The right (outer) railing of flight 1 is on the OPPOSITE physical
    // side from the right (outer) railing of flight 2, so a direct connector would
    // span the full U width diagonally. Skipping the connector for U-shape (the
    // `startOverride` path) is the correct behaviour — the flights terminate with
    // end-cap posts and no landing segment is drawn.
    private buildLandingSegment(
        group: THREE.Group,
        f: ReturnType<StairRailingBuilder['resolveFlightPositions']>[0],
        railing: StairRailingConfig,
        stair: StairData,
        sideSign: number,
        _railMat: THREE.MeshStandardMaterial,
        buildSegment: (start: THREE.Vector3, end: THREE.Vector3) => THREE.Mesh,
        flights: ReturnType<StairRailingBuilder['resolveFlightPositions']>
    ): void {
        const { flightStart, flatDir, offset, totalRun, totalRise, landing, nextFlight } = f;
        if (!nextFlight || !landing) return;
        // §60/§46 — flight 2's resolved rail track (this railing's OWN next flight),
        // used to tie the guard's open-edge ends back into the run rails (continuity).
        const nextEntry = flights[f.flightIndex + 1];

        const railHeight = railing.topRailHeight;
        const flightEndElev = flightStart.y + totalRise;
        const flightEndPos = flightStart.clone()
            .add(flatDir.clone().multiplyScalar(totalRun))
            .add(offset);

        // ── U-shape half-landing guard (§U-LANDING-GUARD) ────────────────────────
        // For U (half-turn) stairs flight 2 uses a `startOverride`. The two flights'
        // rails run alongside the landing in `flatDir`, but the landing's OPEN
        // (exposed) edge — the forward edge in `flatDir`, running across in `perpDir`
        // — was previously left UNGUARDED (the original code returned here). That is
        // the founder-reported defect: balusters on both flights but none across the
        // half-landing. Emit a horizontal guard rail + balusters along that open
        // edge, connecting flight 1's top rail to flight 2's bottom rail.
        //
        // Geometry mirrors StairMeshBuilder's U landing slab (§STAIR-U-LANDING-SIDE):
        //   perpDir points toward `secondRunSide` (flight 2's side); the slab spans
        //   `flatDir` by `width` from flight 1's last-tread far edge, and `perpDir`
        //   by `landing.depth` (= 2*width). The open edge is the slab's forward
        //   `flatDir` edge, spanning from flight 1's OUTER rail line (perpDir*-width/2)
        //   to flight 2's OUTER rail line (perpDir*+3*width/2).
        if (nextFlight.startOverride) {
            this.buildULandingGuard(group, f, railing, stair, sideSign, buildSegment, nextEntry);
            return;
        }

        // L-shape: compute nextFlightStart using the SAME advance formula as
        // StairMeshBuilder §LANDING-01 and StairStringerBuilder §STRINGER-L-01.
        const nextFlatDir = new THREE.Vector3(
            nextFlight.direction.x, 0, nextFlight.direction.z
        ).normalize();
        const nextSideAxis = new THREE.Vector3(-nextFlatDir.z, 0, nextFlatDir.x).normalize();
        const nextOffset = nextSideAxis.clone().multiplyScalar(sideSign * (stair.width / 2));

        // BUG-FIX §LANDING-L-SHAPE-ENDPOINT: The old formula advanced by nextFlatDir*landing.depth
        // but the mesh builder advances by flatDir*(treadDepth/2+width/2) + nextDir*(landing.depth/2-treadDepth/2).
        // Using the wrong formula caused the landing segment's end point to miss the start of
        // flight 2's railing, leaving a visual gap / misalignment.
        const nextFlightStart = flightEndPos.clone()
            .sub(offset)
            .add(flatDir.clone().multiplyScalar(stair.treadDepth / 2 + stair.width / 2))
            .add(nextFlatDir.clone().multiplyScalar(landing.depth / 2 - stair.treadDepth / 2))
            .add(nextOffset)
            .setY(flightEndElev);

        const landingRailStart = new THREE.Vector3(
            flightEndPos.x, flightEndElev + railHeight, flightEndPos.z
        );
        const landingRailEnd = new THREE.Vector3(
            nextFlightStart.x, flightEndElev + railHeight, nextFlightStart.z
        );

        // Landing connector: project diff onto flatDir (D1 = flight 1's travel direction)
        // to determine the corner point.
        //
        //   Seg1: landingRailStart → corner  — runs along the landing in the D1 direction
        //                                       (i.e. follows the wall of flight 1 across
        //                                       the landing, NOT across the open walkway).
        //   Seg2: corner → landingRailEnd     — turns and advances in the D2 direction to
        //                                       reach flight 2's railing start.
        //
        // For the OUTER wall side projLen ≈ treadDepth/2 + width (large) → draw both segs.
        // For the INNER open side projLen ≈ treadDepth/2 (< treadDepth) → the corner is
        // just inside the landing edge, and any connector here blocks the walking path;
        // suppress it entirely so people can pass through the landing opening.
        const diff = landingRailEnd.clone().sub(landingRailStart);
        const flatDirH = new THREE.Vector3(flatDir.x, 0, flatDir.z).normalize();
        const projLen = flatDirH.dot(diff);

        if (projLen > stair.treadDepth) {
            // Outer wall side — follow flight 1's wall across the landing, then turn
            const corner = landingRailStart.clone().add(flatDirH.clone().multiplyScalar(projLen));
            if (landingRailStart.distanceTo(corner) > 0.05) {
                const seg1 = buildSegment(landingRailStart, corner);
                seg1.userData.elementType = 'stair-railing';
                seg1.userData.selectable = false;
                group.add(seg1);
            }
            if (corner.distanceTo(landingRailEnd) > 0.05) {
                const seg2 = buildSegment(corner, landingRailEnd);
                seg2.userData.elementType = 'stair-railing';
                seg2.userData.selectable = false;
                group.add(seg2);
            }
        }
        // Inner open side (projLen ≈ treadDepth/2): no connector — each flight
        // terminates cleanly with its newel post, leaving the landing path clear.
    }

    // ── U-shape half-landing guard (§U-LANDING-GUARD) ────────────────────────────
    // Builds the horizontal handrail + balusters along the OPEN (exposed) forward
    // edge of a U-stair half-landing — the architecturally-required guard along the
    // landing's open side, which the old code omitted entirely.
    //
    // The guard is a single physical edge shared by both flights, so it is emitted
    // ONCE — from the railing config sitting on flight 1's OUTER side (the side away
    // from flight 2). With `offset = sideAxis * sideSign * width/2` and
    // `perpDir` pointing toward `secondRunSide`, the outer side is `-perpDir`:
    //   left-fold  (perpDir = +sideAxis) → outer is the 'right' railing
    //   right-fold (perpDir = -sideAxis) → outer is the 'left'  railing
    // Emitting from the inner-side config too would double-draw the same rail.
    private buildULandingGuard(
        group: THREE.Group,
        f: ReturnType<StairRailingBuilder['resolveFlightPositions']>[0],
        railing: StairRailingConfig,
        stair: StairData,
        sideSign: number,
        buildSegment: (start: THREE.Vector3, end: THREE.Vector3) => THREE.Mesh,
        nextEntry?: ReturnType<StairRailingBuilder['resolveFlightPositions']>[0]
    ): void {
        const { flightStart, flatDir, offset, totalRun, totalRise } = f;
        const width = stair.width;

        // perpDir mirrors StairMeshBuilder §STAIR-U-LANDING-SIDE — toward secondRunSide.
        const perpDir = stair.secondRunSide === 'right'
            ? new THREE.Vector3(flatDir.z, 0, -flatDir.x).normalize()
            : new THREE.Vector3(-flatDir.z, 0, flatDir.x).normalize();

        // Emit ONCE, from the railing on flight 1's OUTER side (offset == -perpDir).
        // sideAxis (the 'left' perp) == perpDir on a left-fold, so for left-fold the
        // outer railing is 'right' (sideSign -1); for right-fold it is 'left' (+1).
        const outerSideSignForLeftFold = -1; // 'right'
        const wantSideSign = stair.secondRunSide === 'right' ? 1 : outerSideSignForLeftFold;
        if (sideSign !== wantSideSign) return;

        const railHeight = railing.topRailHeight;
        // Landing platform sits at flight 1's TOP elevation (= flight 2's start).
        const landingElev = flightStart.y + totalRise;

        // currentPosition equivalent: flight 1's last-tread centre.
        const lastTreadCentre = flightStart.clone()
            .add(flatDir.clone().multiplyScalar(totalRun));

        // Open edge = slab's forward flatDir edge: flatDir*(flightTread/2 + width)
        // from the last-tread centre (matches the mesh slab's far flatDir face).
        const flightTread = stair.treadDepth;
        const frontEdgeBase = lastTreadCentre.clone()
            .add(flatDir.clone().multiplyScalar(flightTread / 2 + width));

        // The front edge runs in perpDir across the full landing front: from flight 1's
        // OUTER rail line (perpDir*-width/2) to flight 2's OUTER rail line (perpDir*+3*width/2).
        const p0 = frontEdgeBase.clone().add(perpDir.clone().multiplyScalar(-width / 2)).setY(landingElev);
        const p1 = frontEdgeBase.clone().add(perpDir.clone().multiplyScalar(width * 1.5)).setY(landingElev);

        // ── Top rail along the open edge ─────────────────────────────────────────
        const railStart = p0.clone().setY(landingElev + railHeight);
        const railEnd = p1.clone().setY(landingElev + railHeight);
        const rail = buildSegment(railStart, railEnd);
        rail.userData.elementType = 'stair-railing';
        rail.userData.selectable = false;
        group.add(rail);

        // ── Infill along the open edge ────────────────────────────────────────────
        // §U-LANDING-INFILL — emit the SAME per-type infill the flights use (square
        // balusters / round balusters / glass panel / none), via the shared emitter.
        // Previously this inline loop drew balusters for flat-bar/circular but emitted
        // NOTHING for glass-panel — leaving the landing open edge as a bare top rail
        // for the glass type (one of the founder-reported gaps).
        this.emitHorizontalInfill(group, p0, p1, landingElev, railHeight, railing);

        // ── Corner posts at both ends of the open edge ────────────────────────────
        this.addPost(group, p0.clone(), landingElev, railHeight, 0.06, this.makeMaterial(railing.material, 0x7a5c38));
        this.addPost(group, p1.clone(), landingElev, railHeight, 0.06, this.makeMaterial(railing.material, 0x7a5c38));

        // ── §60/§46 CONTINUITY — tie the run rails into the guard ─────────────────
        // The per-flight rails (built independently in buildRailingType_*) END at the
        // top of flight 1 and START at the bottom of flight 2, both at the last/first
        // tread centreline — but the open-edge guard sits one slab-depth FORWARD
        // (flatDir*(tread/2 + width)) of those terminals. That forward step left an
        // OPEN gap at each run↔landing transition (the founder-reported red gaps): a
        // guardrail must be continuous (no opening a child could fall through). Emit a
        // short connecting rail (top rail at rail height + a closing post) from each
        // flight terminal to the NEAREST guard corner so the balustrade is unbroken
        // all the way around the half-landing.
        //
        // This guard is emitted from flight 1's OUTER railing config (see the
        // sideSign gate above); that SAME config also owns flight 2's rail (the next
        // entry resolved by the caller), so both terminals are available here and the
        // two connectors are emitted exactly once.
        const railStartFlat = new THREE.Vector3(railStart.x, 0, railStart.z);
        const railEndFlat = new THREE.Vector3(railEnd.x, 0, railEnd.z);
        const nearestCorner = (pt: THREE.Vector3): THREE.Vector3 => {
            const ptFlat = new THREE.Vector3(pt.x, 0, pt.z);
            return ptFlat.distanceTo(railStartFlat) <= ptFlat.distanceTo(railEndFlat)
                ? railStart.clone()
                : railEnd.clone();
        };
        const connect = (terminal: THREE.Vector3): void => {
            const corner = nearestCorner(terminal);
            // Snap the connector's terminal Y to the guard rail height so the joining
            // segment is a clean closing piece (deterministic, respects rail height).
            const t = terminal.clone().setY(corner.y);
            if (t.distanceTo(corner) <= 0.02) return; // already coincident — no gap
            const seg = buildSegment(t, corner);
            seg.userData.elementType = 'stair-railing';
            seg.userData.selectable = false;
            group.add(seg);
            // §U-LANDING-INFILL — the connector span (run terminal → guard corner) is
            // the "area BETWEEN the flight runs and the BACK of the landing" the
            // founder red-lined: it previously carried only a top rail + closing post
            // with NO baluster/spindle/glass infill. Emit the SAME per-type infill the
            // flights and the open edge use, so the pattern is continuous all the way
            // around the half-landing for ANY railing type. This connector is flat at
            // landingElev (both terminal and corner snap to the guard rail height).
            this.emitHorizontalInfill(group, t, corner, landingElev, railHeight, railing);
            // Closing post at the flight terminal locks the corner visually.
            this.addPost(group, new THREE.Vector3(t.x, 0, t.z), landingElev, railHeight, 0.06,
                this.makeMaterial(railing.material, 0x7a5c38));
        };

        // Flight 1 OUTER rail TOP terminal (top of lower flight).
        const flight1RailEnd = flightStart.clone()
            .add(flatDir.clone().multiplyScalar(totalRun))
            .add(offset)
            .setY(landingElev + railHeight);
        connect(flight1RailEnd);

        // Flight 2 OUTER rail BOTTOM terminal (bottom of upper flight). Flight 2 starts
        // at the landing platform, so its start elevation == landingElev.
        if (nextEntry) {
            const flight2RailStart = nextEntry.flightStart.clone()
                .add(nextEntry.offset)
                .setY(nextEntry.flightStart.y + railHeight);
            connect(flight2RailStart);
        }
    }

    // ── Shared per-type INFILL emitter (§U-LANDING-INFILL) ───────────────────────
    // Emits the SAME baluster/spindle/glass infill the flights use, along an
    // arbitrary HORIZONTAL segment (start→end, both at the same base elevation).
    // Reused by buildULandingGuard for the landing open-edge AND for every §60
    // run↔landing connector so the half-landing carries an unbroken infill pattern
    // continuous with the flights — for ANY railing type.
    //
    //   flat-bar     → square (box) balusters at `balusterSpacing`
    //   circular     → round (cylinder) balusters at `balusterSpacing`
    //   glass-panel  → a single vertical glass quad spanning the segment
    //   none         → nothing
    //
    // The spacing/profile/width are read straight from the railing config, so this
    // matches the flights' infill exactly (the founder-required continuity). Pure +
    // deterministic: identical inputs ⇒ identical baluster count and positions.
    private emitHorizontalInfill(
        group: THREE.Group,
        start: THREE.Vector3,
        end: THREE.Vector3,
        baseElev: number,
        railHeight: number,
        railing: StairRailingConfig
    ): void {
        const type = railing.railingType ?? 'flat-bar';
        if (type === 'none') return;

        const a = new THREE.Vector3(start.x, baseElev, start.z);
        const b = new THREE.Vector3(end.x, baseElev, end.z);
        const spanLen = a.distanceTo(b);
        if (spanLen < 0.01) return;

        if (type === 'glass-panel') {
            // Vertical glass panel spanning the segment (matches the flights' glass).
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0xaaddff,
                transparent: true,
                opacity: 0.35,
                roughness: 0.1,
                metalness: 0.1,
                side: THREE.DoubleSide,
            });
            const panelH = railHeight - 0.15;
            const baseL = a.clone().setY(baseElev + 0.05);
            const baseR = b.clone().setY(baseElev + 0.05);
            const topL = baseL.clone().setY(baseL.y + panelH);
            const topR = baseR.clone().setY(baseR.y + panelH);
            const positions = new Float32Array([
                baseL.x, baseL.y, baseL.z,
                baseR.x, baseR.y, baseR.z,
                topR.x,  topR.y,  topR.z,
                topL.x,  topL.y,  topL.z,
            ]);
            const panelGeom = new THREE.BufferGeometry();
            panelGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            panelGeom.setIndex([0, 1, 2, 0, 2, 3]);
            panelGeom.computeVertexNormals();
            const panelMesh = new THREE.Mesh(panelGeom, glassMat);
            panelMesh.userData.elementType = 'stair-railing';
            panelMesh.userData.selectable = false;
            group.add(panelMesh);
            return;
        }

        // flat-bar / circular: vertical balusters at the flight spacing/profile.
        const balSpacing = railing.balusterSpacing;
        const balCount = Math.max(1, Math.floor(spanLen / balSpacing));
        const bw = railing.balusterWidth;
        for (let i = 0; i <= balCount; i++) {
            const t = i / balCount;
            const basePos = a.clone().lerp(b, t);
            const balGeom = type === 'circular'
                ? new THREE.CylinderGeometry(bw / 2, bw / 2, railHeight, 8)
                : new THREE.BoxGeometry(bw, railHeight, bw);
            const bal = new THREE.Mesh(balGeom, this.makeMaterial(railing.material, 0x7a5c38));
            bal.position.set(basePos.x, baseElev + railHeight / 2, basePos.z);
            bal.userData.elementType = 'stair-railing';
            bal.userData.selectable = false;
            group.add(bal);
        }
    }

    // ── Geometry helpers ─────────────────────────────────────────────────────────

    private addPost(
        group: THREE.Group,
        baseXZ: THREE.Vector3,
        baseElev: number,
        height: number,
        size: number,
        mat: THREE.MeshStandardMaterial
    ): void {
        const geom = new THREE.BoxGeometry(size, height, size);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(baseXZ.x, baseElev + height / 2, baseXZ.z);
        mesh.userData.elementType = 'stair-railing';
        mesh.userData.selectable = false;
        group.add(mesh);
    }

    // Builds a flat rectangular rail (box profile) between two points.
    private buildBoxRail(
        start: THREE.Vector3,
        end: THREE.Vector3,
        width: number,
        height: number,
        mat: THREE.MeshStandardMaterial
    ): THREE.Mesh {
        const length = start.distanceTo(end);
        if (length < 0.001) {
            const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
            mesh.userData.elementType = 'stair-railing';
            mesh.userData.selectable = false;
            return mesh;
        }
        const geom = new THREE.BoxGeometry(width, height, length);
        const mid = start.clone().add(end).multiplyScalar(0.5);
        const direction = end.clone().sub(start).normalize();
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
        geom.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion));
        geom.translate(mid.x, mid.y, mid.z);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData.elementType = 'stair-railing';
        mesh.userData.selectable = false;
        return mesh;
    }

    private buildRailGeometry(start: THREE.Vector3, end: THREE.Vector3, radius: number): THREE.BufferGeometry {
        const length = start.distanceTo(end);
        if (length < 0.001) return new THREE.BufferGeometry();
        const geom = new THREE.CylinderGeometry(radius, radius, length, 8);

        const mid = start.clone().add(end).multiplyScalar(0.5);
        const direction = end.clone().sub(start).normalize();
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

        const matrix = new THREE.Matrix4();
        matrix.makeRotationFromQuaternion(quaternion);
        matrix.setPosition(mid);

        geom.applyMatrix4(matrix);
        return geom;
    }

    private makeMaterial(material: string, fallbackHex: number): THREE.MeshStandardMaterial {
        const colors: Record<string, number> = {
            steel: 0x888899, wood: 0x8B5E3C, timber: 0x8B5E3C,
            concrete: 0xaaaaaa, chrome: 0xccccdd, glass: 0xaaddff
        };
        return new THREE.MeshStandardMaterial({
            color: colors[material] ?? fallbackHex,
            roughness: material === 'steel' || material === 'chrome' ? 0.2 : 0.7,
            metalness: material === 'steel' || material === 'chrome' ? 0.8 : 0.0,
            transparent: material === 'glass',
            opacity: material === 'glass' ? 0.4 : 1.0,
        });
    }

    removeRailing(railingId: string): void {
        const group = this.meshGroups.get(railingId);
        if (group) {
            this.scene?.remove(group);
            group.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (child.material instanceof THREE.Material) child.material.dispose();
                }
            });
            this.meshGroups.delete(railingId);
            elementRegistry.unregisterRoot(railingId);
        }
    }

    setScene(scene: THREE.Scene): void {
        this.scene = scene;
    }
}
