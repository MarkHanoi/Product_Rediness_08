// A.23.c.3 (Phase A · Sprint 2) — `apartment.create` command handler.
//
// Per [C20 §4.3 + §1.3 + §1.5]:
//   - Level (levelId) exists in LevelStore
//   - Level.buildingId === payload.buildingId
//   - unitNumber UNIQUE within Building
//   - parameters.id === Apartment.id (composed at handler time)

import {
    ApartmentSchema,
    type Apartment,
    type LevelId,
    type BuildingId,
} from '@pryzm/schemas/aggregates';
import type { LevelStore } from '../LevelStore.js';
import type { ApartmentStore } from '../ApartmentStore.js';
import {
    ApartmentCreatePayloadSchema,
    type AggregateCommandResult,
    type ApartmentCreatedEvent,
} from './types.js';

let apartmentCounter = 0;
function mintApartmentId(unitNumber: string): string {
    apartmentCounter += 1;
    const slug = unitNumber.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `apt_${slug}_${apartmentCounter}`;
}

export function apartmentCreate(
    rawPayload: unknown,
    levelStore: LevelStore,
    apartmentStore: ApartmentStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<ApartmentCreatedEvent> {
    let payload;
    try {
        payload = ApartmentCreatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `apartment.create payload invalid: ${(err as Error).message}`,
        };
    }

    // §1.3 — Level MUST exist + must belong to the right Building.
    const level = levelStore.get(payload.levelId as LevelId);
    if (!level) {
        return {
            ok: false,
            reason: 'no-level',
            message: `apartment.create: no Level with id '${payload.levelId}'`,
        };
    }
    if (level.buildingId !== payload.buildingId) {
        return {
            ok: false,
            reason: 'apartment-level-mismatch',
            message:
                `apartment.create: Level '${payload.levelId}' belongs to ` +
                `Building '${level.buildingId}', but payload.buildingId is ` +
                `'${payload.buildingId}'`,
        };
    }

    // §1.3 — unitNumber UNIQUE within Building.
    if (
        apartmentStore.findByUnitNumber(
            payload.buildingId as BuildingId,
            payload.unitNumber,
        )
    ) {
        return {
            ok: false,
            reason: 'unit-number-conflict',
            message:
                `apartment.create: unitNumber '${payload.unitNumber}' already ` +
                `exists in Building '${payload.buildingId}' per [C20 §1.3]`,
        };
    }

    // Mint id + compose parameters.id to match (§1.5).
    const apartmentId = mintApartmentId(payload.unitNumber);
    const paramsRaw = payload.parameters as Record<string, unknown> | undefined;
    const parameters = { ...(paramsRaw ?? {}), id: apartmentId };
    const ts = now();
    let apartment: Apartment;
    try {
        apartment = ApartmentSchema.parse({
            id: apartmentId,
            buildingId: payload.buildingId,
            levelId: payload.levelId,
            name: payload.name,
            unitNumber: payload.unitNumber,
            parameters,
            createdAt: ts,
            updatedAt: ts,
        });
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `apartment.create: SchemaParseFailed (likely parameters): ` +
                `${(err as Error).message}`,
        };
    }

    apartmentStore.add(apartment);
    return {
        ok: true,
        event: { type: 'apartment.created', apartment },
    };
}
