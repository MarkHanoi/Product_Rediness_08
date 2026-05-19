// WindowStore — pure DTO store for the window element family (S11-T2).
//
// Mirrors `plugins/door/src/store.ts`: THREE-free, self-contained,
// validation-at-handler-boundary.

import { Store } from '@pryzm/plugin-sdk';
import type { Window as WindowSchemaInfer } from '@pryzm/plugin-sdk';

export type WindowData = WindowSchemaInfer;
export type WindowId = WindowData['id'];
export type WindowsState = Record<string, WindowData>;

export class WindowStore extends Store<WindowData> {
  constructor() {
    super('window');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  byWall(wallId: string): readonly WindowData[] {
    const out: WindowData[] = [];
    for (const w of this.state.values()) {
      if (w.wallId === wallId) out.push(w);
    }
    return out;
  }

  get(id: string): Readonly<WindowData> | undefined {
    return this.state.get(id);
  }
}
