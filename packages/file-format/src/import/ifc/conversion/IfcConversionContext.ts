import * as THREE from '@pryzm/renderer-three/three';
import { IfcConversionOptions } from './IfcConversionTypes';

export interface IfcConversionContext {
  scene: THREE.Scene;
  commandManager: any;
  bimManager: any;
  selectionManager?: any;
  options: IfcConversionOptions;
}

export function getCommandContext(commandManager: any): any {
  if (commandManager && typeof commandManager.getContext === 'function') {
    return commandManager.getContext();
  }
  return undefined;
}

export function executeHumanDirect(commandManager: any, command: any): any {
  if (!commandManager || typeof commandManager.execute !== 'function') {
    return { success: false, affectedElementIds: [], error: 'CommandManager unavailable' };
  }
  // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
  if (window.runtime?.bus) { window.runtime.bus.executeCommand('import.executeCommand', {}).catch(() => {}); }
  return commandManager.execute(command, { source: 'HUMAN_DIRECT' });
}

export function normaliseIfcType(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function makeUuid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}