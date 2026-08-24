// @pryzm/geometry-lift — LiftMeshBuilder (mirror of StairMeshBuilder).
//
// Residential-building (multi-family) — Slice A / P2. Builds a PLACEHOLDER lift
// geometry: a translucent shaft box spanning base→top + a solid car box at the
// base. A real car/rails/counterweight is a LATER slice (plan §4) — the shaft+car
// box is sufficient for the building generator + hand-placement to render.
//
// P2 (single THREE owner): THREE is imported ONLY via the renderer-three boundary
// `@pryzm/renderer-three/three` — EXACTLY as StairMeshBuilder does. No raw
// `import * as THREE from 'three'` anywhere in this package.
//
// C15 §12 (selectable root, non-selectable children): the builder produces ONE
// THREE.Group root tagged `selectable: !isPreview`; its child meshes (shaft, car)
// are tagged `selectable: false` so a pick resolves to the lift root, never a part.
//
// Driven EXCLUSIVELY by the `bim-lift-added/-updated/-removed` window events the
// LiftStore emits (§01-BIM-ENGINE-CORE §1.4 — store is data-only, never calls the
// builder). Heights are resolved from the level table the caller injects.

import * as THREE from '@pryzm/renderer-three/three';
import { scheduleGpuRelease } from '@pryzm/renderer-three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { LiftData, DEFAULT_LIFT_PROPERTIES } from './LiftTypes';
import { LiftStore } from './LiftStore';

/** Minimal level-height lookup the builder needs to extrude the shaft. */
export interface LiftLevelProvider {
    /** Elevation (metres) of a level, or undefined if unknown. */
    getElevation(levelId: string): number | undefined;
}

const PREVIEW_COLOR = 0x42a5f5;
const SHAFT_COLOR = 0x9e9e9e;
const CAR_COLOR = 0xbdbdbd;
/** Fallback storey height (m) when the level table can't resolve elevations. */
const FALLBACK_STOREY_HEIGHT = 3.0;
const CAR_HEIGHT = 2.2;

export class LiftMeshBuilder {
    private liftStore: LiftStore;
    private liftRoots: Map<string, THREE.Group> = new Map();
    private scene?: THREE.Scene;
    private levels?: LiftLevelProvider;
    private _disposers: Array<() => void> = [];

    constructor(liftStore: LiftStore, scene?: THREE.Scene, levels?: LiftLevelProvider) {
        this.liftStore = liftStore;
        this.scene = scene;
        this.levels = levels;

        // §01-BIM-ENGINE-CORE §1.4 — builder is driven by window CustomEvents
        // (mirror of StairMeshBuilder). The store emits a lightweight `{ id }`
        // payload; we resolve the LiftData from the store.
        const resolveLift = (
            payload: { id?: string; lift?: unknown } | null | undefined,
        ): LiftData | undefined => {
            if (payload?.lift) return payload.lift as LiftData;
            return payload?.id ? this.liftStore?.get(payload.id) : undefined;
        };
        const onAdded = (e: Event) => {
            const lift = resolveLift((e as CustomEvent).detail);
            if (lift) this.updateLift(lift, false);
        };
        const onUpdated = (e: Event) => {
            const lift = resolveLift((e as CustomEvent).detail);
            if (lift) this.updateLift(lift, false);
        };
        const onRemoved = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const liftId = detail?.liftId ?? detail?.id;
            if (liftId) this.removeLift(liftId);
        };
        window.addEventListener('bim-lift-added', onAdded);
        window.addEventListener('bim-lift-updated', onUpdated);
        window.addEventListener('bim-lift-removed', onRemoved);
        this._disposers.push(
            () => window.removeEventListener('bim-lift-added', onAdded),
            () => window.removeEventListener('bim-lift-updated', onUpdated),
            () => window.removeEventListener('bim-lift-removed', onRemoved),
        );
    }

    setLevelProvider(provider: LiftLevelProvider): void {
        this.levels = provider;
    }

    /** Resolve the shaft's vertical span (base elevation, height) in metres. */
    private resolveSpan(lift: LiftData): { baseY: number; height: number } {
        const baseEl = this.levels?.getElevation(lift.baseLevelId);
        const topEl = this.levels?.getElevation(lift.topLevelId);
        if (baseEl !== undefined && topEl !== undefined && topEl !== baseEl) {
            return { baseY: Math.min(baseEl, topEl), height: Math.abs(topEl - baseEl) };
        }
        // Fallback: one storey starting at the origin's y.
        return { baseY: lift.origin.y, height: FALLBACK_STOREY_HEIGHT };
    }

    updateLift(lift: LiftData, isPreview = false): void {
        const _priorVersion: number =
            (this.liftRoots.get(lift.id)?.userData?.version as number | undefined) ?? 0;

        this.removeLift(lift.id, isPreview);

        const { baseY, height } = this.resolveSpan(lift);
        const w = Math.max(0.2, lift.shaftWidth);
        const d = Math.max(0.2, lift.shaftDepth);

        const userData = {
            id: lift.id,
            elementId: lift.id,
            elementType: 'VerticalCirculation',
            type: 'verticalCirculation',
            modelId: 'model-default',
            selectable: !isPreview,
            baseLevelId: lift.baseLevelId,
            topLevelId: lift.topLevelId,
            levelId: lift.levelId || lift.baseLevelId,
            kind: lift.kind,
            shaftWidth: w,
            shaftDepth: d,
            doorWidth: lift.doorWidth,
            carCapacityPersons: lift.carCapacityPersons,
            typeId: lift.typeId,
            ifcData: lift.ifcData || { guid: crypto.randomUUID(), ifcClass: 'IfcTransportElement' },
            // Monotonic per-build counter (mirror of stair §57 Day 4) so the
            // NME proxy-cache key invalidates after every rebuild.
            version: _priorVersion + 1,
        };

        const group = new THREE.Group();
        group.name = `lift-${lift.id}`;
        group.userData = { ...userData };

        // ── Shaft box (translucent enclosure) ──────────────────────────────────
        const shaftGeo = new THREE.BoxGeometry(w, height, d);
        const shaftMat = new THREE.MeshStandardMaterial({
            color: isPreview ? PREVIEW_COLOR : SHAFT_COLOR,
            transparent: true,
            opacity: isPreview ? 0.4 : 0.25,
        });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        shaft.name = `lift-shaft-${lift.id}`;
        shaft.position.set(0, baseY + height / 2 - lift.origin.y, 0);
        // C15 §12 — child parts are NON-selectable; pick resolves to the root.
        shaft.userData = { ...userData, selectable: false };
        group.add(shaft);

        // ── Car box (solid placeholder car at the base) ────────────────────────
        const carH = Math.min(CAR_HEIGHT, height);
        const carGeo = new THREE.BoxGeometry(Math.max(0.2, w - 0.3), carH, Math.max(0.2, d - 0.3));
        const carMat = new THREE.MeshStandardMaterial({
            color: isPreview ? PREVIEW_COLOR : CAR_COLOR,
            transparent: isPreview,
            opacity: isPreview ? 0.6 : 1,
        });
        const car = new THREE.Mesh(carGeo, carMat);
        car.name = `lift-car-${lift.id}`;
        car.position.set(0, baseY + carH / 2 - lift.origin.y, 0);
        car.userData = { ...userData, selectable: false };
        group.add(car);

        // Place + orient the whole lift group at its plan origin.
        group.position.set(lift.origin.x, lift.origin.y, lift.origin.z);
        group.rotation.y = lift.rotation;

        this.liftRoots.set(lift.id, group);
        if (!isPreview) {
            elementRegistry.registerRoot(lift.id, group);
        }
        if (this.scene) {
            this.scene.add(group);
        }

        if (!isPreview) {
            // Touch DEFAULT_LIFT_PROPERTIES so material defaults stay referenced.
            void DEFAULT_LIFT_PROPERTIES;
            console.log(`[LiftMeshBuilder] Built group for lift ${lift.id} (${lift.kind}, h=${height.toFixed(2)}m)`);
        }
    }

    removeLift(liftId: string, _isPreview = false): void {
        const group = this.liftRoots.get(liftId);
        if (!group) return;
        // §GPU-RESOURCE-LIFETIME L2 / C04 §3.1.2a rule 7 (L-10500) — DETACH on this
        // tick, RELEASE at the frame boundary.
        //
        // The previous code had BOTH halves of ADR-0297 L2 inverted: it disposed the
        // geometry and materials in a `traverse()` FIRST and only then removed the
        // group from the scene. So for the whole of that traverse the meshes were
        // still parented into the render graph while their GPU buffers were already
        // freed — the exact shape ADR-0297 L2 (a)+(b) forbids, and reachable from
        // `clearProjectGeometry()`, i.e. the project-switch sweep.
        //
        // It also bypassed the release funnel, so §GPU-CASTER-RELEASE-CHOKEPOINT never
        // opened its submit-pause window even though lift car/shaft meshes are promoted
        // to shadow casters by `PascalSceneLighting._enableShadowsOnScene()`.
        //
        // disposeMaterials = TRUE preserves the previous behaviour exactly: lift
        // materials are minted per-lift (`new THREE.MeshStandardMaterial`, :135/:150),
        // not drawn from a shared cache, so this builder is their sole owner (ADR-0297 L1).
        if (this.scene) this.scene.remove(group);
        group.removeFromParent();
        scheduleGpuRelease(group, true);
        this.liftRoots.delete(liftId);
    }

    getRoot(liftId: string): THREE.Group | undefined {
        return this.liftRoots.get(liftId);
    }

    dispose(): void {
        for (const id of Array.from(this.liftRoots.keys())) this.removeLift(id);
        this._disposers.forEach((d) => d());
        this._disposers = [];
    }

    /**
     * §C13-BUILDER-SCENE-CLEAR — detach EVERY lift root from the scene, without tearing
     * the builder down. `dispose()` above is TERMINAL (it drops the store disposers the
     * incoming project needs), so the C13 project-switch sweep calls this instead
     * (C13 §3.8/§3.10). Invoked by the `bim-project-cleared` sweep in `initBuilders.ts`.
     */
    clearProjectGeometry(): void {
        for (const id of Array.from(this.liftRoots.keys())) this.removeLift(id);
    }
}
