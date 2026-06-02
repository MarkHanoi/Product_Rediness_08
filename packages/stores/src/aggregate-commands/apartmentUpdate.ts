// A.23.c.3 (Phase A · Sprint 2) — `apartment.update` command handler.
//
// Per [C20 §4.3]: patches mutable Apartment fields + optionally the
// parameters record. Re-validates unitNumber uniqueness if it changes.
// Keeps `parameters.id === Apartment.id` per [§1.5].

import {
    ApartmentSchema,
    type Apartment,
    type ApartmentId,
    type BuildingId,
    type LevelId,
} from '@pryzm/schemas/aggregates';
import type { LevelStore } from '../LevelStore.js';
import type { ApartmentStore } from '../ApartmentStore.js';
import {
    ApartmentUpdatePayloadSchema,
    type AggregateCommandResult,
    type ApartmentUpdatedEvent,
} from './types.js';

export function apartmentUpdate(
    rawPayload: unknown,
    levelStore: LevelStore,
    apartmentStore: ApartmentStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<ApartmentUpdatedEvent> {
    let payload;
    try {
        payload = ApartmentUpdatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `apartment.update payload invalid: ${(err as Error).message}`,
        };
    }

    const prior = apartmentStore.get(payload.id as ApartmentId);
    if (!prior) {
        return {
            ok: false,
            reason: 'no-apartment',
            message: `apartment.update: no Apartment with id '${payload.id}'`,
        };
    }

    // If unitNumber changes, re-check uniqueness within Building.
    if (
        payload.patch.unitNumber !== undefined &&
        payload.patch.unitNumber !== prior.unitNumber
    ) {
        const collision = apartmentStore.findByUnitNumber(
            prior.buildingId as BuildingId,
            payload.patch.unitNumber,
        );
        if (collision && collision.id !== prior.id) {
            return {
                ok: false,
                reason: 'unit-number-conflict',
                message:
                    `apartment.update: unitNumber '${payload.patch.unitNumber}' ` +
                    `already exists in Building '${prior.buildingId}'`,
            };
        }
    }

    // If levelId changes, validate the new Level + buildingId match.
    if (
        payload.patch.levelId !== undefined &&
        payload.patch.levelId !== prior.levelId
    ) {
        const newLevel = levelStore.get(payload.patch.levelId as LevelId);
        if (!newLevel) {
            return {
                ok: false,
                reason: 'no-level',
                message:
                    `apartment.update: new Level '${payload.patch.levelId}' ` +
                    `does not exist`,
            };
        }
        if (newLevel.buildingId !== prior.buildingId) {
            return {
                ok: false,
                reason: 'apartment-level-mismatch',
                message:
                    `apartment.update: new Level '${payload.patch.levelId}' ` +
                    `belongs to Building '${newLevel.buildingId}', not ` +
                    `'${prior.buildingId}'`,
            };
        }
    }

    // Compose the next Apartment + parameters patch.
    const nextRaw: Record<string, unknown> = { ...prior };
    if (payload.patch.name !== undefined) nextRaw.name = payload.patch.name;
    if (payload.patch.unitNumber !== undefined) {
        nextRaw.unitNumber = payload.patch.unitNumber;
    }
    if (payload.patch.levelId !== undefined) {
        nextRaw.levelId = payload.patch.levelId;
    }
    nextRaw.updatedAt = now();
    if (payload.parameterPatch !== undefined) {
        // Merge parameters; ensure id stays = Apartment.id per §1.5.
        const paramsPatch =
            payload.parameterPatch as Record<string, unknown> | null;
        nextRaw.parameters = {
            ...(prior.parameters as Record<string, unknown>),
            ...(paramsPatch ?? {}),
            id: prior.id,
        };
    }

    let next: Apartment;
    try {
        next = ApartmentSchema.parse(nextRaw);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `apartment.update: post-patch validation failed: ${(err as Error).message}`,
        };
    }

    apartmentStore.update(next);
    return {
        ok: true,
        event: {
            type: 'apartment.updated',
            apartment: next,
            prior,
        },
    };
}
