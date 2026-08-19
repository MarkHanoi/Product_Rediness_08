/**
 * handrailSpec — THE ONE resolution of *"what handrail did the user ask for?"*.
 *
 * ⛔ THIS FILE EXISTS BECAUSE THERE WERE TWO ANSWERS AND THEY DISAGREED BY FOUR
 * FIELDS, MEASURED. `RailingPlanToolHandler.resolveArmedHandrailSpec` copied
 * thirteen fields off the armed catalogue type; `HandrailTool.onPointerDown`
 * (3-D) hand-listed **nine** of them and silently omitted `balusterShape`,
 * `balusterWidth`, `balusterSpacing` and `infillMaxGap`. So drawing the SAME
 * catalogue type in 3-D instead of plan produced a DIFFERENT record — the
 * balusters fell back to the builder's defaults and the infill gap the type
 * declared never reached the geometry. That is C84 **EI-9** (one question, two
 * answers, selected by which view the user happened to be in) and it is the same
 * shape as C95 §10.1's `1.1` vs `1.0` height, which this family already paid for
 * once.
 *
 * The cure is not "keep the two lists in sync" — a comment is not a
 * synchronisation mechanism (C84 §8.d). It is that both surfaces call THIS, and
 * neither owns a field list of its own.
 *
 * CONTRACTS: C84 EI-9 · C95 §10.1 / §15.13 · C100 §2.1 (`materialId` is the
 * reference; the hex is a cache and never the authority).
 */

import { handrailTypeStore, type HandrailTypeDefinition } from '@pryzm/core-app-model/stores';
import { resolveActiveHandrailTypeId } from './handrailAuthoring';

/**
 * The fallback geometry when NO catalogue type is armed.
 *
 * ⛔ NOT a rival default set. These are the values `CreateHandrailCommand`'s own
 * callers have always used when no type is selected — `HandrailTool`'s
 * `typeDef?.height ?? 1.0` / `typeDef?.thickness ?? 0.05` — so the two surfaces
 * agree on the un-typed case too. The plan tool's old rival `1.1` is gone.
 */
export const UNTYPED_HANDRAIL_HEIGHT = 1.0;
export const UNTYPED_HANDRAIL_THICKNESS = 0.05;

/** Every geometric field a handrail record needs, resolved from the armed type. */
export interface ResolvedHandrailSpec {
    readonly typeId: string | undefined;
    readonly typeName: string;
    readonly height: number;
    readonly thickness: number;
    readonly baseOffset: number;
    readonly fillType?: string;
    readonly railProfile?: string;
    readonly railDiameter?: number;
    readonly postSpacing?: number;
    readonly balusterShape?: 'rectangular' | 'round';
    readonly balusterWidth?: number;
    readonly balusterSpacing?: number;
    readonly infillMaxGap?: number;
    readonly materialColor?: string;
    /** §C100-HANDRAIL-MATERIAL-ID — the MASTER material the type references. */
    readonly materialId?: string;
}

/**
 * Resolve the armed type into the full field set, shared by the preview and the
 * commit so the ghost can never describe a rail the command will not build.
 */
export function resolveArmedHandrailSpec(
    typeId: string | undefined = resolveActiveHandrailTypeId(),
): ResolvedHandrailSpec {
    const def: HandrailTypeDefinition | undefined = typeId
        ? handrailTypeStore.getById(typeId)
        : undefined;
    if (!def) {
        return {
            typeId: undefined,
            typeName: 'Default Handrail',
            height: UNTYPED_HANDRAIL_HEIGHT,
            thickness: UNTYPED_HANDRAIL_THICKNESS,
            baseOffset: 0,
        };
    }
    return {
        typeId: def.id,
        typeName: def.name,
        height: def.height,
        thickness: def.thickness,
        baseOffset: def.baseOffset,
        fillType: def.fillType,
        railProfile: def.railProfile,
        railDiameter: def.railDiameter,
        postSpacing: def.postSpacing,
        balusterShape: def.balusterShape,
        balusterWidth: def.balusterWidth,
        balusterSpacing: def.balusterSpacing,
        infillMaxGap: def.infillMaxGap,
        materialColor: def.materialColor,
        materialId: def.materialId,
    };
}

/**
 * The spec as the shared payload slice every handrail creation command takes.
 *
 * ⭐ ONE spread, so a field added to `ResolvedHandrailSpec` reaches
 * `CreateHandrailCommand`, `CreateHandrailRunCommand` and
 * `CreateHandrailRunOnSlabCommand` without three edits — which is exactly the
 * hand-listing that lost four fields in 3-D.
 */
export function handrailSharedPayload(spec: ResolvedHandrailSpec, levelId: string): {
    height: number; thickness: number; baseOffset: number;
    fillType?: string; railProfile?: string; railDiameter?: number; postSpacing?: number;
    balusterShape?: 'rectangular' | 'round'; balusterWidth?: number; balusterSpacing?: number;
    infillMaxGap?: number; materialColor?: string; materialId?: string; levelId: string;
} {
    return {
        height: spec.height,
        thickness: spec.thickness,
        baseOffset: spec.baseOffset,
        fillType: spec.fillType,
        railProfile: spec.railProfile,
        railDiameter: spec.railDiameter,
        postSpacing: spec.postSpacing,
        balusterShape: spec.balusterShape,
        balusterWidth: spec.balusterWidth,
        balusterSpacing: spec.balusterSpacing,
        infillMaxGap: spec.infillMaxGap,
        materialColor: spec.materialColor,
        materialId: spec.materialId,
        levelId,
    };
}
