/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    AI / Validation
 * Phase:             Phase 9
 * Files Modified:    src/ai/rooms/RoomAICommandValidator.ts
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/07-ROOM-AI-WORLDMODEL-CONTRACT.md
 *   docs/02-decisions/contracts/04-BIM-AI-MODIFICATION-PROTOCOL.md §2.4
 *   docs/02-decisions/contracts/07-BIM-SECURITY-CONTRACT.md §3
 *
 * Pre-validation of AI-generated room payloads before they are fed to commands.
 * Ensures all AI mutations are safe and schema-compliant.
 */

// ── Validation result ─────────────────────────────────────────────────────────

export interface ValidationResult {
    ok: boolean;
    errors: string[];
}

// ── AI payload shapes ─────────────────────────────────────────────────────────

export interface AISuggestNamePayload {
    roomId: string;
    occupancy: string;
    area: number;
}

export interface AISuggestFinishesPayload {
    roomId: string;
    occupancy: string;
}

export interface AIGenerateProgrammePayload {
    levelId: string;
    brief: string;
}

export interface AIAnalyseAdjacencyPayload {
    levelId: string;
    rooms: unknown[];
}

// ── Validators ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidId(id: unknown): boolean {
    return typeof id === 'string' && UUID_RE.test(id);
}

export class RoomAICommandValidator {

    static validateSuggestName(payload: unknown): ValidationResult {
        const errors: string[] = [];
        const p = payload as AISuggestNamePayload;

        if (!isValidId(p?.roomId)) errors.push('roomId: must be a valid UUID');
        if (typeof p?.occupancy !== 'string' || !p.occupancy.trim()) errors.push('occupancy: required string');
        if (typeof p?.area !== 'number' || p.area < 0 || p.area > 50000) errors.push('area: must be number 0–50000');

        return { ok: errors.length === 0, errors };
    }

    static validateSuggestFinishes(payload: unknown): ValidationResult {
        const errors: string[] = [];
        const p = payload as AISuggestFinishesPayload;

        if (!isValidId(p?.roomId)) errors.push('roomId: must be a valid UUID');
        if (typeof p?.occupancy !== 'string' || !p.occupancy.trim()) errors.push('occupancy: required string');

        return { ok: errors.length === 0, errors };
    }

    static validateGenerateProgramme(payload: unknown): ValidationResult {
        const errors: string[] = [];
        const p = payload as AIGenerateProgrammePayload;

        if (!isValidId(p?.levelId) && typeof p?.levelId !== 'string') errors.push('levelId: required string');
        if (typeof p?.brief !== 'string' || p.brief.trim().length < 5) errors.push('brief: must be at least 5 characters');
        if (typeof p?.brief === 'string' && p.brief.length > 2000) errors.push('brief: exceeds 2000 character limit');

        return { ok: errors.length === 0, errors };
    }

    static validateAnalyseAdjacency(payload: unknown): ValidationResult {
        const errors: string[] = [];
        const p = payload as AIAnalyseAdjacencyPayload;

        if (!isValidId(p?.levelId) && typeof p?.levelId !== 'string') errors.push('levelId: required string');
        if (!Array.isArray(p?.rooms)) errors.push('rooms: required array');
        if (Array.isArray(p?.rooms) && p.rooms.length > 200) errors.push('rooms: exceeds 200 room limit');

        return { ok: errors.length === 0, errors };
    }

    /**
     * Sanitise AI name response before executing command.
     */
    static sanitiseName(raw: unknown): string | null {
        if (typeof raw !== 'string') return null;
        const trimmed = raw.replace(/[<>&"']/g, '').trim().slice(0, 100);
        return trimmed.length >= 1 ? trimmed : null;
    }

    /**
     * Sanitise AI finishes response.
     */
    static sanitiseFinishes(raw: unknown): Record<string, { materialName: string; materialColor: string }> | null {
        if (!raw || typeof raw !== 'object') return null;
        const out: Record<string, { materialName: string; materialColor: string }> = {};
        for (const key of ['floor', 'walls', 'ceiling']) {
            const f = (raw as any)[key];
            if (f && typeof f.materialName === 'string') {
                out[key] = {
                    materialName:  f.materialName.slice(0, 100),
                    materialColor: typeof f.materialColor === 'string' ? f.materialColor.slice(0, 7) : '#ffffff',
                };
            }
        }
        return Object.keys(out).length > 0 ? out : null;
    }
}
