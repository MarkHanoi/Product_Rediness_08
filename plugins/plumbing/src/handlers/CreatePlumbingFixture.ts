// CreatePlumbingFixtureHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(CreatePlumbingFixtureCommand) from apps/editor/src/.
// The existing plumbing.create handler covers the plugin-store path;
// this bridge handles the legacy CreatePlumbingFixtureCommand for PRYZM-1 compat.
// TODO(F-1.4): merge into CreatePlumbingHandler once legacy renderer is retired.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CreatePlumbingFixtureCommand  } from '@pryzm/command-registry';

export interface CreatePlumbingFixturePayload {
  readonly fixtureType: string;
  readonly position: { x: number; y: number; z: number };
  readonly levelId?: string;
  readonly baseOffset?: number;
  readonly width?: number;
  readonly length?: number;
  readonly height?: number;
  readonly rotation?: { x: number; y: number; z: number };
  readonly toiletVariant?: string;
  readonly showerVariant?: string;
  readonly accessoryVariant?: string;
}

export const CreatePlumbingFixtureHandler: CommandHandler<CreatePlumbingFixturePayload, Record<string, unknown>> = {
  type: 'plumbing.createFixture',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreatePlumbingFixturePayload,
  ): ValidationResult {
    if (!cmd.fixtureType) return { valid: false, reason: 'fixtureType is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreatePlumbingFixturePayload,
  ): HandlerResult {
    return withHandlerSpan('plumbing.createFixture.handler', { 'pryzm.command.type': 'plumbing.createFixture' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new CreatePlumbingFixtureCommand(cmd as any));
        } catch (e) {
          console.error('[plumbing.createFixture.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
