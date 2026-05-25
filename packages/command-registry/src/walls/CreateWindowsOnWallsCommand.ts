/**
 * CreateWindowsOnWallsCommand — SPEC-SEMANTIC §10 prompts #11–#13 (first cut).
 *
 * "Windows evenly distributed on these walls": given a set of wall ids (resolved
 * by the caller from SL-3 façade orientation — e.g. all south-facing exterior
 * walls), place N evenly-distributed window openings per wall. The command is
 * "dumb" about WHICH walls (C17 §9/§10 — scope resolved in the build/proposal
 * layer); it owns HOW MANY + WHERE along each wall.
 *
 * Hosted-element path (C15): each window is created via `CreateWallOpeningCommand`
 * (opening void on the wall + windowStore record + spatial/semantic registration),
 * so undo removes both the void and the window. One coalesced undo unit via
 * `batchCoordinator.runBatch`.
 *
 * Even distribution: a wall of length L gets N = clamp(floor(L / spacing)) windows
 * of width W, each centred in its L/N segment → left-edge offset_i =
 * (i + 0.5)·(L/N) − W/2 (offset = distance from wall start to the opening's left
 * edge — WallOccupancyStore convention). N is reduced until W fits its segment;
 * walls shorter than one window are skipped.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { CreateWallOpeningCommand } from './CreateWallOpeningCommand';
import { batchCoordinator } from '@pryzm/core-app-model';

export interface CreateWindowsOnWallsPayload {
    /** Walls to place windows on (resolved by the caller, e.g. SL-3 south façades). */
    wallIds: string[];
    /** Window width (m). #11 default 1.2. */
    width?: number;
    /** Window height (m). #11 default 1.4. */
    height?: number;
    /** Sill height (m). #11 default 0.9. */
    sillHeight?: number;
    /** Target spacing (m) — roughly one window per `spacing` of wall length. */
    spacing?: number;
    windowType?: 'single' | 'double';
    systemTypeId?: string;
}

export class CreateWindowsOnWallsCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_WINDOWS_ON_WALLS;
    readonly timestamp: number;
    targetIds: string[] = [];
    private createdCommands: CreateWallOpeningCommand[] = [];

    constructor(private payload: CreateWindowsOnWallsPayload) {
        this.id = `cmd-windows-on-walls-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!context.stores.wallStore) return { ok: false, reason: 'Wall store not available.' };
        if (!this.payload.wallIds || this.payload.wallIds.length === 0) {
            return { ok: false, reason: 'No façade walls matched — none of the requested orientation.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        if (!wallStore) return { success: false, affectedElementIds: [] };

        const W = this.payload.width ?? 1.2;
        const H = this.payload.height ?? 1.4;
        const sill = this.payload.sillHeight ?? 0.9;
        const spacing = this.payload.spacing ?? 3.0;
        const affectedIds: string[] = [];
        const levelIds = new Set<string>();

        const _process = (): void => {
            for (const wallId of this.payload.wallIds) {
                const wall = wallStore.getById(wallId);
                if (!wall?.baseLine?.[0] || !wall.baseLine[1]) continue;
                if (wall.levelId) levelIds.add(wall.levelId);

                const a = wall.baseLine[0];
                const b = wall.baseLine[1];
                const L = Math.hypot(b.x - a.x, b.z - a.z);
                if (L < W + 0.2) continue; // too short for even one window + margin

                // N windows, each centred in its L/N segment, W ≤ 90% of the segment.
                let n = Math.max(1, Math.floor(L / spacing));
                while (n > 1 && W > (L / n) * 0.9) n--;
                const seg = L / n;

                for (let i = 0; i < n; i++) {
                    const offset = (i + 0.5) * seg - W / 2;
                    if (offset < 0 || offset + W > L) continue;
                    const sub = new CreateWallOpeningCommand({
                        wallId,
                        openingData: {
                            type: 'window',
                            offset,
                            width: W,
                            height: H,
                            sillHeight: sill,
                            windowType: this.payload.windowType ?? 'single',
                            systemTypeId: this.payload.systemTypeId,
                        },
                    });
                    // Respect occupancy (existing openings) — skip rather than overlap.
                    if (!sub.canExecute(context).ok) continue;
                    const res = sub.execute(context);
                    if (res.success && res.affectedElementIds.length) {
                        this.createdCommands.push(sub);
                        affectedIds.push(...res.affectedElementIds);
                    }
                }
            }
        };

        if (this.createdCommands.length === 0) {
            batchCoordinator.runBatch(_process, {
                levelIds: [...levelIds].length ? [...levelIds] : [''],
                totalElementCount: this.payload.wallIds.length,
                skipRedetectRooms: true, // windows don't bound rooms
            });
        } else {
            _process();
        }

        this.targetIds = affectedIds;
        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Created ${affectedIds.length} window(s) across ${this.payload.wallIds.length} façade wall(s).`],
        };
    }

    undo(context: CommandContext): CommandResult {
        const ids: string[] = [];
        for (let i = this.createdCommands.length - 1; i >= 0; i--) {
            const r = this.createdCommands[i].undo(context);
            if (r.success) ids.push(...r.affectedElementIds);
        }
        this.createdCommands = [];
        return { success: true, affectedElementIds: ids };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as unknown as Record<string, unknown>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
