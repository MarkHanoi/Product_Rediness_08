import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { createIfcMetadata } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';

export class CreateHandrailCommand implements Command {
    readonly affectedStores = ["handrail", "level"] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_HANDRAIL;
    timestamp = Date.now();
    targetIds: string[] = [];
    private createdId?: string;
    /** §PERSIST-L1 (W1-2) — stable IFC GUID; see `data.ifcGuid`. */
    private readonly _ifcGuid: string;

    constructor(
        private data: {
            id: string,
            start: { x: number, z: number },
            end: { x: number, z: number },
            height: number,
            thickness: number,
            levelId?: string,
            baseOffset?: number,
            fillType?: string,
            railProfile?: string,
            railDiameter?: number,
            postSpacing?: number,
            materialColor?: string,
            /**
             * §FEAT-HANDRAIL-TYPE-LIBRARY-20 (C95 D5) — the infill members and the
             * code constraint a catalogue type carries.
             *
             * ⛔ EI-2: these are not decoration. `HandrailTypeDefinition` declares
             * them, `HandrailFragmentBuilder` reads them, and before this command
             * accepted them a user who picked "Timber Picket Railing" got its
             * HEIGHT and its POST spacing but 20 mm generic balusters at the
             * historical 0.11 m pitch, because the only path from the catalogue to
             * the record dropped them on the floor. A field the pipeline drops is
             * an EI-2 defect whether or not anyone notices the shape.
             */
            balusterShape?: 'rectangular' | 'round',
            balusterWidth?: number,
            balusterSpacing?: number,
            infillMaxGap?: number,
            /**
             * The Materials-Repository id. `HandrailFragmentBuilder.resolveColour`
             * reads it (after `materialColor`, which always wins), so a handrail
             * assigned a repository material is drawn in that material's colour.
             */
            materialId?: string,
            /**
             * §FIX-STAIR-DELETE-ORPHANS-HANDRAILS (C95 §15.1) — the host, if any.
             * Written to the record AND to the semantic graph, so the "which rails
             * belong to this host?" question has one answer in two places that are
             * kept in step by this command rather than by convention.
             */
            hostId?: string,
            hostKind?: 'stair' | 'slab',
            /**
             * §FEAT-HANDRAIL-RUN-JOIN (C95 D4) — suppress this segment's START
             * post because a neighbouring segment in the same run already posts
             * that vertex. Set only by `CreateHandrailRunCommand`; absent for a
             * hand-drawn single rail, which is bit-identical to before.
             */
            suppressStartPost?: boolean,
            /**
             * §FEAT-HANDRAIL-POST-REDISTRIBUTE (C95 §15.3, R5) — how the run
             * divides. Absent → 'redistribute', which treats the authored spacing
             * as a MAXIMUM never exceeded.
             */
            postEndCondition?: 'redistribute' | 'fixed' | 'centred',
            /**
             * §PERSIST-L1 (W1-2) — the handrail's ORIGINAL IFC GUID. `ifcData.guid`
             * is the IFC round-trip join key: it is what an exported IFC file, a
             * BCF issue or a Revit round-trip uses to find this railing again. It
             * is AUTHORED — `createIfcMetadata()` mints it as a
             * `crypto.randomUUID()`, not recomputable from `id` — so a restore
             * that does not carry it forward silently breaks that correspondence.
             *
             * Absent (a genuinely new handrail), the command mints one at
             * construction. That also fixes undo+redo: the guid used to be minted
             * inside `execute()`, so every redo produced a different one.
             */
            ifcGuid?: string,
            /**
             * §L-1102 / §L-1037 — THE RESTORE FIELDS.
             *
             * These are not authored by any tool; they exist so a RELOAD can
             * reconstruct the record it saved. Before them the loader could only
             * hand back the fields this constructor happened to accept, so
             * `properties` (and with it the `HR001` mark) was re-minted on every
             * reload, and `railStructure` / `parameters` / `metadata` were lost
             * outright — C95 §16's measurement of 7 surviving fields of ~26.
             *
             * ⚠ `properties` is MERGED, not replaced: `HandrailStore.add()` mints
             * `properties.mark` from the map size when absent, so a restore that
             * carries the saved mark keeps it, and one that does not still gets a
             * mark. Absent → previous behaviour, bit-identical.
             */
            properties?: Record<string, unknown>,
            railStructure?: unknown[],
            parameters?: Record<string, unknown>,
            metadata?: Record<string, unknown>,
            spatialRelationship?: { levelId: string; buildingId?: string; siteId?: string },
            childrenIds?: string[],
        }
    ) {
        // §PERSIST-L1 (W1-2) — adopt the supplied GUID, mint only in its absence,
        // and echo it back onto `data` so `serialize()` (which forwards `data`
        // verbatim) carries the SAME guid to every collaboration peer.
        this._ifcGuid = data.ifcGuid ?? crypto.randomUUID();
        this.data = { ...data, ifcGuid: this._ifcGuid };
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const levelId = this.data.levelId || ctx.projectContext.activeLevelId;
        if (!levelId) return { ok: false, reason: 'Missing levelId' };
        if (!ctx.bimManager.getLevelById(levelId)) return { ok: false, reason: 'Level not found' };

        const dx = this.data.end.x - this.data.start.x;
        const dz = this.data.end.z - this.data.start.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.1) return { ok: false, reason: 'Handrail must be at least 0.1 m long' };

        if (this.data.height < 0.3 || this.data.height > 2.5) {
            return { ok: false, reason: 'Handrail height must be between 0.3 m and 2.5 m' };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const id = this.data.id;
        const levelId = this.data.levelId || ctx.projectContext.activeLevelId;

        const level = ctx.bimManager.getLevelById(levelId);
        if (!level) return { success: false, affectedElementIds: [], info: ['Level not found'] };

        const baseOffset = this.data.baseOffset !== undefined ? this.data.baseOffset : 0;
        const fillType = (this.data.fillType as any) ?? 'baluster';

        const ifcPredefined = fillType === 'glass' || fillType === 'panel' ? 'GUARDRAIL' : 'HANDRAIL';

        const handrail = {
            id,
            type: 'handrail' as const,
            baseLine: [
                { x: this.data.start.x, y: 0, z: this.data.start.z },
                { x: this.data.end.x,   y: 0, z: this.data.end.z   }
            ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
            height:        this.data.height,
            thickness:     this.data.thickness,
            levelId,
            baseOffset,
            fillType,
            railProfile:   this.data.railProfile   as any,
            railDiameter:  this.data.railDiameter,
            postSpacing:   this.data.postSpacing,
            materialColor: this.data.materialColor,
            // §FEAT-HANDRAIL-TYPE-LIBRARY-20 / §FEAT-HANDRAIL-RUN-JOIN — see the
            // constructor's field notes. Written unconditionally (an undefined
            // stays undefined) so the record's shape does not depend on which
            // surface authored it (C84 EI-9).
            balusterShape:     this.data.balusterShape,
            balusterWidth:     this.data.balusterWidth,
            balusterSpacing:   this.data.balusterSpacing,
            infillMaxGap:      this.data.infillMaxGap,
            materialId:        this.data.materialId,
            suppressStartPost: this.data.suppressStartPost,
            postEndCondition:  this.data.postEndCondition,
            hostId:            this.data.hostId,
            hostKind:          this.data.hostKind,
            // §L-1102 — the saved `properties` (mark, phase, user parameters) when
            // restoring; `{}` for a genuinely new rail, which is what this was.
            properties: this.data.properties ? { ...this.data.properties } : {},
            railStructure:       this.data.railStructure as any,
            parameters:          this.data.parameters,
            metadata:            this.data.metadata,
            spatialRelationship: this.data.spatialRelationship,
            childrenIds:         this.data.childrenIds ? [...this.data.childrenIds] : undefined,
            // §PERSIST-L1 (W1-2) — the ifcClass/predefinedType still come from the
            // canonical mapper; only the guid is overridden with the one resolved at
            // construction time, so a restored handrail keeps the guid it was saved
            // with and redo re-stamps the same one.
            ifcData: { ...createIfcMetadata('handrail', ifcPredefined), guid: this._ifcGuid }
        };

        ctx.stores.handrailStore.add(handrail);
        ctx.bimManager.registerElement(id, levelId);

        // Gap 7 — SemanticGraph: handrail sitsOn its level.
        // Enables DependencyResolver to find all handrails on a level and
        // powers IFC IfcRelContainedInSpatialStructure for handrail elements.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: id,
                targetId: levelId,
                createdBy: 'CreateHandrailCommand',
                metadata: { addedBy: 'CreateHandrailCommand', fillType: handrail.fillType }
            });
        } catch (err) {
            console.warn('[CreateHandrailCommand] SemanticGraph write failed (non-fatal):', err);
        }

        // §FIX-STAIR-DELETE-ORPHANS-HANDRAILS — the HOST edge pair.
        //
        // ⛔ NO NEW RELATIONSHIP TYPE IS MINTED (C84 EI-8). `hosts` / `hostedBy`
        // already exist as the wall-to-opening pair and mean exactly this. Both
        // directions are written because the graph's readers ask in both: a delete
        // cascade asks the HOST "what do you carry?", and an integrity sweep asks
        // the RAIL "what carries you?".
        if (this.data.hostId) {
            try {
                semanticGraphManager.addRelationship({
                    type: 'hosts',
                    sourceId: this.data.hostId,
                    targetId: id,
                    createdBy: 'CreateHandrailCommand',
                    metadata: { hostKind: this.data.hostKind ?? 'unknown' },
                });
                semanticGraphManager.addRelationship({
                    type: 'hostedBy',
                    sourceId: id,
                    targetId: this.data.hostId,
                    createdBy: 'CreateHandrailCommand',
                    metadata: { hostKind: this.data.hostKind ?? 'unknown' },
                });
            } catch (err) {
                console.warn('[CreateHandrailCommand] host edge write failed (non-fatal):', err);
            }
        }

        this.createdId = id;
        this.targetIds = [id];
        return { success: true, affectedElementIds: [id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.createdId) return { success: false, affectedElementIds: [] };
        ctx.bimManager.unregisterElement(this.createdId);
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
        } catch (err) {
            console.warn('[CreateHandrailCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }
        ctx.stores.handrailStore.remove(this.createdId);
        return { success: true, affectedElementIds: [this.createdId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, version: 1, payload: this.data };
    }
}
