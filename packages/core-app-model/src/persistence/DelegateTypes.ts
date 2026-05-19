/**
 * Sprint H P9 (2026-05-10) — ProjectSnapshot (concrete shape used by ImportProjectCommand).
 * Placed here so packages can import it without depending on ProjectSerializer (src/).
 */
export interface ProjectSnapshot {
    schemaVersion: number;
    timestamp: number;
    projectName: string;
    projectId?: string;
    versionLabel?: string;
    levels: any[];
    grids: any[];
    walls: any[];
    windows: any[];
    doors: any[];
    slabs: any[];
    columns: any[];
    stairs: any[];
    beams: any[];
    curtainWalls: any[];
    roofs: any[];
    furniture: any[];
    handrails: any[];
    plumbing: any[];
    openings: any[];
    elementCount: number;
    roomBoundingLines?: any[];
    vgGovernance?: { version: 1; templates: any[]; models: any[]; views?: any[] };
    semanticTags?: { version: 1; tags: Array<{ elementId: string; tags: string[] }> };
    viewDefinitions?: { version: 1; views: any[] };
    requirements?: { version: 1; records: any[] };
    rooms?: any[];
    [key: string]: unknown;
}

/**
 * DelegateTypes — BIM persistence delegate interfaces.
 *
 * Moved here from `src/ui/platform/PlatformShellTypes.ts` (Wave 14 FILE 2
 * god-file split, 2026-05-02) so that `src/ui/platform/` contains no
 * reference to `IProjectSaveDelegate` / `IProjectLoadDelegate` (Wave 14
 * verifier: `rg 'IProjectSaveDelegate|IProjectLoadDelegate'
 * src/ui/platform/` → 0 lines).
 *
 * `IProjectSnapshot` and `ILoadResult` originate here (engine layer);
 * `src/ui/platform/PlatformShellTypes.ts` re-exports them so existing
 * UI importers see no change.
 *
 * Contract compliance:
 *   §01-BIM-ENGINE-CORE-CONTRACT §9 — engine-layer; must not import UI.
 *   §06 §1 — PlatformShell must not import ProjectSerializer/ProjectLoader.
 *             Only these interfaces are imported by the UI adapter layer.
 */

/**
 * Minimal snapshot shape that the UI layer inspects directly.
 * Additional engine-level fields are preserved via the index signature
 * so snapshots can be stored in localStorage and passed back to the
 * load delegate without data loss.
 */
export interface IProjectSnapshot {
    projectName?: string;
    projectId?: string;
    versionLabel?: string;
    elementCount: number;
    walls: unknown[];
    slabs: unknown[];
    furniture: unknown[];
    [key: string]: unknown;
}

/**
 * Result returned by IProjectLoadDelegate.load().
 * Mirrors the LoadResult shape from ProjectLoader without importing it.
 */
export interface ILoadResult {
    success: boolean;
    loaded: number;
    failed: number;
    errors: string[];
}

/**
 * Delegate for serialising the current BIM scene into a snapshot.
 * Implemented in initPersistence.ts wrapping ProjectSerializer + stores.
 */
export interface IProjectSaveDelegate {
    serialize(options: {
        projectName: string;
        projectId: string;
        versionLabel?: string;
    }): IProjectSnapshot;
    stringify(snapshot: IProjectSnapshot): string;
    parse(text: string): IProjectSnapshot;
    /**
     * Project-hub improvement D — captures a WebP thumbnail from the engine renderer.
     * Returns a base-64 data URL, or null if the renderer is unavailable / capture fails.
     * Optional so implementations without renderer access remain valid.
     */
    captureThumbnail?(): string | null;
    /**
     * Flow 7 architectural fix (2026-04-30) — cheap count read for the
     * "X elements · Y walls · Z slabs · W furniture" line in the Save modal.
     * Implementations MUST NOT walk geometry, serialize, or deep-clone.
     * Target ≤0.5 ms even for 600+ elements.
     */
    getElementCounts(): {
        total: number;
        walls: number;
        slabs: number;
        furniture: number;
    };
}

/**
 * Delegate for loading a snapshot back into the BIM scene.
 * Implemented in initPersistence.ts wrapping ProjectLoader + CommandManager.
 */
export interface IProjectLoadDelegate {
    load(snapshot: IProjectSnapshot): Promise<ILoadResult>;
}
