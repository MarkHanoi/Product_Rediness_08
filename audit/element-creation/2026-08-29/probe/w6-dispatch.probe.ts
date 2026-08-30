#!/usr/bin/env tsx
// W6 — what does ONE dispatch cost through the real bus + real bridge?
// Grounds the "extend to 24 families" projection with a measured per-verb number.
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
const ROOT = process.cwd();
const u = (r: string) => pathToFileURL(path.join(ROOT, r)).href;
/* eslint-disable @typescript-eslint/no-explicit-any */
const { CommandBus } = (await import(u('packages/command-bus/src/CommandBus.ts'))) as any;
const { PatchEmitter } = (await import(u('packages/command-bus/src/PatchEmitter.ts'))) as any;
const { attachStores } = (await import(u('packages/stores/src/attachStores.ts'))) as any;
const { EventBus } = (await import(u('packages/runtime-composer/src/EventBus.ts'))) as any;
const { wireCommandEventBridge } = (await import(u('packages/runtime-composer/src/CommandEventBridge.ts'))) as any;
const { RoofStore } = (await import(u('plugins/roof/src/store.ts'))) as any;
const { CreateRoofHandler } = (await import(u('plugins/roof/src/handlers/CreateRoof.ts'))) as any;
const { SetRoofOverhangHandler } = (await import(u('plugins/roof/src/handlers/SetRoofOverhang.ts'))) as any;
const RING = [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}];
const stores: any = { roof: new RoofStore() };
const emitter = new PatchEmitter();
const bus = new CommandBus({ emitter, storesProvider: (ids: string[]) =>
  Object.fromEntries(ids.map((i) => [i, stores[i] ? Object.fromEntries(stores[i].getState()) : {}])) });
const events = new EventBus();
attachStores(emitter, stores, { onUnknownStore: () => {} });
wireCommandEventBridge(emitter, events);
bus.register(new CreateRoofHandler()); bus.register(new SetRoofOverhangHandler());
await bus.executeCommand('roof.create', { levelId: 'lvl-1', boundary: RING, shape: 'flat', thickness: 0.25 });
const id = [...stores.roof.getState().keys()].pop();
const N = 200; const t = Date.now();
for (let i = 0; i < N; i++) await bus.executeCommand('roof.setOverhang', { roofId: id, overhang: 0.3 + i / 1000 });
const ms = Date.now() - t;
console.log(`DISPATCHES=${N} total_ms=${ms} per_dispatch_ms=${(ms / N).toFixed(2)}`);
