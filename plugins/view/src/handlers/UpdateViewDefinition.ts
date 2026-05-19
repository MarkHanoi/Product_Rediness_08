// UpdateViewDefinition handler — Phase F-1.1 (fully promoted from bridge-observability stub).
//
// Performs an authoritative Immer-patch mutation on the ViewRegistry.
// The legacy UpdateViewDefinitionCommand / commandManager.execute() dual-write in
// ViewPropertiesPanel.ts has been removed as of Phase F-1.1; this handler
// is now the sole state-mutation path for view.updateDefinition.
//
// Supports the same patch shape as UpdateViewDefinitionCommand:
//   name, discipline, spatial (partial), temporal (partial), vgTemplateId,
//   intent, tags (→ metadata.tags), purpose.
//
// Contract compliance:
//   §01 §2     — Command-first mutation via bus handler; no direct store write from UI
//   §01 §2.7   — No builders; no Three.js scene access
//   §03 §1.1   — All patch fields are serialisable primitives
//   §07        — No server routes; client-side only
//
// Undo: the inverse patch restores the previous ViewDefinition snapshot.

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from '@pryzm/plugin-sdk';

export interface UpdateViewDefinitionPayload {
  readonly viewId: string;
  readonly patch: Record<string, unknown>;
}

type Stores = Readonly<{ view: ViewRegistry }>;

export const UpdateViewDefinitionHandler: CommandHandler<UpdateViewDefinitionPayload, Stores> = {
  type: 'view.updateDefinition',
  affectedStores: ['view'],

  canExecute(ctx: HandlerContext<Stores>, cmd: UpdateViewDefinitionPayload): ValidationResult {
    if (!cmd.viewId) return { valid: false, reason: 'viewId required' };
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `ViewDefinition '${cmd.viewId}' does not exist.` };
    }
    if (!cmd.patch || Object.keys(cmd.patch).length === 0) {
      return { valid: false, reason: 'patch must contain at least one field.' };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<Stores>, cmd: UpdateViewDefinitionPayload): HandlerResult {
    return withHandlerSpan('view.updateDefinition.handler', { 'pryzm.command.type': 'view.updateDefinition' }, () => {
      const existing = ctx.stores.view.getState().get(cmd.viewId);
      if (!existing) throw new Error(`ViewDefinition '${cmd.viewId}' not found during execute.`);

      const p = cmd.patch;
      const updated = { ...existing } as Record<string, unknown>;

      if ('name' in p)         updated['name']         = p['name'];
      if ('discipline' in p)   updated['discipline']   = p['discipline'];
      if ('vgTemplateId' in p) updated['vgTemplateId'] = p['vgTemplateId'];
      if ('intent' in p)       updated['intent']       = p['intent'];
      if ('purpose' in p)      updated['purpose']      = p['purpose'];

      if ('spatial' in p && p['spatial'] && typeof p['spatial'] === 'object') {
        updated['spatial'] = { ...(existing as any)['spatial'], ...(p['spatial'] as object) };
      }
      if ('temporal' in p && p['temporal'] && typeof p['temporal'] === 'object') {
        updated['temporal'] = { ...(existing as any)['temporal'], ...(p['temporal'] as object) };
      }
      if ('tags' in p) {
        const existingMeta = ((existing as any)['metadata'] ?? {}) as Record<string, unknown>;
        updated['metadata'] = { ...existingMeta, tags: p['tags'] };
      }

      console.log(`[CommandBus] view.updateDefinition — viewId=${cmd.viewId} fields=[${Object.keys(p).join(', ')}]`);

      return {
        forward: [{ op: 'replace', path: [cmd.viewId], value: updated }],
        inverse: [{ op: 'replace', path: [cmd.viewId], value: existing }],
      };
    }); // withHandlerSpan — C10 §2
  },
};
