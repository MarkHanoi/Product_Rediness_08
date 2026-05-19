/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    AI Integration
 * Phase:             Phase 9
 * Files Modified:    src/ai/rooms/RoomAIAssistant.ts
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/07-ROOM-AI-WORLDMODEL-CONTRACT.md
 *   docs/01_ELEMENTS/09_Rooms_Contract/ROOM-IMPLEMENTATION-PLAN.md §9.1
 *   docs/00_Contracts/04-BIM-AI-MODIFICATION-PROTOCOL.md
 *   docs/00_Contracts/07-BIM-SECURITY-CONTRACT.md
 *
 * All LLM calls are proxied through the Express server — never call
 * Anthropic or CF Worker directly from the client (§07-BIM-SECURITY-CONTRACT §1.4).
 *
 * All AI mutations go through commandManager.execute() — never write
 * to roomStore directly from this file (§04-BIM-AI-MODIFICATION-PROTOCOL).
 *
 * Input sanitisation applied before all API calls.
 * Response validation with Zod-like schema checks before executing commands.
 */

import { RenameRoomCommand, UpdateRoomFinishesCommand, CreateRoomCommand } from '@pryzm/command-registry';
import { RoomData, RoomFinishes } from '@pryzm/room-topology';
import { worldModelAdapter } from '../WorldModelAdapter.js';

// ── Sanitisation helper ────────────────────────────────────────────────────────

function sanitiseStr(raw: unknown, maxLen: number): string {
    if (typeof raw !== 'string') return '';
    return raw.replace(/[<>&"']/g, '').slice(0, maxLen).trim();
}

// ── API fetch helper ───────────────────────────────────────────────────────────

async function apiFetch<T>(
    path: string,
    body: Record<string, unknown>,
    validate: (data: unknown) => T,
): Promise<T> {
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
    });

    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as any).error ?? `HTTP ${res.status}`);
    }

    const data = await res.json();
    return validate(data);
}

// ── Adjacency analysis result ─────────────────────────────────────────────────

export interface AdjacencyAnalysisResult {
    clusters: Array<{
        rooms: string[];
        suggestedZone: string;
    }>;
    warnings: string[];
}

// ── RoomAIAssistant ───────────────────────────────────────────────────────────

export class RoomAIAssistant {
    constructor(
        private readonly commandManager: any,
        private readonly roomStore: any,
    ) {}

    /**
     * Suggest a name for a room based on occupancy, area, and context.
     * Executes RenameRoomCommand on success.
     */
    async suggestName(roomId: string): Promise<string> {
        const room: RoomData | undefined = this.roomStore.getById(roomId);
        if (!room) throw new Error(`Room '${roomId}' not found`);

        const safeOccupancy = sanitiseStr(room.occupancyType, 50);
        const safeArea      = Math.max(0, Math.min(10000, room.computed.area));

        let buildingContext: string | undefined;
        try { buildingContext = worldModelAdapter.toPromptContext('current'); } catch { /* non-fatal */ }

        const result = await apiFetch(
            '/api/ai/rooms/suggest-name',
            { roomId, occupancy: safeOccupancy, area: safeArea, buildingContext },
            (data: any) => {
                if (typeof data?.name !== 'string' || !data.name.trim()) {
                    throw new Error('Invalid AI response: missing name');
                }
                return { name: sanitiseStr(data.name, 100) };
            },
        );

        // [E.5.x P12] Real typed dispatch — parallel write to plugin store (SetRoomNameHandler); legacy commandManager writes to legacy store.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('room.setName', { roomId, name: result.name }).catch(() => {}); }
        this.commandManager.execute(new RenameRoomCommand(roomId, { name: result.name }));

        console.log(`[RoomAIAssistant] Renamed room '${roomId}' to '${result.name}'`);
        return result.name;
    }

    /**
     * Suggest finishes for a room based on its occupancy type.
     * Executes UpdateRoomFinishesCommand on success.
     */
    async suggestFinishes(roomId: string): Promise<RoomFinishes> {
        const room: RoomData | undefined = this.roomStore.getById(roomId);
        if (!room) throw new Error(`Room '${roomId}' not found`);

        const safeOccupancy = sanitiseStr(room.occupancyType, 50);

        let buildingContext: string | undefined;
        try { buildingContext = worldModelAdapter.toPromptContext('current'); } catch { /* non-fatal */ }

        const result = await apiFetch(
            '/api/ai/rooms/suggest-finishes',
            { roomId, occupancy: safeOccupancy, buildingContext },
            (data: any) => {
                if (!data?.finishes || typeof data.finishes !== 'object') {
                    throw new Error('Invalid AI response: missing finishes');
                }
                return data.finishes as RoomFinishes;
            },
        );

        // [E.5.x P12] Improved stub — finishes update; room.updateFinishes registered in commands.ts but no handler yet (phase F.room-finishes).
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('room.updateFinishes', { roomId, finishes: result as Record<string, unknown> }).catch(() => {}); }
        this.commandManager.execute(new UpdateRoomFinishesCommand(roomId, result));

        console.log(`[RoomAIAssistant] Suggested finishes for room '${roomId}'`);
        return result;
    }

    /**
     * Generate a programme of rooms for a level from a text brief.
     * Executes BatchCreateRoomsCommand on success.
     */
    async generateProgramme(levelId: string, brief: string): Promise<void> {
        const safeLevelId = sanitiseStr(levelId, 50);
        const safeBrief   = sanitiseStr(brief, 500);

        const result = await apiFetch(
            '/api/ai/rooms/generate-programme',
            { levelId: safeLevelId, brief: safeBrief },
            (data: any) => {
                if (!Array.isArray(data?.rooms)) {
                    throw new Error('Invalid AI response: missing rooms array');
                }
                return data as { rooms: any[] };
            },
        );

        // Each room in the programme must go through CreateRoomCommand
        for (const roomSpec of result.rooms) {
            try {
                // [E.5.x P12] Real typed dispatch — parallel write to plugin store (CreateRoomHandler); legacy commandManager writes to legacy store.
                if (window.runtime?.bus) { window.runtime.bus.executeCommand('room.create', { ...(roomSpec as Record<string, unknown>) }).catch(() => {}); }
                this.commandManager.execute(new CreateRoomCommand(roomSpec));
            } catch (err) {
                console.warn(`[RoomAIAssistant] Failed to create programme room:`, err);
            }
        }

        console.log(`[RoomAIAssistant] Generated ${result.rooms.length} room(s) for level '${levelId}'`);
    }

    /**
     * Analyse adjacency patterns and suggest occupancy groupings.
     */
    async analyseAdjacency(levelId: string): Promise<AdjacencyAnalysisResult> {
        const safeLevelId = sanitiseStr(levelId, 50);
        const rooms = this.roomStore.getByLevel(levelId).map((r: RoomData) => ({
            id:           r.id,
            name:         sanitiseStr(r.name, 100),
            occupancy:    sanitiseStr(r.occupancyType, 50),
            area:         r.computed.area,
            centroid:     r.computed.centroid,
            wallIds:      r.boundingWallIds,
        }));

        const result = await apiFetch(
            '/api/ai/rooms/analyse-adjacency',
            { levelId: safeLevelId, rooms },
            (data: any) => {
                if (!Array.isArray(data?.clusters)) {
                    throw new Error('Invalid AI response: missing clusters');
                }
                return data as AdjacencyAnalysisResult;
            },
        );

        console.log(`[RoomAIAssistant] Adjacency analysis for level '${levelId}':`, result.clusters.length, 'cluster(s)');
        return result;
    }
}
