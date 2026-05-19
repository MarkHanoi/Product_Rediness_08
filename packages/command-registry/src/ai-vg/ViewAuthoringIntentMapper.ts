/**
 * ViewAuthoringIntentMapper — Phase D: LLM View Authoring Protocol
 *
 * Maps AI-generated view and visibility-rule intents to concrete Command instances.
 * Called from CommandProposalFactory when the intent type is one of the Phase D types.
 *
 * Design (§01 §04):
 *   - Read-only access to stores for validation only.
 *   - All mutations go through CommandManager via the returned Command objects.
 *   - No direct store writes.
 *   - Returns null for unknown or invalid intents instead of throwing.
 *   - All AI-generated commands MUST pass through AIApprovalStore (§07 §4) before
 *     execution. This mapper only constructs the command; it does not execute it.
 *
 * Pattern: identical to VGIntentMapper.ts
 *
 * Contract compliance:
 *   §01 §2     — Commands produced here are not executed; they enter the approval flow.
 *   §04        — No direct store writes; read-only validation only.
 *   §07 §4     — Human-in-the-loop approval is enforced by CommandProposalFactory/AIApprovalStore.
 */

import {
    AIIntent,
    AIIntentType,
    CreateViewDefinitionIntent,
    UpdateViewIntentIntent,
    CreateVisibilityRuleIntent,
    UpdateVisibilityRuleIntent,
    DeleteVisibilityRuleIntent,
    TagElementsByConditionIntent,
    CreateSheetIntent,
    UpdateSheetIntent,
    CreateScheduleIntent,
    UpdateScheduleIntent,
} from './AIIntentTypes';
import { Command, CommandContext } from '../types';
import { CreateViewDefinitionCommand } from '../views/CreateViewDefinitionCommand';
import { UpdateViewDefinitionCommand } from '../views/UpdateViewDefinitionCommand';
import { CreateVisibilityRuleCommand } from '../vg/CreateVisibilityRuleCommand';
import { UpdateVisibilityRuleCommand } from '../vg/UpdateVisibilityRuleCommand';
import { DeleteVisibilityRuleCommand } from '../vg/DeleteVisibilityRuleCommand';
import { TagElementCommand } from '../TagElementCommand';
import { CreateSheetCommand } from '../views/CreateSheetCommand';
import { UpdateSheetCommand } from '../views/UpdateSheetCommand';
import { CreateScheduleCommand } from '../views/CreateScheduleCommand';
import { UpdateScheduleCommand } from '../views/UpdateScheduleCommand';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { sheetStore } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import type { VisibilityRule, QueryExpression } from '@pryzm/core-app-model';

// ── Phase D intent type set — used for routing in CommandProposalFactory ──────

const VIEW_AUTHORING_INTENT_TYPES = new Set<AIIntentType>([
    AIIntentType.CREATE_VIEW_DEFINITION,
    AIIntentType.UPDATE_VIEW_INTENT,
    AIIntentType.CREATE_VISIBILITY_RULE,
    AIIntentType.UPDATE_VISIBILITY_RULE,
    AIIntentType.DELETE_VISIBILITY_RULE,
    AIIntentType.TAG_ELEMENTS_BY_CONDITION,
    AIIntentType.QUERY_VIEW_STATE,
    // Phase IV — Sheet & Schedule authoring
    AIIntentType.CREATE_SHEET,
    AIIntentType.UPDATE_SHEET,
    AIIntentType.CREATE_SCHEDULE,
    AIIntentType.UPDATE_SCHEDULE,
]);

/**
 * Returns true if the given intent type is handled by this mapper.
 * Used by CommandProposalFactory to route Phase D intents.
 */
export function isViewAuthoringIntentType(intentType: AIIntentType): boolean {
    return VIEW_AUTHORING_INTENT_TYPES.has(intentType);
}

/**
 * Maps a Phase D AI intent to a Command instance (or null if invalid).
 * The returned command is NOT executed here — it is passed to AIApprovalStore
 * for human-in-the-loop confirmation (§07 §4).
 */
export function mapViewAuthoringIntent(intent: AIIntent, _context: CommandContext): Command | null {
    switch (intent.intentType) {

        // ── CREATE_VIEW_DEFINITION ─────────────────────────────────────────────
        case AIIntentType.CREATE_VIEW_DEFINITION: {
            const i = intent as CreateViewDefinitionIntent;

            if (!i.id?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_VIEW_DEFINITION missing id.', intent);
                return null;
            }
            if (!i.name?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_VIEW_DEFINITION missing name.', intent);
                return null;
            }

            const validViewTypes = ['plan', '3d', 'section', 'elevation', 'analysis'] as const;
            if (!validViewTypes.includes(i.viewType as any)) {
                console.warn(`[ViewAuthoringIntentMapper] CREATE_VIEW_DEFINITION invalid viewType: ${i.viewType}`);
                return null;
            }

            if (viewDefinitionStore.has(i.id)) {
                console.warn(`[ViewAuthoringIntentMapper] A ViewDefinition with id '${i.id}' already exists.`);
                return null;
            }

            return new CreateViewDefinitionCommand({
                id:          i.id,
                name:        i.name,
                viewType:    i.viewType,
                discipline:  i.discipline,
                spatial:     i.levelId ? { levelId: i.levelId } : undefined,
                temporal:    i.phaseFilter ? { phaseFilter: i.phaseFilter } : undefined,
                vgTemplateId: i.vgTemplateId,
                intent:      i.intent,
                createdBy:   'ai',
            });
        }

        // ── UPDATE_VIEW_INTENT ─────────────────────────────────────────────────
        case AIIntentType.UPDATE_VIEW_INTENT: {
            const i = intent as UpdateViewIntentIntent;

            if (!i.viewId?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] UPDATE_VIEW_INTENT missing viewId.', intent);
                return null;
            }

            if (!viewDefinitionStore.has(i.viewId)) {
                console.warn(`[ViewAuthoringIntentMapper] ViewDefinition '${i.viewId}' does not exist.`);
                return null;
            }

            const patch: Record<string, unknown> = {};
            if (i.intent      !== undefined) patch['intent']       = i.intent;
            if (i.discipline  !== undefined) patch['discipline']   = i.discipline;
            if (i.vgTemplateId !== undefined) patch['vgTemplateId'] = i.vgTemplateId;

            if (Object.keys(patch).length === 0) {
                console.warn('[ViewAuthoringIntentMapper] UPDATE_VIEW_INTENT patch is empty — nothing to update.', intent);
                return null;
            }

            return new UpdateViewDefinitionCommand(i.viewId, patch as any);
        }

        // ── CREATE_VISIBILITY_RULE ─────────────────────────────────────────────
        case AIIntentType.CREATE_VISIBILITY_RULE: {
            const i = intent as CreateVisibilityRuleIntent;

            if (!i.id?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_VISIBILITY_RULE missing id.', intent);
                return null;
            }
            if (!i.condition || typeof i.condition !== 'object') {
                console.warn('[ViewAuthoringIntentMapper] CREATE_VISIBILITY_RULE missing or invalid condition.', intent);
                return null;
            }
            if (!i.effect || typeof i.effect !== 'object') {
                console.warn('[ViewAuthoringIntentMapper] CREATE_VISIBILITY_RULE missing effect.', intent);
                return null;
            }

            const validScopes = ['template', 'model', 'view'] as const;
            if (!validScopes.includes(i.scope as any)) {
                console.warn(`[ViewAuthoringIntentMapper] CREATE_VISIBILITY_RULE invalid scope: ${i.scope}`);
                return null;
            }
            if (!i.scopeId?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_VISIBILITY_RULE missing scopeId.', intent);
                return null;
            }
            if (visibilityRuleEngine.has(i.id)) {
                console.warn(`[ViewAuthoringIntentMapper] A VisibilityRule with id '${i.id}' already exists.`);
                return null;
            }

            const rule: VisibilityRule = {
                id:        i.id,
                label:     i.label,
                condition: i.condition as QueryExpression,
                effect:    i.effect,
                priority:  typeof i.priority === 'number' ? i.priority : 50,
                scope:     i.scope,
                scopeId:   i.scopeId,
                enabled:   i.enabled !== false,
            };

            return new CreateVisibilityRuleCommand(rule);
        }

        // ── UPDATE_VISIBILITY_RULE ─────────────────────────────────────────────
        case AIIntentType.UPDATE_VISIBILITY_RULE: {
            const i = intent as UpdateVisibilityRuleIntent;

            if (!i.ruleId?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] UPDATE_VISIBILITY_RULE missing ruleId.', intent);
                return null;
            }
            if (!visibilityRuleEngine.has(i.ruleId)) {
                console.warn(`[ViewAuthoringIntentMapper] VisibilityRule '${i.ruleId}' does not exist.`);
                return null;
            }
            if (!i.patch || Object.keys(i.patch).length === 0) {
                console.warn('[ViewAuthoringIntentMapper] UPDATE_VISIBILITY_RULE patch is empty.', intent);
                return null;
            }

            return new UpdateVisibilityRuleCommand(i.ruleId, {
                label:     i.patch.label,
                condition: i.patch.condition as QueryExpression | undefined,
                effect:    i.patch.effect,
                priority:  i.patch.priority,
                enabled:   i.patch.enabled,
            });
        }

        // ── DELETE_VISIBILITY_RULE ─────────────────────────────────────────────
        case AIIntentType.DELETE_VISIBILITY_RULE: {
            const i = intent as DeleteVisibilityRuleIntent;

            if (!i.ruleId?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] DELETE_VISIBILITY_RULE missing ruleId.', intent);
                return null;
            }
            if (!visibilityRuleEngine.has(i.ruleId)) {
                console.warn(`[ViewAuthoringIntentMapper] VisibilityRule '${i.ruleId}' does not exist — cannot delete.`);
                return null;
            }

            return new DeleteVisibilityRuleCommand(i.ruleId);
        }

        // ── TAG_ELEMENTS_BY_CONDITION ──────────────────────────────────────────
        case AIIntentType.TAG_ELEMENTS_BY_CONDITION: {
            const i = intent as TagElementsByConditionIntent;

            if (!i.tagsToAdd?.length && !i.tagsToRemove?.length) {
                console.warn('[ViewAuthoringIntentMapper] TAG_ELEMENTS_BY_CONDITION: tagsToAdd and tagsToRemove are both empty.', intent);
                return null;
            }

            // If a specific elementId is provided, use it directly.
            if (i.elementId?.trim()) {
                return new TagElementCommand(
                    i.elementId,
                    i.tagsToAdd   ?? [],
                    i.tagsToRemove ?? [],
                );
            }

            // If a condition is provided (no elementId), resolve via SemanticIndex.
            if (i.condition && typeof i.condition === 'object') {
                const semanticIndex = window.semanticIndex;
                if (!semanticIndex || typeof semanticIndex.query !== 'function') {
                    console.warn('[ViewAuthoringIntentMapper] TAG_ELEMENTS_BY_CONDITION: SemanticIndex not available on window.');
                    return null;
                }

                const matchingIds: string[] = semanticIndex.query(i.condition);
                if (matchingIds.length === 0) {
                    console.warn('[ViewAuthoringIntentMapper] TAG_ELEMENTS_BY_CONDITION: condition matched no elements.', i.condition);
                    return null;
                }
                if (matchingIds.length > 1) {
                    console.warn(
                        `[ViewAuthoringIntentMapper] TAG_ELEMENTS_BY_CONDITION: condition matched ${matchingIds.length} elements. ` +
                        'Only the first will be tagged. Produce one intent per element for bulk tagging.',
                        matchingIds
                    );
                }

                return new TagElementCommand(
                    matchingIds[0],
                    i.tagsToAdd   ?? [],
                    i.tagsToRemove ?? [],
                );
            }

            console.warn('[ViewAuthoringIntentMapper] TAG_ELEMENTS_BY_CONDITION: provide either elementId or condition.', intent);
            return null;
        }

        // ── QUERY_VIEW_STATE ───────────────────────────────────────────────────
        case AIIntentType.QUERY_VIEW_STATE: {
            // Read-only query — no command is produced.
            // The caller should use AIReadModel.getViewsForLLM() directly.
            console.info('[ViewAuthoringIntentMapper] QUERY_VIEW_STATE is read-only — no command produced. Use AIReadModel.getViewsForLLM().');
            return null;
        }

        // ── Phase IV — Sheet & Schedule AI Authoring ──────────────────────────

        case AIIntentType.CREATE_SHEET: {
            const si = intent as CreateSheetIntent;
            if (!si.id?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_SHEET: id is required.');
                return null;
            }
            if (!si.sheetNumber?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_SHEET: sheetNumber is required.');
                return null;
            }
            if (!si.name?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_SHEET: name is required.');
                return null;
            }
            if (sheetStore.has(si.id)) {
                console.warn(`[ViewAuthoringIntentMapper] CREATE_SHEET: sheet id '${si.id}' already exists.`);
                return null;
            }
            return new CreateSheetCommand({
                id:          si.id,
                sheetNumber: si.sheetNumber,
                name:        si.name,
                revision:    si.revision,
                viewIds:     si.viewIds,
                titleBlock:  si.titleBlock,
                createdBy:   'ai',
            });
        }

        case AIIntentType.UPDATE_SHEET: {
            const ui = intent as UpdateSheetIntent;
            if (!ui.sheetId?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] UPDATE_SHEET: sheetId is required.');
                return null;
            }
            if (!ui.patch || Object.keys(ui.patch).length === 0) {
                console.warn('[ViewAuthoringIntentMapper] UPDATE_SHEET: patch is empty.');
                return null;
            }
            if (!sheetStore.has(ui.sheetId)) {
                console.warn(`[ViewAuthoringIntentMapper] UPDATE_SHEET: sheet '${ui.sheetId}' not found.`);
                return null;
            }
            return new UpdateSheetCommand(ui.sheetId, ui.patch);
        }

        case AIIntentType.CREATE_SCHEDULE: {
            const ci = intent as CreateScheduleIntent;
            if (!ci.id?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_SCHEDULE: id is required.');
                return null;
            }
            if (!ci.name?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_SCHEDULE: name is required.');
                return null;
            }
            if (!ci.scheduleType) {
                console.warn('[ViewAuthoringIntentMapper] CREATE_SCHEDULE: scheduleType is required.');
                return null;
            }
            if (scheduleStore.has(ci.id)) {
                console.warn(`[ViewAuthoringIntentMapper] CREATE_SCHEDULE: schedule id '${ci.id}' already exists.`);
                return null;
            }
            return new CreateScheduleCommand({
                id:           ci.id,
                name:         ci.name,
                scheduleType: ci.scheduleType,
                fields:       ci.fields,
            });
        }

        case AIIntentType.UPDATE_SCHEDULE: {
            const uci = intent as UpdateScheduleIntent;
            if (!uci.scheduleId?.trim()) {
                console.warn('[ViewAuthoringIntentMapper] UPDATE_SCHEDULE: scheduleId is required.');
                return null;
            }
            if (!uci.patch || Object.keys(uci.patch).length === 0) {
                console.warn('[ViewAuthoringIntentMapper] UPDATE_SCHEDULE: patch is empty.');
                return null;
            }
            if (!scheduleStore.has(uci.scheduleId)) {
                console.warn(`[ViewAuthoringIntentMapper] UPDATE_SCHEDULE: schedule '${uci.scheduleId}' not found.`);
                return null;
            }
            return new UpdateScheduleCommand(uci.scheduleId, uci.patch);
        }

        default:
            return null;
    }
}
