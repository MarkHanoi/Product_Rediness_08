# WAVE 4i — ceiling + curtain-wall, seven facts, EXECUTED

## Capability search FIRST (HARD STOP 3 — do not build a rival)

Question asked: "what already ANSWERS 'did this create land in the store the renderer and
the serializer read?'" — not "is there a ceilingReadbackProbe".

Found, all pre-existing, none written by me:
- `apps/editor/__tests__/composedBusElementReadback.test.ts` (238 lines) — the MT-01 pattern.
  Uses `rt.stores.elements.get(kind)` and asserts IDENTITY against the module singleton.
- `packages/runtime-composer/src/authoritativeElementMirror.ts` — the composition-root mirror,
  `MIRRORED` = wall.create / wall.batch.create ONLY; `UNMIRRORED_KINDS` = slab, room.
- `apps/editor/src/engine/ceilingCreatedMirror.ts` — `ceilingRecordFromCreatedEvent(ev, ctx)`,
  a PURE, EXPORTED, unit-executable function. The whole §P3.2-CL guard + mapping lives here.
- `apps/editor/src/engine/curtainWallCreatedMirror.ts` — `curtainWallRecordFromCreatedEvent(ev)`,
  same shape. Both were extracted OUT of initTools precisely so a test could execute them
  (§FIX-CEILING-BRIDGE-FINISH L-973 / §FIX-CW-BRIDGE-AUTHORED-VALUES L-972).
- `apps/editor/__tests__/CeilingBridgeCarriesAuthoredFinish.test.ts` and
  `CurtainWallBridgeCarriesAuthoredValues.test.ts` — already execute the mirrors, but from
  HAND-BUILT event literals, never from an event the REAL bus emitted.
- `apps/editor/src/engine/initStores.ts:registerAllStores` — the REAL registration function.
  It DOES register 'ceiling', 'curtainwall' AND the 'curtain-wall' alias (§CW90 item 5).

=> NOTHING is missing. The gap is that the three executable halves were never joined:
   real bus event -> real mirror -> real store. That join is what this probe performs.
   I write NO new mirror, NO new store, NO new registration path.

## Why probe P-1 read `ceiling=undefined` / `curtainwall=undefined`

`composeRuntime.ts:1648-1652` registers exactly five kinds into `storeRegistry`
(door, window, wall, slab, room) — the five whose authoritative stores are MODULE SINGLETONS.
Ceiling and curtain-wall have NO module singleton: the engine's instances are created at
`apps/editor/src/engine/initBuilders.ts:399` (`new CeilingStore()`) and `:340`
(`new CurtainWallStore()`), and only `registerAllStores()` (browser boot) puts them in the
registry. So `ceiling=undefined` headlessly is a REGISTRATION fact, not an absence of a store.

## Declared substitutions (stub ledger)
1. The runtime is a REAL `composeRuntime({bootstrapFn: bootstrapWithEverything})`. Nothing about
   the bus, the handlers or the events is stubbed.
2. The authoritative CeilingStore / CurtainWallStore instances are `new`-ed in the probe, from
   the SAME class the engine `new`s at initBuilders.ts:399/:340. There is no singleton to adopt;
   this is the engine's own construction, executed. Registered into the registry through the
   composed runtime's own `rt.stores.elements.register` — the same call `registerAllStores`'s
   `r()` helper makes.
3. `bimManager` for CeilingPanelBuilder: the ctor takes `bimManager ?? null` and calls only
   `getLevelById`. Stand-in implements that one member (measured from source), same declared
   substitution `composedBusElementReadback.test.ts` makes for WallStore's level authority.
4. THREE.Scene is a real `new Scene()` from `three`.
