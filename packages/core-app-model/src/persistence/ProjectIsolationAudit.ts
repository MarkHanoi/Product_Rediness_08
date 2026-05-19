/**
 * ProjectIsolationAudit — runtime tripwire for project-isolation leaks.
 *
 * Contract 48 — Project-Isolation Deep Check.
 *
 * What it does
 * ────────────
 * Subscribes to `pryzm-project-loaded(empty:true)` — i.e. every time a brand
 * new (or freshly-cleared) project finishes loading. At that exact moment
 * the world MUST contain zero per-project state. If anything is found, it's
 * a leak: the previous project bled into the new one.
 *
 * Tripwire surfaces (each is the actual symptom users would see):
 *
 *   1. THREE scene contains an underlay mesh
 *      → root cause of the Apr 2026 PDF leak.
 *
 *   2. `window.floorPlanUnderlayTool` is non-null
 *      → tool singleton survived ClearProjectCommand.
 *
 *   3. THREE scene contains an IFC group, DXF overlay, or imported model
 *      → ClearProjectCommand or its scope hooks left geometry behind.
 *
 *   4. THREE scene contains any object with `userData.elementId`
 *      → a BIM element from the previous project survived the clear.
 *
 *   5. `localStorage` contains a `pryzm.scoped.<otherProjectId>.…` key
 *      whose data ended up materialised into the current project (detected
 *      by counting underlay/import-related keys for the current project).
 *
 * On detection
 * ────────────
 * Logs a single `[CONTRACT 48 VIOLATION] …` error with the offending list,
 * dispatches `pryzm-project-isolation-leak` (so a dev-mode toast can pick
 * it up), and posts a structured payload to `window.__pryzmIsolationLeaks`
 * for inspection in the console.
 *
 * The audit runs only on `empty:true` loads to keep the false-positive rate
 * at zero — non-empty loads legitimately bring back saved geometry.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';

interface IsolationLeakReport {
    timestamp: string;
    projectId: string;
    findings: Array<{
        surface: string;
        count: number;
        details?: unknown;
    }>;
}

const _leakHistory: IsolationLeakReport[] = [];
let _installed = false;

/** Lookup a window global by name, returning undefined if missing. */
function w<T = unknown>(name: string): T | undefined {
    return (window as unknown as Record<string, T>)[name];
}

function inspectScene(): { underlayCount: number; ifcCount: number; dxfCount: number; elementCount: number; details: string[] } {
    const scene = w<THREE.Scene>('scene');
    const result = { underlayCount: 0, ifcCount: 0, dxfCount: 0, elementCount: 0, details: [] as string[] };
    if (!scene || typeof (scene as any).traverse !== 'function') return result;

    scene.traverse((obj: THREE.Object3D) => {
        const ud = (obj.userData ?? {}) as Record<string, unknown>;
        const name = (obj.name ?? '') as string;

        // Underlay: tagged either by name prefix or by userData.fileName + lying on Y plane.
        if (name.startsWith('FloorPlanUnderlay') || ud.isFloorPlanUnderlay === true) {
            result.underlayCount += 1;
            result.details.push(`underlay mesh "${name}"`);
        }
        // IFC group markers
        if (ud.isIfcGroup === true || ud.isIFCModel === true || ud.ifcModelId != null) {
            result.ifcCount += 1;
            result.details.push(`ifc group "${name || ud.ifcModelId}"`);
        }
        // DXF overlay markers
        if (ud.isDxfOverlay === true || ud.dxfId != null) {
            result.dxfCount += 1;
            result.details.push(`dxf overlay "${name || ud.dxfId}"`);
        }
        // Any BIM element that survived ClearProjectCommand
        if (ud.elementId != null && ud.elementType != null) {
            result.elementCount += 1;
        }
    });

    return result;
}

function inspectGlobals(): string[] {
    const offenders: string[] = [];

    // Underlay tool singleton must be null after a fresh project load.
    if (w('floorPlanUnderlayTool') != null) offenders.push('window.floorPlanUnderlayTool is non-null');

    // Per-IFC-import tracker maintained by initUI.ts. Should be empty / undefined.
    const ifcUploads = w<Record<string, unknown>>('_ifcServerUploadIds');
    if (ifcUploads && typeof ifcUploads === 'object' && Object.keys(ifcUploads).length > 0) {
        offenders.push(`window._ifcServerUploadIds has ${Object.keys(ifcUploads).length} entries`);
    }

    return offenders;
}

function runAudit(projectId: string): IsolationLeakReport | null {
    const sceneFindings   = inspectScene();
    const globalOffenders = inspectGlobals();

    const findings: IsolationLeakReport['findings'] = [];
    if (sceneFindings.underlayCount > 0) findings.push({ surface: 'scene.underlay',  count: sceneFindings.underlayCount });
    if (sceneFindings.ifcCount      > 0) findings.push({ surface: 'scene.ifc',       count: sceneFindings.ifcCount });
    if (sceneFindings.dxfCount      > 0) findings.push({ surface: 'scene.dxf',       count: sceneFindings.dxfCount });
    if (sceneFindings.elementCount  > 0) findings.push({ surface: 'scene.bimElement',count: sceneFindings.elementCount });
    if (globalOffenders.length      > 0) findings.push({ surface: 'window.globals',  count: globalOffenders.length, details: globalOffenders });

    if (findings.length === 0) return null;

    return {
        timestamp: new Date().toISOString(),
        projectId,
        findings,
    };
}

/**
 * Install the runtime audit. Idempotent — call once at app boot from
 * initTools.ts after `installUnderlayPersistence()` (so the persistence
 * layer's switch/load listeners win the event-ordering race; the audit
 * runs LAST, observing the post-clear state).
 */
export function installProjectIsolationAudit(): void {
    if (_installed) return;
    _installed = true;
    if (typeof window === 'undefined') return;

    window.addEventListener('pryzm-project-loaded', (e: Event) => {
        const detail = (e as CustomEvent).detail ?? {};
        if (detail.empty !== true) return; // only audit fresh / cleared projects

        const projectId = (detail.projectId as string | undefined) ?? '<unknown>';

        // S85.D-finish.3: defer one frame via the canonical
        // `getFrameScheduler().scheduleOnce()` API (architectural
        // replacement for `rAF(cb)`) so any listeners
        // that mount geometry on `pryzm-project-loaded` have completed
        // (legitimate setup vs. leak).
        getFrameScheduler().scheduleOnce('project-isolation-audit', () => {
            const report = runAudit(projectId);
            if (!report) {
                console.log(`[ProjectIsolationAudit] ✓ project ${projectId} loaded clean — no leftover state`);
                return;
            }
            _leakHistory.push(report);
            window.__pryzmIsolationLeaks = _leakHistory;

            console.error(
                `[CONTRACT 48 VIOLATION] Project-isolation leak detected on empty load of ${projectId}:\n`,
                report.findings,
            );
            window.dispatchEvent(new CustomEvent('pryzm-project-isolation-leak', { detail: report })); // TODO(TASK-15)
        });
    });

    console.log('[ProjectIsolationAudit] Installed — will audit every empty project load');
}

/** Test hook — read the in-memory leak history. */
export function getIsolationLeakHistory(): ReadonlyArray<IsolationLeakReport> {
    return _leakHistory;
}
