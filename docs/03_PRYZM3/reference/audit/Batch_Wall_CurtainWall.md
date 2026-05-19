TASK: Audit and fix command/event bus wiring for wall batch creation and curtain wall creation

CONTEXT:
The codebase has a diagnosed architectural gap documented in 03-CURRENT-STATE.md §13.3:

  runtime.commandBus.dispatch() reaches in src/ = 0
  commandManager.execute() reaches in src/         = 207+
  executeCommand() callsite reaches                = 169+

Every wall/curtain-wall creation command still goes through the legacy untyped 
commandManager.execute() singleton instead of runtime.commandBus. The console shows:

  [CommandManager] EXECUTE: REDETECT_ROOMS
  [CommandManager] snapshot commandType="ReDetectRoomsCommand" scope=[room] elapsed=0.0ms

This means wall batch commands (CreateWallsFromSlabCommand, CreateCurtainWallCommand, 
ReDetectRoomsCommand) are dispatched outside the typed bus, so:
- No typed handler registration
- No event fan-out to subscribers
- No FrameScheduler integration at the command layer
- BatchCoordinator cannot signal drained state correctly through the bus

STEP 1 — LOCATE THE FILES:
Run these first:

  find src -name "CreateWallsFromSlabCommand*" -type f
  find src -name "CreateCurtainWallCommand*" -type f  
  find src -name "ReDetectRoomsCommand*" -type f
  find src -name "CommandManager*" -type f
  find packages/command-bus/src -type f
  rg "commandManager.execute" src --type ts -l | head -20
  rg "runtime.commandBus" src --type ts -l | head -20

STEP 2 — UNDERSTAND THE CURRENT TYPED BUS:
Read these files fully before making any changes:
  packages/command-bus/src/commands.ts       (typed CommandRegistry)
  packages/command-bus/src/index.ts          (exports)
  packages/runtime-composer/src/types.ts     (BusSlot interface)
  packages/runtime-composer/src/composeRuntime.ts  (how bus is composed)

Identify:
  - What interface does runtime.bus expose?
  - How do existing wired commands call runtime.bus.executeCommand() or dispatch()?
  - What is the typed payload shape for wall/curtain-wall commands in CommandRegistry?

STEP 3 — AUDIT WALL/CURTAINWALL COMMAND HANDLER REGISTRATION:
  rg "wall" packages/command-bus/src/commands.ts
  rg "curtain" packages/command-bus/src/commands.ts
  rg "wall" plugins/wall/src/handlers/ -l
  rg "curtain" plugins/curtain-wall/src/handlers/ -l

Check whether CreateWallsFromSlabCommand and CreateCurtainWallCommand have:
  a) Typed entries in CommandRegistry (packages/command-bus/src/commands.ts)
  b) Handler registrations in plugins/wall/src/handlers/ or plugins/curtain-wall/src/handlers/
  c) Registration in apps/editor/src/PluginRegistry.ts

STEP 4 — FIX THE COMMAND DISPATCH CHAIN:

For each wall/curtain-wall command that is currently using commandManager.execute():

  a) If the command type is NOT in CommandRegistry, add it:
     In packages/command-bus/src/commands.ts, add to the appropriate 
     sub-type (e.g. WallCommands):
       'wall.batch.create': { slabId: string; wallCount: number }
       'curtain-wall.batch.create': { slabId: string; panelCount: number }
       'rooms.redetect': { levelId: string }

  b) If a handler does NOT exist in plugins/wall/src/handlers/, create it:
     export function createWallBatchHandler(runtime: PryzmRuntime) {
       return runtime.bus.register('wall.batch.create', async (payload, stores) => {
         // move logic out of CreateWallsFromSlabCommand.execute() here
         // use buildWallDeferred() from the WallFragmentBuilder task
       });
     }

  c) Register the handler in plugins/wall/src/index.ts and 
     apps/editor/src/PluginRegistry.ts

  d) At the call site (wherever commandManager.execute('CreateWallsFromSlab', ...)
     or similar is called), replace with:
       runtime.bus.executeCommand('wall.batch.create', { slabId, wallCount })

     If runtime is not available at that call site, inject it via constructor 
     or use the window.runtime typed global (check src/global-window.d.ts for 
     whether runtime is declared there).

STEP 5 — FIX THE EVENT BUS FAN-OUT FOR ROOM REDETECTION:
The console shows ReDetectRoomsCommand firing AFTER wall batch creation.
This should be event-driven, not imperatively called. Check:

  rg "REDETECT_ROOMS" src --type ts
  rg "ReDetectRoomsCommand" src --type ts

If room redetection is called directly inside wall creation logic, replace with 
an event emission:
  runtime.events.emit('wall.batch.completed', { levelId, wallIds })

Then in plugins/rooms/src/handlers/ add a subscriber:
  runtime.events.on('wall.batch.completed', ({ levelId }) => {
    // trigger room redetection
  })

This decouples wall creation from room detection through the event bus.

STEP 6 — VERIFY THE GEOMETRY LEAK IS NOT A BUS ISSUE:
The GPU Monitor warning (geometry grew 2300%) may be caused by commands firing 
multiple times through both the legacy commandManager AND the new bus during 
transition. Check:

  rg "buildWall\|buildCurtainWall" src --type ts | grep -v "test\|spec\|\.d\.ts"

If buildWall() is called from BOTH a legacy command handler AND a new bus handler, 
you have double-execution. Remove the legacy path once the bus handler is confirmed 
working.

STEP 7 — VERIFY:
  pnpm tsc --noEmit                    → 0 errors
  pnpm vitest run                      → all tests pass
  Check browser console after creating 
  9 walls — should see:
    [CommandBus] DISPATCH: wall.batch.create   (not [CommandManager] EXECUTE)
    NO geometry leak warning from GPU Monitor
    ReDetectRooms triggered via event, not direct call

CONSTRAINTS:
- Do NOT remove commandManager entirely — only migrate wall/curtain-wall/room commands
- Do NOT add (window as any) casts
- Do NOT add new requestAnimationFrame() calls
- Keep backward compat: if runtime is null at a call site, fall back to 
  commandManager.execute() with a console.warn() marking it as a P6 violation 
  to fix in Phase E
- Every new command type added to CommandRegistry must have a corresponding 
  typed entry — no string literals passed to dispatch()