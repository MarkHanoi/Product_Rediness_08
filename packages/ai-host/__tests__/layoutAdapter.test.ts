// Apartment-layout VALIDATOR ADAPTER tests.
//
// Pins the contract of `toValidationInput` — the pure D-TGL DTO →
// `ApartmentLayoutForValidation` converter. The orchestrator consumes the
// adapter's output directly, so the most important guarantee is the
// "round-trip" test: the adapter result is a valid input to
// `validateApartmentLayout` (no thrown errors, no missing fields).
//
// Test policy:
//   • Build DTOs inline — no `room()` helper. Each test highlights the
//     SPECIFIC field path it pins.
//   • Cover every conservative-default fallback documented in
//     `layout-adapter.ts`'s header: areaM2, widthM/lengthM,
//     longestUsableWallM, externalFrontageM, hasExteriorEdge, glazedAreaM2.
//   • Pin the bubbleGraph-shape → topology-shape edge translation
//     (`{aId, bId}` → `{aId, bId}` — same names but the validator's
//     `AdjacencyEdge` is its own type, not the bubbleGraph's `{a, b, via}`).
//   • Pin the frozen-output contract (mutation throws in strict mode).

import { describe, expect, it } from 'vitest';
import {
    toValidationInput,
    validateApartmentLayout,
    type DtglLayoutDto,
} from '../src/workflows/apartmentLayout/validators/index.js';

describe('toValidationInput — apartment-layout validator adapter', () => {

    // ── Empty DTO ──────────────────────────────────────────────────────────
    it('empty DTO → { rooms: [], edges: [], entranceRoomId: undefined }', () => {
        const out = toValidationInput({ rooms: [] });
        expect(out.rooms).toEqual([]);
        expect(out.edges).toEqual([]);
        expect(out.entranceRoomId).toBeUndefined();
    });

    it('empty edges (omitted) defaults to []', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }],
        });
        expect(out.edges).toEqual([]);
    });

    // ── Single room → derived fields ───────────────────────────────────────
    it('single room → output has one ApartmentLayoutRoom with derived fields', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }],
        });
        expect(out.rooms).toHaveLength(1);
        const room = out.rooms[0]!;
        expect(room.id).toBe('r1');
        expect(room.type).toBe('bedroom');
        expect(room.areaM2).toBe(12);          // 3 × 4
        expect(room.widthM).toBe(3);           // min(3, 4)
        expect(room.lengthM).toBe(4);          // max(3, 4)
        expect(room.longestUsableWallM).toBe(4); // max(widthM, lengthM)
        expect(room.externalFrontageM).toBe(0);
        expect(room.hasExteriorEdge).toBe(false);
        expect(room.glazedAreaM2).toBe(0);
    });

    // ── areaM2 derivation ──────────────────────────────────────────────────
    it('rect.w * rect.h populates areaM2 when areaM2 absent', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'kitchen', rect: { w: 2.5, h: 3.2 } }],
        });
        expect(out.rooms[0]!.areaM2).toBeCloseTo(2.5 * 3.2, 9);
    });

    it('explicit areaM2 honoured (not overwritten by rect math)', () => {
        const out = toValidationInput({
            rooms: [{
                id: 'r1', type: 'kitchen',
                rect: { w: 3, h: 4 },   // would give 12
                areaM2: 7.5,            // explicit override
            }],
        });
        expect(out.rooms[0]!.areaM2).toBe(7.5);
    });

    it('missing rect → areaM2 = 0 when no override (defensive)', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'storage' }],
        });
        expect(out.rooms[0]!.areaM2).toBe(0);
    });

    // ── width / length derivation ──────────────────────────────────────────
    it('widthM / lengthM taken from rect when fields absent (min / max convention)', () => {
        const out = toValidationInput({
            // rect.w is the LONGER side here → widthM must still pick the SHORTER one.
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 5, h: 3 } }],
        });
        expect(out.rooms[0]!.widthM).toBe(3);
        expect(out.rooms[0]!.lengthM).toBe(5);
    });

    it('explicit widthM / lengthM honoured', () => {
        const out = toValidationInput({
            rooms: [{
                id: 'r1', type: 'bedroom',
                rect: { w: 3, h: 4 },
                widthM: 2.5,
                lengthM: 5.0,
            }],
        });
        expect(out.rooms[0]!.widthM).toBe(2.5);
        expect(out.rooms[0]!.lengthM).toBe(5.0);
    });

    // ── longestUsableWallM ─────────────────────────────────────────────────
    it('longestUsableWallM defaults to max(widthM, lengthM) when absent', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }],
        });
        expect(out.rooms[0]!.longestUsableWallM).toBe(4);
    });

    it('explicit longestUsableWallM honoured (e.g. opening-aware upstream)', () => {
        const out = toValidationInput({
            rooms: [{
                id: 'r1', type: 'bedroom',
                rect: { w: 3, h: 4 },
                longestUsableWallM: 2.1,   // shorter than max(w,h) — openings.
            }],
        });
        expect(out.rooms[0]!.longestUsableWallM).toBe(2.1);
    });

    it('AdapterOptions.defaultLongestUsableWallM overrides the default', () => {
        const out = toValidationInput(
            { rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }] },
            { defaultLongestUsableWallM: 1.0 },
        );
        expect(out.rooms[0]!.longestUsableWallM).toBe(1.0);
    });

    // ── externalFrontageM ──────────────────────────────────────────────────
    it('externalFrontageM defaults to 0 when absent', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }],
        });
        expect(out.rooms[0]!.externalFrontageM).toBe(0);
    });

    it('AdapterOptions.defaultExternalFrontageM overrides the default', () => {
        const out = toValidationInput(
            { rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }] },
            { defaultExternalFrontageM: 2.5 },
        );
        expect(out.rooms[0]!.externalFrontageM).toBe(2.5);
    });

    it('explicit externalFrontageM wins over AdapterOptions default', () => {
        const out = toValidationInput(
            { rooms: [{
                id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 },
                externalFrontageM: 4.0,
            }] },
            { defaultExternalFrontageM: 1.0 },
        );
        expect(out.rooms[0]!.externalFrontageM).toBe(4.0);
    });

    // ── hasExteriorEdge: derived from externalFrontageM ────────────────────
    it('hasExteriorEdge === (externalFrontageM > 0)', () => {
        const zero = toValidationInput({
            rooms: [{
                id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 },
                externalFrontageM: 0,
            }],
        });
        expect(zero.rooms[0]!.hasExteriorEdge).toBe(false);

        const positive = toValidationInput({
            rooms: [{
                id: 'r2', type: 'bedroom', rect: { w: 3, h: 4 },
                externalFrontageM: 2.5,
            }],
        });
        expect(positive.rooms[0]!.hasExteriorEdge).toBe(true);
    });

    it('explicit hasExteriorEdge honoured even when externalFrontageM = 0', () => {
        // Useful for the AI relay path which knows the boolean before frontage.
        const out = toValidationInput({
            rooms: [{
                id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 },
                externalFrontageM: 0,
                hasExteriorEdge: true,
            }],
        });
        expect(out.rooms[0]!.hasExteriorEdge).toBe(true);
        expect(out.rooms[0]!.externalFrontageM).toBe(0);
    });

    // ── glazedAreaM2 ───────────────────────────────────────────────────────
    it('glazedAreaM2 defaults to 0 when absent', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }],
        });
        expect(out.rooms[0]!.glazedAreaM2).toBe(0);
    });

    it('AdapterOptions.defaultGlazedAreaM2 overrides the default', () => {
        const out = toValidationInput(
            { rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }] },
            { defaultGlazedAreaM2: 2.0 },
        );
        expect(out.rooms[0]!.glazedAreaM2).toBe(2.0);
    });

    // ── entranceRoomId propagation ─────────────────────────────────────────
    it('entranceRoomId propagated when present', () => {
        const out = toValidationInput({
            rooms: [{ id: 'h', type: 'entrance_hall', rect: { w: 2, h: 3 } }],
            entranceRoomId: 'h',
        });
        expect(out.entranceRoomId).toBe('h');
    });

    it('entranceRoomId undefined when omitted (no synthetic value)', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }],
        });
        expect(out.entranceRoomId).toBeUndefined();
        // The property itself must NOT be present (avoid surprise in
        // JSON.stringify / spread shape).
        expect(Object.prototype.hasOwnProperty.call(out, 'entranceRoomId')).toBe(false);
    });

    // ── Edges: aId / bId pass-through (validator namespace shape) ──────────
    it('edges: { aId, bId } → { aId, bId } (validator AdjacencyEdge shape)', () => {
        const dto: DtglLayoutDto = {
            rooms: [
                { id: 'a', type: 'bedroom', rect: { w: 3, h: 4 } },
                { id: 'b', type: 'bathroom', rect: { w: 2, h: 2.5 } },
            ],
            edges: [{ aId: 'a', bId: 'b' }],
        };
        const out = toValidationInput(dto);
        expect(out.edges).toHaveLength(1);
        expect(out.edges[0]!).toEqual({ aId: 'a', bId: 'b' });
    });

    it('edges array preserves order and supports multiple entries', () => {
        const out = toValidationInput({
            rooms: [
                { id: 'a', type: 'hall', rect: { w: 2, h: 3 } },
                { id: 'b', type: 'living_room', rect: { w: 5, h: 5 } },
                { id: 'c', type: 'kitchen', rect: { w: 3, h: 4 } },
            ],
            edges: [
                { aId: 'a', bId: 'b' },
                { aId: 'b', bId: 'c' },
                { aId: 'a', bId: 'c' },
            ],
        });
        expect(out.edges.map(e => `${e.aId}-${e.bId}`)).toEqual([
            'a-b', 'b-c', 'a-c',
        ]);
    });

    // ── Frozen output ──────────────────────────────────────────────────────
    it('frozen output: cannot push to output.rooms', () => {
        const out = toValidationInput({ rooms: [] });
        expect(Object.isFrozen(out)).toBe(true);
        expect(Object.isFrozen(out.rooms)).toBe(true);
        expect(Object.isFrozen(out.edges)).toBe(true);
        // ESM/vitest runs in strict mode → push() throws.
        expect(() => {
            (out.rooms as unknown as Array<unknown>).push({});
        }).toThrow();
        expect(() => {
            (out.edges as unknown as Array<unknown>).push({});
        }).toThrow();
    });

    it('frozen output: per-room records are frozen', () => {
        const out = toValidationInput({
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }],
        });
        expect(Object.isFrozen(out.rooms[0])).toBe(true);
        expect(() => {
            (out.rooms[0] as unknown as { areaM2: number }).areaM2 = 999;
        }).toThrow();
    });

    // ── Input not mutated ──────────────────────────────────────────────────
    it('input DTO is NOT mutated by the adapter', () => {
        const dto: DtglLayoutDto = {
            rooms: [{ id: 'r1', type: 'bedroom', rect: { w: 3, h: 4 } }],
            edges: [],
            entranceRoomId: 'r1',
        };
        const roomsBefore = JSON.stringify(dto.rooms);
        const edgesBefore = JSON.stringify(dto.edges);
        toValidationInput(dto);
        expect(JSON.stringify(dto.rooms)).toBe(roomsBefore);
        expect(JSON.stringify(dto.edges)).toBe(edgesBefore);
    });

    // ── Round-trip: adapter output is a valid orchestrator input ───────────
    it('round-trip: adapter output can be passed directly to validateApartmentLayout', () => {
        const dto: DtglLayoutDto = {
            rooms: [
                { id: 'h', type: 'entrance_hall', rect: { w: 2, h: 3 },
                    longestUsableWallM: 1.5 },
                { id: 'c', type: 'corridor', rect: { w: 1.2, h: 3.3 } },
                { id: 'l', type: 'living_room', rect: { w: 5, h: 5 },
                    externalFrontageM: 3, glazedAreaM2: 4 },
                { id: 'b', type: 'bedroom', rect: { w: 3, h: 4 },
                    externalFrontageM: 2, glazedAreaM2: 2.5 },
                { id: 'ba', type: 'bathroom', rect: { w: 2, h: 2.5 },
                    longestUsableWallM: 1.5 },
            ],
            edges: [
                { aId: 'h', bId: 'c' },
                { aId: 'h', bId: 'l' },
                { aId: 'c', bId: 'b' },
                { aId: 'c', bId: 'ba' },
                { aId: 'b', bId: 'ba' },
            ],
            entranceRoomId: 'h',
        };
        const input = toValidationInput(dto);
        // No throw — adapter output is the orchestrator's required shape.
        const report = validateApartmentLayout(input);
        // The report must come back as the canonical aggregated shape.
        expect(report).toHaveProperty('errors');
        expect(report).toHaveProperty('warnings');
        expect(report).toHaveProperty('total');
        expect(report).toHaveProperty('dimensional');
        expect(report).toHaveProperty('topology');
        expect(report).toHaveProperty('violationsByClass');
    });
});
