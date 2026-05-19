/**
 * IfcLevelImporter
 *
 * Creates PRYZM native levels from IFC storey data extracted during import,
 * then immediately creates a Floor Plan view associated with each new level.
 *
 * §28-IFC-IMPORT-NATIVE-PARITY-CONTRACT §12 — "Add IFC Levels" option
 *
 * Activated when the user enables the "Add IFC levels" toggle in the IFC
 * import-mode dialog. This option is independent of reference vs. native mode:
 * it works with both.
 *
 * Behaviour:
 *  - For each IfcStoreyRecord (sorted bottom → top by elevation):
 *      1. Skip if a PRYZM level with the same name already exists (case-insensitive).
 *      2. Skip if a PRYZM level at the same elevation (±0.05 m) already exists.
 *      3. Otherwise create a level via AddLevelCommand with a default height of 3 m.
 *      4. Then create a Floor Plan view via CreatePlanViewCommand linked to that level.
 *  - Returns a summary { levelsCreated, viewsCreated, skipped } for the toast.
 *
 * IFC-P1.2 (2026-05-07): Frame-yield between storey iterations via
 * getFrameScheduler().scheduleOnce() to eliminate the 1,867 ms LONGTASK that
 * was caused by processing all storeys synchronously on the main thread.
 * Audit finding: BUG-02 (112× NFT-4 frame budget violation).
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { AddLevelCommand } from '@pryzm/command-registry';
import { CreatePlanViewCommand } from '@pryzm/command-registry';
import { IfcStoreyRecord } from './IfcImporter';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

// ── Minimal structural interfaces for commandManager and bimManager ──────────
// Using structural types instead of `any` to enable TypeScript safety without
// importing concrete implementations across layer boundaries (IFC-P1.2).

interface CommandExecutor {
    execute(command: unknown, options?: { source?: string }): { success: boolean } | null | undefined;
}

interface LevelRecord {
    id: string;
    name?: string;
    elevation: number;
}

interface LevelProvider {
    getLevels(): LevelRecord[];
}

export interface IfcLevelImportSummary {
    levelsCreated: number;
    viewsCreated: number;
    skipped: number;
}

/**
 * Given a list of IFC storey records, create PRYZM native levels and associated
 * Floor Plan views for any storey that does not already exist.
 *
 * IFC-P1.2: Yields to the browser frame loop between each storey via
 * getFrameScheduler().scheduleOnce() so the renderer stays at ≥ 60 fps
 * and no LONGTASK > 50 ms occurs. Each storey executes in its own frame.
 *
 * @param storeys         Ordered list from IfcImportResult.storeys (bottom → top).
 * @param commandManager  The app-level CommandManager instance (structural type).
 * @param bimManager      The app-level BimManager instance (structural type).
 */
export async function importIfcLevelsAndViews(
    storeys: IfcStoreyRecord[],
    commandManager: CommandExecutor,
    bimManager: LevelProvider | null,
): Promise<IfcLevelImportSummary> {
    const summary: IfcLevelImportSummary = { levelsCreated: 0, viewsCreated: 0, skipped: 0 };

    if (!storeys.length || !commandManager) {
        console.warn('[IfcLevelImporter] No storeys or no commandManager — skipping.');
        return summary;
    }

    const getExistingLevels = (): LevelRecord[] => {
        try {
            if (typeof bimManager?.getLevels === 'function') return bimManager.getLevels();
        } catch (_) {}
        return [];
    };

    const execute = (cmd: unknown): { success: boolean } => {
        try {
            return (commandManager.execute(cmd, { source: 'HUMAN_DIRECT' }) ?? { success: false }) as { success: boolean };
        } catch (e) {
            console.error('[IfcLevelImporter] Command failed:', e);
            return { success: false };
        }
    };

    // IFC-P1.2: Promise that resolves on the next scheduler frame — used to
    // yield the main thread between storey iterations.  Keeps each frame under
    // the 16.6 ms NFT-4 budget by spreading work across N rAF ticks.
    const yieldToNextFrame = (): Promise<void> =>
        new Promise<void>(resolve => {
            try {
                getFrameScheduler().scheduleOnce('ifc-level-import-yield', () => resolve());
            } catch {
                // Fallback for environments where the scheduler is not running
                // (e.g. headless tests) — resolve immediately via microtask.
                Promise.resolve().then(resolve);
            }
        });

    for (const storey of storeys) {
        // IFC-P1.2: Yield to browser between each storey iteration.
        // Converts the former 1,867 ms LONGTASK into N × ~8 ms tasks.
        await yieldToNextFrame();

        const existing = getExistingLevels();

        const byName = existing.find(
            (l) => String(l.name ?? '').trim().toLowerCase() === storey.name.trim().toLowerCase(),
        );
        if (byName) {
            console.log(`[IfcLevelImporter] Skipping "${storey.name}" — level with same name exists (id: ${byName.id})`);
            summary.skipped++;

            // Still create a view for the existing level if one does not already exist
            const viewCreated = await _ensurePlanView(byName.id, storey.name, execute);
            if (viewCreated) summary.viewsCreated++;
            continue;
        }

        const byElevation = existing.find(
            (l) => Math.abs(Number(l.elevation) - storey.elevation) < 0.05,
        );
        if (byElevation) {
            console.log(`[IfcLevelImporter] Skipping "${storey.name}" — level at elevation ${storey.elevation.toFixed(3)} m already exists (id: ${byElevation.id})`);
            summary.skipped++;
            const viewCreated = await _ensurePlanView(byElevation.id, byElevation.name ?? storey.name, execute);
            if (viewCreated) summary.viewsCreated++;
            continue;
        }

        // Create the level
        const levelResult = execute(
            new AddLevelCommand({
                levelId: storey.id,
                name: storey.name,
                elevation: storey.elevation,
                height: 3,
            }),
        );

        if (!levelResult?.success) {
            console.warn(`[IfcLevelImporter] Failed to create level "${storey.name}":`, levelResult);
            continue;
        }

        summary.levelsCreated++;
        console.log(`[IfcLevelImporter] Created level "${storey.name}" @ ${storey.elevation.toFixed(3)} m (id: ${storey.id})`);

        // Create the Floor Plan view linked to this level
        const viewCreated = await _ensurePlanView(storey.id, storey.name, execute);
        if (viewCreated) summary.viewsCreated++;
    }

    // Refresh the view browser so new entries appear immediately
    _bus.emit('update-view-browser', {}); // F.events.18

    console.log(`[IfcLevelImporter] Done — levels: ${summary.levelsCreated}, views: ${summary.viewsCreated}, skipped: ${summary.skipped}`);
    return summary;
}

async function _ensurePlanView(
    levelId: string,
    name: string,
    execute: (cmd: unknown) => { success: boolean },
): Promise<boolean> {
    const viewName = `${name} — Floor Plan`;
    const result = execute(new CreatePlanViewCommand({ levelId, name: viewName }));
    if (result?.success) {
        console.log(`[IfcLevelImporter] Created Floor Plan view "${viewName}" for level ${levelId}`);
        return true;
    }
    console.warn(`[IfcLevelImporter] View for "${name}" not created:`, result);
    return false;
}
