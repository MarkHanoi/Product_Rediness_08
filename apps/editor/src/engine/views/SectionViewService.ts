import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import type { EdgeProjectorService } from './EdgeProjectorService';
import type { ViewDefinition } from '@pryzm/core-app-model';
import type { ISectionViewService } from '@pryzm/views';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { nativeElementMeshExporter } from '@pryzm/core-app-model';
import { ifcProjectionStore } from '@pryzm/core-app-model';
// DOC-2.5d: level datum line injection for section views
import { levelDatumLineBuilder, sectionGridLineBuilder } from '@pryzm/plugin-annotations';

export interface SectionConfig {
    normal: THREE.Vector3;
    origin: THREE.Vector3;
    depth?: number;
}

/**
 * SectionViewService manages BIM-style section views using fragment-aware clipping.
 * Isolated from UI and tool logic.
 *
 * DOC-1.9: Also owns the EdgeProjector projection call that fires after clip plane
 * setup, so the SectionTool path (which bypasses ViewController) also produces
 * a cached TechnicalDrawing.
 */
export class SectionViewService implements ISectionViewService {
    private _components: OBC.Components;
    private _world: OBC.World;
    private _clipper: OBC.Clipper;

    // ── DOC-1.9 injection ─────────────────────────────────────────────────────
    private _edgeProjectorService?: EdgeProjectorService;

    constructor(components: OBC.Components, world: OBC.World) {
        this._world = world;
        this._clipper = components.get(OBC.Clipper);
        this._components = components;
    }

    // ── DOC-1.9 ──────────────────────────────────────────────────────────────

    /**
     * Inject the EdgeProjectorService after construction.
     * Called from ViewController.setEdgeProjectorService() so both code paths
     * (ViewController → _activateSectionView AND SectionTool → activateSection)
     * trigger projection when a ViewDefinition is available.
     */
    setEdgeProjectorService(svc: EdgeProjectorService): void {
        this._edgeProjectorService = svc;
    }

    /**
     * Helper to get current fragment bounds
     */
    getFragmentBounds(): THREE.Box3 {
        const box = new THREE.Box3();
        const fragments = this._components.get(OBC.FragmentsManager);
        
        if (fragments) {
            const fragmentList = (fragments as any).list || (fragments as any).groups;
            if (fragmentList) {
                for (const group of fragmentList.values()) {
                    if (group.boundingBox) {
                        box.union(group.boundingBox);
                    } else if (group.mesh) {
                        const meshBox = new THREE.Box3().setFromObject(group.mesh);
                        if (!meshBox.isEmpty()) {
                            box.union(meshBox);
                        }
                    }
                }
            }
        }
        return box;
    }

    /**
     * Activates a section view with the given configuration.
     * Computes bounds from fragments to ensure stable framing.
     *
     * DOC-1.9: When a ViewDefinition is supplied, triggers a non-blocking
     * EdgeProjectorService.project() call after clip plane setup and caches the
     * result in ViewTechnicalDrawingCache.  Caller (ViewController) must NOT fire
     * a second projection for the same viewDef — pass viewDef here instead.
     *
     * @param config   Section plane normal + origin.
     * @param viewDef  Optional view definition that drives projection (DOC-1.9).
     */
    async activateSection(config: SectionConfig, viewDef?: ViewDefinition): Promise<void> {
        this.deactivate();

        const { normal, origin } = config;

        // Enable clipper and local clipping
        this._clipper.enabled = true;
        
        // Apply planes to all fragment materials
        const fragments = this._components.get(OBC.FragmentsManager);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
        
        if (fragments) {
            const fragmentList = (fragments as any).list || (fragments as any).groups;
            if (fragmentList) {
                for (const group of fragmentList.values()) {
                    const items = (group as any).items || [(group as any).mesh];
                    for (const fragment of items) {
                        if (!fragment || !fragment.mesh) continue;
                        const material = fragment.mesh.material;
                        if (Array.isArray(material)) {
                            material.forEach((m: any) => {
                                m.clippingPlanes = [plane];
                                m.clipShadows = true;
                            });
                        } else if (material) {
                            (material as any).clippingPlanes = [plane];
                            (material as any).clipShadows = true;
                        }
                    }
                }
            }
        }

        const renderer = this._world.renderer;
        if (renderer && renderer.three) {
            renderer.three.localClippingEnabled = true;
        }

        console.log('[SectionViewService] Section activated with fragment-aware clipping', config);

        // ── DOC-1.9: trigger projection after clip plane setup ────────────────
        // Non-blocking — never delays the section view activation itself.
        // Fires for both the ViewController path and any direct SectionTool usage.
        if (viewDef && this._edgeProjectorService) {
            this._projectSection(viewDef);
        }
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * DOC-1.9 — fire-and-forget EdgeProjector projection for a section view.
     *
     * Feature flag: window.__PRYZM_FLAGS__.EDGE_PROJECTOR_NATIVE controls
     * whether native mesh groups are included alongside IFC models.
     */
    private _projectSection(viewDef: ViewDefinition): void {
        const fragmentsMgr = this._components.get(OBC.FragmentsManager);
        const allModels = fragmentsMgr.list.size > 0 ? Array.from(fragmentsMgr.list.values()) : [];
        const models = ifcProjectionStore.filterModels(allModels, viewDef.id);

        const nativeFlag = window.__PRYZM_FLAGS__?.EDGE_PROJECTOR_NATIVE === true;
        const nativeGroups = nativeFlag ? nativeElementMeshExporter.exportForView(viewDef) : [];

        // §28 / Contract 22 §4.1 — Collect IFC-imported scene groups (Source C).
        const ifcSceneGroups: THREE.Group[] = [];
        if (ifcProjectionStore.shouldIncludeIFC(viewDef.id)) {
            const scene = (this._world.scene as any)?.three as THREE.Scene | undefined;
            if (scene) {
                for (const obj of scene.children) {
                    if ((obj as THREE.Group).isGroup && obj.userData?.source === 'ifc-import') {
                        ifcSceneGroups.push(obj as THREE.Group);
                    }
                }
            }
        }

        if (models.length === 0 && nativeGroups.length === 0 && ifcSceneGroups.length === 0) return;

        console.log(
            `[SectionViewService] DOC-1.9: projection START viewId=${viewDef.id} ` +
            `(IFC=${models.length}, native=${nativeGroups.length}, ifc-scene=${ifcSceneGroups.length}, nativeFlag=${nativeFlag})`,
        );

        this._edgeProjectorService!.project(viewDef, models, nativeGroups, ifcSceneGroups).then(drawing => {
            viewTechnicalDrawingCache.set(viewDef.id, drawing);
            // §F.1 — release proxy groups promptly after EPS has consumed them.
            // The success path previously never called releaseGroups(); groups leaked
            // until GC, holding wrapper Group + child Mesh objects alive across frames.
            // §G1-T3: disposeProxies: true ensures EdgesGeometry is freed on the GPU.
            nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
            console.log(
                `[SectionViewService] DOC-1.9: projection DONE → cached viewId=${viewDef.id} ` +
                `(IFC=${models.length}, native=${nativeGroups.length}, ifc-scene=${ifcSceneGroups.length})`,
            );
            // DOC-1.13: apply VG category visibility/colour to projection layers
            const vgApplicator = window.vgSceneApplicator;
            if (vgApplicator && typeof vgApplicator.applyToProjectionLayers === 'function') {
                vgApplicator.applyToProjectionLayers(drawing, viewDef.id);
            }
            // DOC-2.5d: inject level datum lines into section drawings.
            levelDatumLineBuilder.inject(drawing, viewDef);
            // DOC-2.5e: inject vertical grid lines into section drawings.
            sectionGridLineBuilder.inject(drawing, viewDef);
        }).catch(err => {
            // Release native groups on error to avoid memory leak (§02 §4.3).
            // §G1-T3: disposeProxies: true ensures EdgesGeometry is freed on the GPU.
            nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
            console.error('[SectionViewService] DOC-1.9: projection failed:', err);
        });
    }

    /**
     * Cleans up section state, removing clipping planes and restoring scene.
     */
    deactivate(): void {
        const fragments = this._components.get(OBC.FragmentsManager);
        if (fragments) {
            const fragmentList = (fragments as any).list || (fragments as any).groups;
            if (fragmentList) {
                for (const group of fragmentList.values()) {
                    const items = (group as any).items || [(group as any).mesh];
                    for (const fragment of items) {
                        if (!fragment || !fragment.mesh) continue;
                        const material = fragment.mesh.material;
                        // VIEW-SYSTEM-AUDIT-2026 F15.1 — Three.js `material.clippingPlanes`
                        // expects `Plane[] | null`, but the renderer treats `null` as
                        // "no override" and may keep the previously-set planes.  Setting
                        // an empty array is the canonical "no clipping" signal across
                        // all material subclasses (MeshStandard, MeshBasic, LineBasic).
                        if (Array.isArray(material)) {
                            material.forEach((m: any) => {
                                m.clippingPlanes = [];
                            });
                        } else if (material) {
                            (material as any).clippingPlanes = [];
                        }
                    }
                }
            }
        }

        this._clipper.enabled = false;
        
        const renderer = this._world.renderer;
        if (renderer && renderer.three) {
            renderer.three.localClippingEnabled = false;
        }

        console.log('[SectionViewService] Section deactivated');
    }

    dispose(): void {
        this.deactivate();
    }
}
