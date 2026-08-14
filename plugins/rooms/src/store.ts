// ⚠ DEPRECATED SHIM (GE-04, measured 2026-08-14) — do not add readers/writers.
//
// The WINNER — the one RoomStore shipping paths execute — is
// `packages/room-topology/src/RoomStore.ts` (module singleton `roomStore`,
// registered under storeRegistry key `'room'`, exposed as `window.roomStore`,
// typed into the command surface at packages/command-registry/src/types.ts).
//
// THIS store is a bus-contribution placeholder, nothing more. It was written
// as the S25 pure DTO store (mirroring `plugins/slab/src/store.ts`), but the
// room element never migrated onto it: all twelve room.* handlers in
// `./handlers/` declare `affectedStores: []` and BRIDGE to the legacy
// commands that write the room-topology store (see the §FIX-ROOM-CREATE-
// STORE-KEY header in handlers/CreateRoom.ts for the measured history).
// Nothing reads this store's state; nothing writes it. Writing an Immer patch
// into it would be the "store nothing reads" defect those handlers' headers
// name explicitly.
//
// Why it still exists at all: `apps/editor/src/PluginRegistry.ts` contributes
// it to the command bus under storeKey `'rooms'` (`buildStore: () => new
// RoomStore()`), and the plugin barrel exports it. Deleting the class is a
// PluginRegistry + barrel + plugin-tests change (outside this file's lane);
// until that lands, this shim stays constructible but must gain no callers.
//
// Retirement path (scoped, for the follow-up lane):
//   1. Drop the `storeKey: 'rooms'` / `buildStore` contribution in
//      PluginRegistry.ts (no handler requires the store — all declare
//      `affectedStores: []`, so CommandBus.buildContext never needs it).
//   2. Remove the export from plugins/rooms/src/index.ts.
//   3. Delete this file + the store-double usages in plugins/rooms/__tests__.

import { Store } from '@pryzm/plugin-sdk';
import type { Room as RoomSchemaInfer } from '@pryzm/plugin-sdk';

/** Room DTO inferred from the canonical L0 Zod schema
 *  (`@pryzm/schemas/elements/Room`). NOTE: this is NOT the shape shipping
 *  room state uses — the executed store carries `RoomData` from
 *  `@pryzm/room-topology` (GE-04). */
export type RoomData = RoomSchemaInfer;

/** Branded room id — the underlying Map keys are still plain strings. */
export type RoomId = RoomData['id'];

/** Per-store record view the bus WOULD hand to handlers via
 *  `ctx.stores.rooms` (storeKey `'rooms'`, plural) — no shipping handler
 *  declares it (`affectedStores: []` across ./handlers/). */
export type RoomsState = Record<string, RoomData>;

/**
 * @deprecated GE-04 — rival of the canonical room store. Room state lives in
 * `packages/room-topology/src/RoomStore.ts` (`window.roomStore`, storeRegistry
 * key `'room'`). This class exists only because PluginRegistry contributes it
 * under bus storeKey `'rooms'`; it has zero readers and zero writers. Do not
 * route new state through it — see the retirement path in this file's header.
 */
export class RoomsPluginStore extends Store<RoomData> {
  constructor() {
    super('room');
  }

  /** Convenience read — every room id currently in the store. */
  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Convenience read — every room on a given level.  O(N). */
  byLevel(levelId: string): readonly RoomData[] {
    const out: RoomData[] = [];
    for (const r of this.state.values()) {
      if (r.levelId === levelId) out.push(r);
    }
    return out;
  }

  /** Lookup by id; returns `undefined` when missing. */
  get(id: string): Readonly<RoomData> | undefined {
    return this.state.get(id);
  }
}

/**
 * @deprecated GE-04 transitional alias — `RoomStore` here is NOT the store
 * that ships. Use `RoomsPluginStore` if you genuinely mean this placeholder;
 * use `@pryzm/room-topology`'s `RoomStore` for real room state. Kept so
 * PluginRegistry.ts and plugins/rooms/__tests__ compile until the retirement
 * path in the header lands.
 */
export { RoomsPluginStore as RoomStore };
