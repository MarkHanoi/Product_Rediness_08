// WindowPlacementTool — vanilla TS, THREE-free (S11-T2).

import type { CommandBus } from '@pryzm/plugin-sdk';
import { resolveWindowPlacement } from './intent.js';
import type { WallsState } from '@pryzm/plugin-wall';
import { createId } from '@pryzm/plugin-sdk';
import { getWindowType, DEFAULT_WINDOW_TYPE_ID, type WindowType } from '@pryzm/plugin-sdk';

export const WINDOW_TOOL_ID = 'window.placement';

export interface WindowToolPoint3D { x: number; y: number; z: number; }

export type WindowScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => WindowToolPoint3D | undefined;

export type WallsSnapshot = () => WallsState;

export interface WindowCreationToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: WindowScreenToWorld;
  readonly wallsSnapshot: WallsSnapshot;
  readonly defaultType?: WindowType;
}

export class WindowPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: WindowScreenToWorld;
  private readonly wallsSnapshot: WallsSnapshot;
  private readonly defaultType: WindowType;

  constructor(deps: WindowCreationToolDeps) {
    if (!deps.commandBus) throw new Error('[WindowPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[WindowPlacementTool] screenToWorld is required');
    if (!deps.wallsSnapshot) throw new Error('[WindowPlacementTool] wallsSnapshot is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.wallsSnapshot = deps.wallsSnapshot;
    this.defaultType =
      deps.defaultType ??
      getWindowType(DEFAULT_WINDOW_TYPE_ID) ??
      (() => {
        throw new Error('[WindowPlacementTool] default window type not found');
      })();
  }

  async onPointerDown(ev: {
    clientX: number; clientY: number; pointerId: number;
  }): Promise<{ windowId: string; wallId: string; offset: number } | undefined> {
    const click = this.screenToWorld(ev);
    if (!click) return undefined;
    const walls = this.wallsSnapshot();
    const placement = resolveWindowPlacement(
      click,
      walls,
      this.defaultType.width,
      this.defaultType.sillHeight,
    );
    if (!placement || !placement.fits) return undefined;

    const openingId = createId('opening');
    const windowId = createId('window');

    await this.bus.executeCommand('wall.createOpening', {
      wallId: placement.wallId,
      opening: {
        id: openingId,
        type: 'window',
        offset: placement.offset - this.defaultType.width / 2,
        width: this.defaultType.width,
        height: this.defaultType.height,
        sillHeight: placement.sillHeight,
        elementId: windowId,
      },
    });
    await this.bus.executeCommand('window.create', {
      id: windowId,
      wallId: placement.wallId,
      openingId,
      offset: placement.offset - this.defaultType.width / 2,
      width: this.defaultType.width,
      height: this.defaultType.height,
      sillHeight: placement.sillHeight,
      systemTypeId: this.defaultType.id,
    });

    return { windowId, wallId: placement.wallId, offset: placement.offset };
  }
}
