// ─── §FIX-STAIR-PARAM-NO-REGEN (L-215) — declarative element-rebuild registry ──
//
// The DEFECT this replaces: `UpdateElementParameterCommand` carried a hard-coded
// per-element-type `if` ladder deciding how to rebuild geometry after a parameter
// write. Every new element type had to remember to add its own branch — and stair
// was forgotten, so a stair parameter edit wrote the store and stopped (the mesh
// and its derived quantities were never regenerated).
//
// The cure is DECLARATIVE: an element type registers a descriptor stating
//   (a) which parameter keys are geometry-affecting, and
//   (b) which command owns rebuilding its geometry.
// `UpdateElementParameterCommand` consults this registry instead of branching on
// type. Adding a new parametric element = registering one descriptor here; the
// generic command never changes again.
//
// Layer: this lives in @pryzm/command-registry alongside the commands it wires
// (it references command classes in the same package — no new dependency, no
// parallel runtime; P1 single composition root). Authoring a rebuild path through
// a command keeps every mutation on the command bus (P6) and satisfies C16 — the
// rebuild is itself a first-class Command, not an ad-hoc store poke.
//
// ── MIGRATION PATH for window / door / roof (P3 — intentionally NOT migrated) ──
// Their existing branches in UpdateElementParameterCommand.applyUpdate /
// triggerGeometryRebuild keep working untouched. To migrate one later:
//   1. Give it a dedicated "regenerate geometry from parameters" command (as
//      GenerateStairGeometryCommand is for stair) that reconciles any DERIVED
//      fields from the primitives before rebuilding — the reconcile is the part
//      the naive "just re-run the builder" branch was missing.
//   2. Add a descriptor row below with its geometryParams + createRebuildCommand.
//   3. Delete its branch from UpdateElementParameterCommand.
// Migrating them now would be an unreviewable big-bang diff, so it is deferred.

import type { Command } from '../types';
import { GenerateStairGeometryCommand } from '../stair/GenerateStairGeometryCommand';

export interface ElementRebuildDescriptor {
    /** Lower-cased element-type aliases this descriptor serves (e.g. stair | stairs). */
    readonly elementTypes: readonly string[];
    /**
     * Parameter keys whose change requires a geometry rebuild. Keys are matched
     * against the incoming `parameters` object; a dot-notation key (e.g.
     * `properties.railingType`) matches either exactly or by its ROOT segment
     * (`properties`). The sentinel `'*'` marks every change geometry-affecting.
     */
    readonly geometryParams: readonly string[];
    /** Build the command that regenerates this element's geometry from its parameters. */
    createRebuildCommand(elementId: string): Command;
}

const DESCRIPTORS: readonly ElementRebuildDescriptor[] = [
    {
        elementTypes: ['stair', 'stairs'],
        // Every one of these feeds StairMeshBuilder's derived output:
        //   width      → tread width + landing depth
        //   riserHeight→ riser count + adjusted height
        //   treadDepth → going + U flight-2 offset
        //   shape / turnDirection / secondRunSide / stepsBeforeLanding → flight layout
        //   startPosition / flights / landings / base/topLevelId → placement + run
        //   properties → riserVisible, nosing, stringer, handrail, railingType (all mesh)
        //   typeId     → type-default geometry
        geometryParams: [
            'width', 'riserHeight', 'treadDepth', 'shape',
            'turnDirection', 'secondRunSide', 'stepsBeforeLanding',
            'startPosition', 'flights', 'landings',
            'baseLevelId', 'topLevelId', 'typeId',
            'properties',
        ],
        createRebuildCommand: (id: string) => new GenerateStairGeometryCommand({ stairId: id }),
    },
];

const BY_TYPE = new Map<string, ElementRebuildDescriptor>();
for (const descriptor of DESCRIPTORS) {
    for (const type of descriptor.elementTypes) {
        BY_TYPE.set(type, descriptor);
    }
}

/** Resolve the rebuild descriptor for an element type, or undefined if none is registered. */
export function resolveElementRebuildDescriptor(elementType: string): ElementRebuildDescriptor | undefined {
    return BY_TYPE.get(elementType.toLowerCase().trim());
}

/** True if any of the changed parameter keys is geometry-affecting for this descriptor. */
export function isGeometryAffectingChange(
    descriptor: ElementRebuildDescriptor,
    changedKeys: readonly string[],
): boolean {
    if (descriptor.geometryParams.includes('*')) return true;
    return changedKeys.some(key => {
        if (descriptor.geometryParams.includes(key)) return true;
        const root = key.split('.')[0];
        return descriptor.geometryParams.includes(root);
    });
}
