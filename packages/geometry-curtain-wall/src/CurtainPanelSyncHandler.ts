/**
 * CurtainPanelSyncHandler
 *
 * Keeps the CurtainPanelStore in sync with the CurtainWallStore.
 *
 * ## Responsibility
 *
 * When a curtain wall is added or its grid changes, this handler:
 *   1. Computes the expected set of cells (via CurtainCellComputer)
 *   2. Creates CurtainPanelData entries for any new cells (default: SystemPanel_Glass)
 *   3. Removes stale CurtainPanelData entries for cells that no longer exist
 *   4. Never changes the panelType or materialOverride of existing panels (preserving user edits)
 *
 * When a curtain wall is removed, this handler removes all its panels.
 *
 * ## Contract Compliance
 *
 * §3.5 — This handler is external to both stores. It wires them together
 *         without either store depending on the other.
 *
 * §01 §2 — Store mutations (add/remove panels) are direct store operations,
 *           NOT commands. These are auto-derived structural data, not user
 *           intent. The ReplacePanelTypeCommand is the correct path for
 *           user-initiated panel type changes.
 *
 * ## Wiring
 *
 * Must be activated once in main.ts after both stores are created:
 *
 *   import { CurtainPanelSyncHandler } from './CurtainPanelSyncHandler';
 *   const syncHandler = new CurtainPanelSyncHandler(curtainWallStore, curtainPanelStore);
 *   syncHandler.activate();
 */

import { CurtainWallStore } from './CurtainWallStore';
import { CurtainWallData } from './CurtainWallTypes';
import { CurtainPanelStore } from './CurtainPanelStore';
import { CurtainPanelData } from './CurtainPanelTypes';
import { computeCurtainCells } from './CurtainCellComputer';
import { migrateToGridSystem } from './CurtainGridSystem';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { storeEventBus } from '@pryzm/core-app-model';

export class CurtainPanelSyncHandler {
    private cwStore: CurtainWallStore;
    private panelStore: CurtainPanelStore;
    private unsubscribe: (() => void) | null = null;

    constructor(cwStore: CurtainWallStore, panelStore: CurtainPanelStore) {
        this.cwStore = cwStore;
        this.panelStore = panelStore;
    }

    /** Subscribe to CurtainWallStore events and begin syncing. */
    activate(): void {
        this.unsubscribe = this.cwStore.subscribe((event, cw) => {
            try {
                if (event === 'remove') {
                    this.onCurtainWallRemoved(cw.id);
                } else {
                    // 'add' and 'update' both trigger a grid sync
                    this.onCurtainWallAddedOrUpdated(cw);
                }
            } catch (err) {
                console.error('[CurtainPanelSyncHandler] Error syncing panels:', err);
            }
        });
        console.log('[CurtainPanelSyncHandler] Activated — panel store will sync with curtain wall store.');
    }

    /** Stop listening to store events. */
    deactivate(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    // ── Private handlers ────────────────────────────────────────────────────

    private onCurtainWallAddedOrUpdated(cw: CurtainWallData): void {
        const [start, end] = cw.baseLine;
        // P0.3 DTO Migration: baseLine is now [Point3D, Point3D] — no .distanceTo().
        const dx = end.x - start.x, dy = (end.y ?? 0) - (start.y ?? 0), dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 0.001) return;

        // Resolve the grid: use stored gridSystem or migrate from scalar spacing
        const grid = cw.gridSystem ?? migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing);
        const cells = computeCurtainCells(grid, length, cw.height);

        // Build a set of expected cell keys: "cwId:i:j"
        const expectedKeys = new Set(cells.map(c => `${cw.id}:${c.i}:${c.j}`));

        // §PERF-2026: coalesce the burst of N×M per-cell store events into a
        // single global batch.  Without this, every cell add/delete fires a
        // separate StoreEventBus event, forcing downstream observers
        // (ViewTechnicalDrawingCache, plan-view rebuilders, room-graph
        // invalidators) to dispatch once per panel — the dominant cost when
        // creating a curtain wall with a dense grid.  All semantic side
        // effects (panel store mutations, registry ops) still happen in the
        // exact same order — only the bus fan-out is deferred until the loop
        // completes and flushed atomically.  Nested batch() is safe (depth
        // counter, see StoreEventBus §P1.1).
        storeEventBus.batch(() => {
            // Remove panels for cells that no longer exist (grid was changed)
            const existingPanels = this.panelStore.getByCurtainWallId(cw.id);
            for (const panel of existingPanels) {
                const key = `${cw.id}:${panel.cellIndex[0]}:${panel.cellIndex[1]}`;
                if (!expectedKeys.has(key)) {
                    this.panelStore.delete(panel.id);
                    elementRegistry.unregister(panel.id);
                }
            }

            // Create panels for new cells (cells with no existing panel data)
            for (const cell of cells) {
                const existing = this.panelStore.getByCellIndex(cw.id, cell.i, cell.j);
                if (!existing) {
                    // §DW-02 FIX (2026-03-31): Panel IDs are derived deterministically from the
                    // parent wall ID and cell position — never via crypto.randomUUID().
                    // This guarantees that undo/redo of the parent wall always produces the same
                    // panel IDs, keeping ReplacePanelTypeCommand history valid across undo cycles.
                    const panelId = `${cw.id}::${cell.i}:${cell.j}`;
                    const panelData: CurtainPanelData = {
                        id: panelId,
                        type: 'curtain-panel',
                        levelId: cw.levelId,
                        curtainWallId: cw.id,
                        cellIndex: [cell.i, cell.j],
                        panelType: 'SystemPanel_Glass',
                        properties: {
                            mark: `Panel-${cw.id.slice(0, 4)}-${cell.i}-${cell.j}`
                        },
                        ifcData: {
                            guid: panelId,
                            ifcClass: 'IfcMember',
                            predefinedType: 'PANEL'
                        }
                    };
                    this.panelStore.add(panelData);

                    // Register in ElementRegistry
                    if (!elementRegistry.getStoreType(panelId)) {
                        try {
                            elementRegistry.registerSemantic(panelId, 'curtain-panel');
                        } catch {
                            // Race condition guard
                        }
                    }
                }
            }
        });
    }

    private onCurtainWallRemoved(cwId: string): void {
        // §PERF-2026: same batching rationale as onCurtainWallAddedOrUpdated.
        storeEventBus.batch(() => {
            const panels = this.panelStore.getByCurtainWallId(cwId);
            for (const panel of panels) {
                this.panelStore.delete(panel.id);
                elementRegistry.unregister(panel.id);
            }
        });
    }
}
