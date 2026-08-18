/**
 * §FT2 — the record the `beam.created` bus→legacy-store mirror writes.
 *
 * ─── WHY THIS IS A FUNCTION AND NOT A CLOSURE INSIDE initTools.ts ────────────
 * Extracted for exactly the reason `roofCreatedMirror.ts` was: `initTools` is a
 * ~2600-line function needing a THREE world, a components registry, a command
 * manager and twenty stores before its first line runs, so nothing could
 * EXECUTE this mapping in a test. A bridge body no test can reach is a bridge
 * body no test can measure — which is how C84 §9 came to list eleven of them as
 * unread, and how the defect below survived in plain sight.
 *
 * Behaviour is NOT unchanged: see §FIX-BEAM-BRIDGE-LOADBEARING below.
 */

/** The `beam.created` fields this mapping consumes. Structurally a subset of
 *  `RuntimeEvents['beam.created']`, declared locally so this module stays free
 *  of a runtime-composer import (and of the pdfjs-bearing barrel behind it). */
export interface BeamCreatedEventLike {
    id?: string;
    levelId?: string;
    startPoint?: { x: number; y: number; z: number };
    endPoint?: { x: number; y: number; z: number };
    shape?: string;
    width?: number;
    depth?: number;
    materialId?: string;
    /** §FIX-BEAM-CEB-STEEL (L-974) — all three are now on the L0 `Beam` schema
     *  and relayed from the COMMITTED record by `CommandEventBridge`. */
    loadBearing?: boolean;
    fireRating?: string;
    steelProfileName?: string;
}

export interface MirroredBeamRecord {
    id: string;
    levelId: string;
    startPoint: { x: number; y: number; z: number };
    endPoint: { x: number; y: number; z: number };
    sectionType: 'rectangular' | 'UB';
    width: number;
    depth: number;
    loadBearing: boolean;
    properties: Record<string, unknown>;
    material?: string;
    fireRating?: string;
    steelProfileName?: string;
}

/**
 * §FIX-BEAM-BRIDGE-LOADBEARING (C84 EI-2a · C79 §7.4 · C11 §3) — the repo's ONE
 * default for a beam whose creator did not state whether it is load-bearing.
 *
 * ⚠ THE MIRROR USED TO WRITE THE OPPOSITE OF THIS, AS A LITERAL.
 * `BeamData.loadBearing` is REQUIRED (`packages/core-app-model/src/stores/
 * BeamTypes.ts:18` — `boolean`, not optional), so the mirror must write
 * something; it wrote `false`. Every OTHER creation path writes `true`:
 * `CreateBeamCommand.ts:190` (`this.input.loadBearing ?? true`, the path the 3-D
 * `BeamTool`, the project loader and the IFC importer all go through) and
 * `BeamCommandPlan.ts:204`.
 *
 * The field is read, and by consumers that matter: `BeamReader.ts:23` writes it
 * into the exported IFC pset as `LoadBearing`; `ScheduleExtractor.ts:414` prints
 * it as Yes/No in the beam schedule; `RuleEngine.ts:1005` filters
 * `loadBearing === true && !fireRating` for a fire-rating check. So a beam drawn
 * in PLAN exported as `LoadBearing=false`, read "No" on the schedule, and was
 * skipped by the fire-rating rule — while the SAME beam drawn in 3-D did none of
 * those things. C79 §7.4 rates per-path divergence as worse than uniform
 * absence, and this one has a compliance consequence.
 *
 * ⚠ THIS NOTE USED TO END: "AND THE FIX IS NOT `ev.loadBearing ?? true` …
 * `loadBearing` is not on [the emitter's named subset], nor is it on the L0
 * `Beam` schema. Reading a field no emitter produces is EI-2 mechanism (b)."
 * That was true when written and is NO LONGER TRUE — §FIX-BEAM-CEB-STEEL
 * (L-974) put `loadBearing` on the L0 schema, taught `CreateBeamHandler` to
 * accept it, and made `CommandEventBridge` relay it off the COMMITTED record.
 * The read below is `ev.loadBearing ?? BEAM_LOAD_BEARING_DEFAULT`, and its left
 * arm now runs. This constant is the fallback for a beam whose creator said
 * nothing — no longer a stand-in for a value the hop could not carry.
 */
export const BEAM_LOAD_BEARING_DEFAULT = true;

/**
 * §FIX-BEAM-CEB-STEEL (L-974) — L0 `shape` → legacy `BeamData.sectionType`.
 *
 * `BeamTypes.ts:34` declares `'rectangular' | 'UB' | 'UC'`; the L0 `Beam` schema
 * declares `shape ∈ {'rectangular','i-section','t-section'}`. The two
 * vocabularies OVERLAP IN ONE MEMBER, which is why this is a table and not a
 * cast — `sectionType: (ev.shape ?? 'rectangular') as any` is the site C84
 * EI-2(c) names by line number, and it is what let `'i-section'` land in a union
 * that has no such member and render as a box.
 *
 * `i-section` → `UB` and not `UC`: `CreateBeamHandler` refuses
 * `sectionType: 'UC'` at the command, precisely so nothing can arrive here as an
 * I-section that the author called a UC. The map is therefore total over what
 * can reach it, rather than picking one of two and hoping.
 *
 * `t-section` is absent deliberately — the legacy union cannot hold it, and the
 * disposition for that is refusal, below.
 */
const SHAPE_TO_LEGACY_SECTION: Readonly<Record<string, 'rectangular' | 'UB'>> = {
    'rectangular': 'rectangular',
    'i-section': 'UB',
};

/**
 * Build the legacy `BeamData` a `beam.created` event describes, or `null` when
 * the event is unusable — either because it carries no geometry (the caller's
 * guard clause) or because its `shape` has no legacy representation.
 *
 * ─── §FIX-BEAM-BRIDGE-SECTION (C84 EI-2c) ───────────────────────────────────
 * The mapping used to be `sectionType: (ev.shape ?? 'rectangular') as any` —
 * C84 EI-2(c) names this site by line number as an `as any` at a bridge, and it
 * is what blinded `tsc` to `'i-section'` / `'t-section'` landing in a union that
 * has neither. `BeamFragmentBuilder.ts:120` gates its steel branch on
 * `(sectionType === 'UB' || sectionType === 'UC') && steelProfileName`, so
 * neither value matches and the beam silently rendered as a plain concrete box —
 * a shape the author did not draw.
 *
 * ⚠ LATENT, NOT LIVE, and recorded as such: no creation surface emits either
 * member today (`BeamPlanToolHandler`, `CopyPlanToolHandler`, `plugins/beam`'s
 * tool all send no `shape` at all; the only occurrences in the tree are
 * `apps/bench/src/benches/produce-beam.bench.ts`). It is fixed anyway because a
 * dormant silent-mislabel is the thing C84 §9 exists to stop being invisible.
 *
 * The disposition follows the precedent this same file already set for the
 * handrail (ADR-0332 §2 defect 1, `initTools.ts` §FIX-HANDRAIL-BRIDGE-TRUNCATION):
 * where the legacy model cannot hold what the author specified, DECLINE BY NAME
 * and leave no record, rather than build something else and let them believe it
 * survived. A refusal is a correct answer; a silently-wrong beam is not
 * (`WallRake.ts:50-62`).
 */
export function beamRecordFromCreatedEvent(ev: BeamCreatedEventLike): MirroredBeamRecord | null {
    if (!ev.id || !ev.startPoint || !ev.endPoint) return null;

    const shape = ev.shape ?? 'rectangular';
    const sectionType = SHAPE_TO_LEGACY_SECTION[shape];
    if (sectionType === undefined) {
        console.error(
            `[beamCreatedMirror] §FIX-BEAM-BRIDGE-SECTION: REFUSED beam ${ev.id} — its shape ` +
            `"${shape}" has no member in the legacy BeamData.sectionType vocabulary ` +
            `('rectangular' | 'UB' | 'UC'), so no beam was created. Previously the value was ` +
            `cast through 'as any' and BeamFragmentBuilder rendered a plain rectangular box, ` +
            `silently, for a section the author did not draw.`,
        );
        return null;
    }

    // §FIX-BEAM-CEB-STEEL (L-974) — an I-section with no profile name cannot be
    // BUILT. `BeamFragmentBuilder.ts:253` gates its steel branch on
    // `(sectionType === 'UB' || 'UC') && steelProfileName`, and `:438` looks the
    // name up in `SteelProfileLibrary`; with no name it falls through to
    // `_buildConcreteBeam` and draws a plain box for a steel member. That is the
    // same silent-substitution defect as the `as any` above, so it takes the same
    // disposition: refuse by name (ADR-0332 §2 precedent).
    if (sectionType === 'UB' && !ev.steelProfileName) {
        console.error(
            `[beamCreatedMirror] §FIX-BEAM-CEB-STEEL: REFUSED beam ${ev.id} — its shape is ` +
            `"i-section" but it carries no steelProfileName, and BeamFragmentBuilder cannot ` +
            `build a steel section without one; it would have drawn a plain concrete box ` +
            `instead. Name a SteelProfileLibrary section (e.g. "254x146x37") or draw a ` +
            `rectangular beam.`,
        );
        return null;
    }

    return {
        id:          ev.id,
        levelId:     ev.levelId ?? '',
        startPoint:  ev.startPoint,
        endPoint:    ev.endPoint,
        sectionType,
        width:       ev.width ?? 0.2,
        depth:       ev.depth ?? 0.4,
        // §FIX-BEAM-BRIDGE-LOADBEARING + §FIX-BEAM-CEB-STEEL — was the literal
        // `false`, then the constant below unconditionally. The left arm now runs:
        // see the constant's own doc for what changed and why.
        loadBearing: ev.loadBearing ?? BEAM_LOAD_BEARING_DEFAULT,
        properties:  {},
        ...(ev.materialId ? { material: ev.materialId } : {}),
        ...(ev.fireRating ? { fireRating: ev.fireRating } : {}),
        ...(ev.steelProfileName ? { steelProfileName: ev.steelProfileName } : {}),
    };
}
