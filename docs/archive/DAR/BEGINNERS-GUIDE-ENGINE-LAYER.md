# The Engine Layer — WASM + TypeScript
## Explained From Zero: What It Is, Why It Exists, and How Every Part Works

---

## The Question to Answer First: What Is an "Engine"?

In software, an **engine** is the part of a program that does the core computational work — the part that actually processes, transforms, and manages data, as opposed to displaying it or storing it.

Think of a car. The engine is hidden under the bonnet. It does the actual work of converting fuel into motion. The dashboard, the seats, the steering wheel — those are the interface. But without the engine, nothing moves.

In the BIM platform:
- The **interface** is what users see: the 3D viewport, the toolbar, the property panel, the sidebar — all built in React (a JavaScript framework for building web user interfaces)
- The **engine** is what makes it actually work: geometry calculations, 3D scene management, collaborative state, command processing

The engine layer sits between the user interface (what you see) and the data layer (what is stored). It is the brain.

---

## Why the Engine Needs Two Technologies: WASM and TypeScript

The engine is built from two fundamentally different technologies. Understanding why requires understanding a limitation of JavaScript — the language that runs in every web browser.

### The JavaScript limitation

JavaScript was invented in 1995 to make web pages interactive. It was never designed for heavy computation. It has a specific characteristic called **single-threaded execution** — it can only do one thing at a time, and that one thing happens on the browser's **main thread**.

The main thread is precious. It is responsible for:
- Responding to user clicks and keyboard input
- Running animations and the 60-frames-per-second rendering loop
- Updating the user interface
- Running your JavaScript code

If you put a computationally heavy task on the main thread — like parsing a 100 MB IFC building model — the browser freezes. The interface stops responding. The user sees a spinning cursor and cannot do anything until the computation finishes. This might take 30 seconds. This is unacceptable.

Additionally, JavaScript is an interpreted language. It is not converted to machine code before it runs — it is translated on the fly. This makes it significantly slower than languages like C++ or Rust that compile directly to machine code.

For a 3D BIM authoring platform, this creates a fundamental problem. BIM involves:
- Parsing millions of geometric primitives from IFC files
- Computing intersections, boolean operations on solid geometry
- Managing scene graphs with 50,000+ objects
- Running at 60 frames per second

Pure JavaScript cannot do this at the performance level required.

### The solution: WASM handles what JavaScript cannot, TypeScript handles everything else

**TypeScript** is a superset of JavaScript with a type system added on top. It compiles to JavaScript and runs in the browser. It is excellent for:
- Orchestrating logic (deciding what to do, coordinating between parts)
- Managing state (tracking what is selected, what has changed)
- Handling events (user clicks, keyboard shortcuts, network messages)
- Calling into WASM when heavy computation is needed

**WASM** (WebAssembly) is a binary format that runs in the browser at near-native speed. It is not a programming language — it is a compilation target. You write code in C++, Rust, or other languages, compile it to WASM, and the browser executes it at speeds approaching a native desktop application.

WASM is excellent for:
- Parsing complex binary formats (IFC STEP files)
- Geometric computations (boolean operations on solids)
- Mesh processing (simplification, optimization)
- Anything that would be too slow in JavaScript

Together they form a complete engine: TypeScript for coordination and logic, WASM for raw computation.

---

## Part 1 — TypeScript: The Orchestration Language

### What TypeScript adds to JavaScript

JavaScript is dynamically typed — you can put any value in any variable, and errors only surface at runtime (when a user actually does something):

```javascript
// JavaScript — no errors until the code runs
let wall = "a wall"
wall.thickness  // returns undefined — no error!
wall.moveTo(x, y)  // Error: wall.moveTo is not a function
```

TypeScript is statically typed — types are checked before the code runs, at compile time:

```typescript
// TypeScript — errors caught immediately, before any user sees them
interface Wall {
  id: string
  thickness: number
  fireRating: string
  position: { x: number; y: number; z: number }
}

let wall: Wall = "a wall"  // ERROR: Type 'string' is not assignable to type 'Wall'
```

For an engineering platform where a type error could result in a column placed 500mm in the wrong direction — which a contractor might build — catching errors before they reach users is not optional.

### Why TypeScript matters specifically for the engine

The engine is the most complex part of the codebase. It coordinates:
- The collaborative document (Yjs) — typed element graph
- The command bus — typed commands with typed payloads
- The scene graph — typed 3D objects
- The renderer — typed draw calls and materials
- The geometry kernel — typed mesh operations

Every boundary between these systems is a contract. TypeScript enforces these contracts at compile time. A command that tries to move a wall to a position that is not a 3D coordinate is caught before it ever reaches the renderer. A renderer that tries to access a material property that does not exist is caught before it ever touches the GPU.

In a system this interconnected, TypeScript's type system is not a luxury — it is the primary mechanism for preventing cascading failures.

---

## Part 2 — WASM: The Computation Engine

### What WebAssembly actually is

Imagine you are a concert hall. You have a house band — JavaScript — that can play most kinds of music. But for a particularly complex concerto that requires a 60-piece orchestra playing at full speed, the house band is not up to it.

WebAssembly is the orchestra. You can call them in for the specific pieces that require them. The house band (JavaScript/TypeScript) still conducts the show, manages the schedule, and handles everything else — but the heavy performance is done by the professionals.

WebAssembly code:
- Runs in a sandboxed environment inside the browser — it cannot access the file system, the network, or anything outside what JavaScript explicitly gives it
- Runs at approximately 80–90% of native C++ speed — far faster than JavaScript
- Can use multiple threads (via Web Workers) — bypassing JavaScript's single-thread limitation
- Shares memory with JavaScript — data can be passed without expensive copying

### The WASM modules in the engine layer

There are three WASM libraries doing heavy computation in the engine:

---

### WASM Module 1: `web-ifc` — The IFC Parser

**What it does:** Parses IFC (Industry Foundation Classes) files — the standard BIM exchange format — and extracts building elements, geometry, properties, and spatial structure.

**Why it needs WASM:** An IFC file for a large building might be 200 MB of text in a format called STEP (Standard for the Exchange of Product Data). This format was invented in the 1980s. Parsing it in JavaScript would take 2–5 minutes and freeze the browser. `web-ifc` is written in C++ (the original `IfcOpenShell` library, one of the world's most sophisticated IFC parsers, compiled to WASM). It parses the same file in 5–15 seconds, running in a background worker thread so the user interface remains responsive.

**What the IFC format looks like:**

```
#1=IFCPROJECT('0YvctVUKr4$PtdPY94BDvH',#6,'DAR Metro Extension',$,$,$,$,(#15,#16),#17);
#12=IFCWALL('2O2Fr$t4X7Zf8NOew3FLBB',$,'Interior Wall Type 2',$,$,#52,#55,#61);
#52=IFCPRODUCTDEFINITIONSHAPE($,$,(#49));
#55=IFLOCALPLACEMENT(#38,#56);
```

Each line is one entity. An IFC file has tens of thousands of these lines, cross-referencing each other. Resolving all the cross-references and extracting meaningful geometry requires the sophistication of a dedicated C++ library.

**How TypeScript calls into it:**

```typescript
import * as WebIFC from 'web-ifc'

// Initialize the WASM module (loads the .wasm binary)
const api = new WebIFC.IfcAPI()
await api.Init()

// Open the IFC file (pass the bytes to WASM)
const modelId = api.OpenModel(ifcFileBytes)

// Extract all walls
const wallIds = api.GetLineIDsWithType(modelId, WebIFC.IFCWALL)

for (const wallId of wallIds) {
  // Get the wall entity from WASM
  const wall = api.GetLine(modelId, wallId, true)
  
  // Extract geometry (WASM does the heavy computation)
  const geometry = await api.GetGeometry(modelId, wallId)
  
  // geometry is now a JavaScript-accessible object with vertices, normals, indices
  // → store in the element graph, generate GLB, display in 3D viewport
}
```

The TypeScript code is the coordinator — it tells `web-ifc` what to extract. The WASM code does the actual parsing and geometric computation.

---

### WASM Module 2: `rhino3dm` — The Rhino 3DM Parser

**What it does:** Opens Rhino `.3dm` files — the native format of Rhinoceros 3D, widely used in architectural design for complex curved geometry.

**Why it needs WASM:** The `.3dm` format uses NURBS (Non-Uniform Rational B-Splines) — a mathematical representation of curves and surfaces used for complex organic forms. `rhino3dm` is a port of Autodesk's `openNURBS` library, written in C++, compiled to WASM. There is no JavaScript equivalent — the mathematical complexity of NURBS evaluation requires a dedicated native library.

**How it runs:** Unlike `web-ifc` (which runs on the server in a Node.js worker), `rhino3dm` runs in the browser — it is loaded and executed client-side when a user imports a `.3dm` file.

```typescript
// Lazy load — only downloaded when a user actually imports a Rhino file
const rhino = await import('rhino3dm')
await rhino.ready  // wait for WASM to initialize

// Parse the 3DM file
const model = rhino.File3dm.fromByteArray(fileBytes)

// Iterate geometry
for (let i = 0; i < model.objects().count; i++) {
  const obj = model.objects().get(i)
  const geometry = obj.geometry()
  
  if (geometry.objectType === rhino.ObjectType.Brep) {
    // NURBS surface → tessellate to triangles for Three.js
    const mesh = geometry.toThreejsJSON()
    // → add to scene
  }
}
```

---

### WASM Module 3: `manifold` — Geometry Boolean Operations

**What it does:** Performs boolean geometry operations — union (combine two solids), subtract (cut one solid from another), intersect (find the overlap).

**Why it needs WASM:** Boolean operations on solid geometry require topological correctness — the result must be a valid, watertight solid. Floating-point arithmetic in JavaScript has precision limitations that cause boolean operations to produce invalid geometry (surfaces with gaps, inverted normals, degenerate triangles). `manifold` is a C++ library that uses robust geometric algorithms designed to handle these precision issues correctly.

**Where it is used:** Wall joints (where two walls meet at a corner, the joint geometry must be a valid solid), openings in walls for doors and windows (cutting a hole requires boolean subtraction), structural penetrations (a pipe passing through a slab).

```typescript
import ManifoldModule from 'manifold-3d'

const ManifoldSolid = await ManifoldModule()

// Create a wall solid
const wallBox = ManifoldSolid.box([0.25, 4.0, 2.8], true)

// Create a door opening
const doorOpening = ManifoldSolid.box([0.30, 1.0, 2.1], true)
  .translate([0, 1.5, 0])  // position the door opening

// Boolean subtract: cut the door opening from the wall
// This is where the WASM precision math is critical
const wallWithDoor = wallBox.subtract(doorOpening)

// Result is a valid solid with correct topology
// → tessellate → GLB → Three.js
```

---

## Part 3 — The Five Components of the Engine Layer

The engine is not one monolithic program. It is five distinct systems, each with a clear responsibility, communicating through well-defined interfaces.

---

### Component 1: The Geometry Kernel

**What it is:**

The geometry kernel is the subsystem responsible for creating, modifying, validating, and tessellating BIM geometry. It is the bridge between "a wall with these parameters" (semantic data) and "these 15,000 triangles arranged in 3D space" (renderable geometry).

**The key concept: geometry as a projection**

The geometry kernel operates on a fundamental principle: the semantic model (the data describing a building) is always the source of truth. Geometry is a deterministic, rebuildable *output* of that semantic data. If the geometry is lost or corrupted, it can always be regenerated from the semantic data.

This means:
- A wall in the semantic model: `{ startPoint: {x:0, y:0, z:0}, endPoint: {x:5, y:0, z:0}, thickness: 0.25, height: 2.8 }`
- The geometry kernel converts this to a 3D solid: a 5m × 0.25m × 2.8m box with the correct material properties
- This process is called **tessellation** — converting a mathematical description into triangles the GPU can render

**The tessellation pipeline:**

```
Semantic element parameters
        ↓
   Geometry recipe (how to build this element type)
        ↓
   Solid construction (build the 3D shape mathematically)
        ↓
   Boolean operations (cut openings, join adjacent elements)   [WASM: manifold]
        ↓
   Tessellation (convert solid to triangles)                   [WASM: web-ifc or custom]
        ↓
   Mesh optimization (remove duplicate vertices, optimize indices)
        ↓
   GLB export (pack into a Three.js-compatible binary file)
        ↓
   Upload to object storage + URL returned to client
```

**Why the kernel runs on the server (not the browser):**

Tessellation and boolean operations are computationally expensive. A large floor plate with 200 structural penetrations might require 200 boolean subtraction operations. Running this in the browser would freeze the interface for minutes.

Instead, the geometry kernel runs on the server as part of the **bake worker** (`apps/bake-worker`). When an engineer changes a wall, the change is applied immediately to the Yjs document (so the collaboration layer reflects it instantly), and a job is queued for the bake worker to recompute the geometry in the background. The new geometry (as a GLB file) is delivered to clients when ready — usually within 2–5 seconds.

This pattern — immediate semantic update + asynchronous geometry update — is why the platform feels fast. The user sees their change reflected immediately in the collaborative state, even though the precise rendered geometry takes a moment to update.

---

### Component 2: The Scene Graph

**What it is:**

A scene graph is a data structure that organises everything visible in the 3D viewport into a tree — a hierarchy of objects that contain other objects.

**The tree structure:**

```
Scene (root)
├── Level 0 (Ground Floor)
│   ├── Wall group
│   │   ├── Wall-001 (mesh + material + position)
│   │   ├── Wall-002 (mesh + material + position)
│   │   └── Wall-003 (mesh + material + position)
│   ├── Column group
│   │   ├── Column-001
│   │   └── Column-002
│   └── Slab group
│       └── Slab-001
├── Level 1 (First Floor)
│   ├── Wall group
│   │   └── ...
│   └── ...
└── Overlays (non-geometry)
    ├── Dimension lines
    ├── Annotation labels
    └── Selection highlights
```

**Why a tree structure?**

Hierarchy enables batch operations. If a user selects an entire level and moves it 3m north (adjusting the floor-to-floor height), you move the parent node in the tree. All children inherit the transformation automatically — you do not need to update 10,000 individual element positions. The renderer traverses the tree and applies the parent transform to every child.

Hierarchy also enables visibility control. Turning off "Level 2" in the discipline filters hides the Level 2 node and all its children in one operation.

**The scene graph is managed by Three.js:**

Three.js (a JavaScript/WebGL library) provides the scene graph as a tree of `Object3D` nodes. The engine's `SceneCommitter` is responsible for keeping the Three.js scene graph synchronized with the Yjs document (the source of truth).

**Important:** The scene graph is a rendering concern — it exists only in the browser's memory, only while the 3D viewport is open. It is rebuilt from the Yjs document (plus the stored GLB geometry files) whenever a project is opened. It is not stored in the database.

---

### Component 3: The FrameScheduler

**What it is:**

The FrameScheduler is the engine's conductor. It owns the browser's render loop — the mechanism that draws a new frame to the screen 60 times per second.

**Understanding the 16-millisecond budget:**

At 60 frames per second, the browser has 16.67 milliseconds to prepare and draw each frame. If any operation takes longer than 16ms, the frame is dropped — the animation stutters, the cursor feels sticky, and the interface feels broken.

The FrameScheduler ensures the 16ms budget is respected by organising all work into priority tiers and executing them in order within each frame.

**The priority tiers:**

```
Every frame (16ms total budget):
│
├── [Priority: interaction] — must complete in <2ms
│   Examples: selection highlighting, snap point display,
│             cursor feedback as you drag a wall
│   Why first: Users feel input lag above 8ms.
│              This tier is what makes the tool feel responsive.
│
├── [Priority: render] — the main 3D drawing, 8-12ms budget
│   Examples: SceneCommitter applies changes to the Three.js scene,
│             Three.js submits draw calls to the GPU
│   Why here: The actual rendering of the 3D model
│
├── [Priority: post-render] — effects added on top
│   Examples: ambient occlusion (shadows in corners),
│             edge highlighting, depth of field, bloom
│   Why last: These depend on the main render having finished
│
└── [Priority: overlay] — 2D content drawn above 3D
    Examples: dimension labels, level elevation markers,
              annotation text, user interface overlays
    Why last: Labels must be positioned relative to 3D geometry
              that has already been rendered this frame
```

Between frames (not every frame):

```
├── [Priority: idle] — runs when the frame budget is not consumed
│   Examples: LOD swaps (replacing detailed geometry with simplified),
│             geometry eviction (releasing GPU memory for distant objects),
│             thumbnail generation, search index updates
│
└── [Priority: background] — throttled, low-priority work
    Examples: path tracer accumulation (high-quality lighting render),
              offline sync operations, prefetching nearby geometry
```

**How the FrameScheduler works technically:**

```typescript
class FrameScheduler {
  private tickListeners = new Map<TickPriority, Set<TickListener>>()
  private running = false

  start() {
    this.running = true
    requestAnimationFrame(() => this.tick())
  }

  addTickListener(priority: TickPriority, listener: TickListener) {
    this.tickListeners.get(priority)!.add(listener)
  }

  private tick(timestamp: number) {
    if (!this.running) return

    // Execute each priority tier in order, every frame
    for (const priority of TICK_ORDER) {
      for (const listener of this.tickListeners.get(priority)!) {
        listener.onTick(timestamp)
      }
    }

    // Schedule the next frame
    requestAnimationFrame((t) => this.tick(t))
  }
}
```

The renderer registers itself as a `render` priority listener. The selection system registers as `interaction` priority. The overlay system registers as `overlay` priority. The FrameScheduler calls them all, in order, every 16ms.

**The critical rule:** The FrameScheduler never waits for async operations. If something takes longer than its time slot, it either defers to the next frame or moves to the idle/background tier. Nothing is allowed to block the frame loop.

---

### Component 4: The CommandBus

**What it is:**

The CommandBus is the single entry point for every change to the building model. Nothing modifies the model without going through the CommandBus.

Think of it as a **post office** for model changes. Every engineer who wants to change something writes it on a standardised form (a typed Command object), puts it in the post office (the CommandBus), and the post office handles delivery — including validation, optimistic application, server relay, and audit logging.

**Why a single entry point?**

Without a CommandBus, changes might come from many places: a user dragging an element in the 3D viewport, a form input in the property panel, an AI suggestion, an undo operation, a paste command, a plugin action. Each source might implement changes differently, might skip validation, might not generate an audit log entry, might not be undoable.

By routing all changes through the CommandBus:
- **Every change is validated** — a command that tries to set `thickness = -50` is rejected
- **Every change is undoable** — the CommandBus maintains an undo/redo stack
- **Every change appears in the audit log** — compliance is automatic
- **AI commands are indistinguishable from human commands** — same format, same validation, same audit trail
- **Every change is collaborative** — all commands go through the Yjs layer

**A command in full detail:**

```typescript
// The shape of a command — a precise contract
interface PlaceWallCommand {
  type: 'wall.place'
  payload: {
    id: string                   // UUID pre-generated on the client
    startPoint: { x: number; y: number; z: number }
    endPoint:   { x: number; y: number; z: number }
    thickness:  number           // in metres
    height:     number           // in metres
    levelId:    string           // UUID of the level it belongs to
    typeId:     string           // UUID of the wall type definition
    materialId: string           // UUID of the material
  }
  correlationId: string          // UUID for linking this command to its result
  actorId:       string          // who is executing this
  timestamp:     string          // when (ISO 8601)
}
```

**The journey of a command through the CommandBus:**

```
Engineer drags to place a wall
          ↓
Command object created: PlaceWallCommand { startPoint, endPoint, ... }
          ↓
1. SCHEMA VALIDATION (Zod library)
   - Is startPoint a valid 3D coordinate? ✓
   - Is thickness a positive number? ✓
   - Does levelId exist? ✓
   → If any check fails: command rejected, error shown to user
          ↓
2. CONSTRAINT CHECK
   - Is the wall too short (below minimum length)? 
   - Does the wall intersect a structural column in a way that violates rules?
   - Is the level currently locked?
   → Soft constraints show warnings; hard constraints block the command
          ↓
3. OPTIMISTIC APPLY
   - Command applied to local Yjs document immediately
   - SceneCommitter detects the change → new wall appears in 3D instantly
   - User sees their wall immediately — no waiting for server confirmation
          ↓
4. OPENTELEMETRY SPAN OPENED
   - Span name: "pryzm.command.execute"
   - Attributes: command_type="wall.place", actor_id=..., project_id=..., level_id=...
   - This span measures the full round-trip latency of the command
          ↓
5. SERVER RELAY
   - Command serialized and sent to sync server via WebSocket
   - Sync server applies to server-side Yjs document (authoritative merge)
   - Merged update broadcast to all other clients
   - All other engineers see the new wall appear on their screens
          ↓
6. SERVER ACKNOWLEDGEMENT
   - Server confirms command was accepted and applied
   - OTel span closed (total latency recorded)
          ↓
7. AUDIT LOG ENTRY
   - Row written to project_command_log: { command_type, actor_id, timestamp, payload_hash }
   - Immutable record — this wall was placed by this person at this time
          ↓
8. UNDO STACK
   - Command recorded in the local undo/redo history
   - Ctrl+Z generates the inverse command: { type: 'wall.delete', payload: { id: wall.id } }
```

If the server rejects the command (step 6 fails — network error, server error, or the server-side validation failed):
- The optimistic change (applied in step 3) is **rolled back**
- The wall disappears from the 3D view
- The user sees an error message: "Could not place wall — connection lost. Please try again."

This rollback mechanism is why the `correlationId` exists — the CommandBus can match the server's rejection to the specific optimistic change that needs to be undone.

---

### Component 5: The CRDT Integration Layer

**What it is:**

The CRDT integration layer is the connection between the engine and Yjs — the collaborative document layer. It is the part of the engine that ensures changes are shared with all collaborators and that remote changes from other engineers are applied to the local scene.

This layer has two responsibilities:

**Responsibility 1 — Outbound: apply commands to Yjs**

When the CommandBus applies a command (step 3 above), it does not modify some internal data structure directly. It modifies the Yjs document:

```typescript
// When a PlaceWallCommand is executed:
const elements = doc.getMap('elements')
const wall = new Y.Map()

wall.set('id', command.payload.id)
wall.set('type', 'IfcWall')
wall.set('thickness', command.payload.thickness)
wall.set('height', command.payload.height)
wall.set('levelId', command.payload.levelId)
wall.set('startPoint', command.payload.startPoint)
wall.set('endPoint', command.payload.endPoint)

elements.set(command.payload.id, wall)
```

This modification to the `Y.Doc` automatically triggers Yjs to:
- Record the operation in the operation log
- Generate a binary update
- Send the binary update to the sync server via WebSocket
- (The sync server then broadcasts to other clients)

**Responsibility 2 — Inbound: observe Yjs changes and update the scene**

When a remote engineer (Bob) makes a change, that change arrives as a binary Yjs update from the sync server. The CRDT layer receives it and Yjs applies it to the local `Y.Doc`.

But how does the 3D scene get updated? Yjs fires **observe events** — callbacks that trigger whenever a part of the document changes:

```typescript
// Whenever ANY element changes in the document, this fires
elements.observeDeep((events) => {
  for (const event of events) {
    if (event instanceof Y.YMapEvent) {
      // Something changed in the elements map
      // Figure out what changed
      const changedElementId = event.path[0]
      const changedKeys = event.changes.keys
      
      // Tell the SceneCommitter about the change
      sceneCommitter.notifyChange({
        type: 'element.update',
        elementId: changedElementId,
        changedProperties: changedKeys
      })
    }
  }
})
```

The `SceneCommitter` receives these notifications and queues them for the next render frame — it does not update the Three.js scene immediately (that would be thread-unsafe and potentially mid-frame). Instead, on the next `render` priority tick of the FrameScheduler, the SceneCommitter processes all queued changes and updates the Three.js scene graph.

This chain — remote change arrives → Yjs applies it → observe event fires → SceneCommitter queued → FrameScheduler tick → Three.js updated → GPU renders — typically completes in under 100ms from the moment a remote engineer makes a change to the moment the local user sees it on screen.

---

## Part 4 — How the Five Components Work Together

Here is a complete trace of one user action through all five components:

**The action:** A structural engineer on the London team moves a column 500mm north.

```
[User drags the column north in the 3D viewport]
            ↓
[FrameScheduler — interaction tick]
  Mouse position converted to 3D world coordinates
  Snap calculation: "nearest grid point is at (10.0, 0.5, 0.0)"
  Preview of the column shown at new position (ghost render)
            ↓
[User releases the mouse]
            ↓
[CommandBus — MoveElementCommand created]
  { type: 'element.move', payload: { elementId: 'col-045', delta: {x:0, y:0.5, z:0} } }
            ↓
[CommandBus — Validation]
  Schema: delta is a valid 3D vector ✓
  Constraint: new position does not conflict with existing elements ✓
            ↓
[CommandBus — Optimistic Apply → CRDT Layer]
  col-045 in Yjs document updated: position.y += 0.5
  Yjs generates binary update: [0x04 0xA1 ... 28 bytes]
  Binary update sent to sync server via WebSocket
            ↓
[SceneCommitter — observeDeep fires]
  "col-045 position changed"
  Queued for next render tick
            ↓
[FrameScheduler — render tick (next frame, ≤16ms later)]
  SceneCommitter processes the queue
  Three.js Object3D for col-045: position.y = new value
  Three.js draws the updated frame
            ↓
[User sees the column at its new position — INSTANT]
            ↓
[Geometry Kernel — background job queued]
  Bake worker receives job: "regenerate geometry for col-045"
  (The optimistic move uses the old geometry, just translated)
  (The bake worker produces the precise tessellated geometry)
  (When ready, the new GLB is sent to the client and the scene updates)
            ↓
[Sync Server — broadcasts to all other clients]
  Engineers in Riyadh, Dubai, Frankfurt receive the 28-byte update
  Their local Yjs documents are updated
  Their SceneCommitter queues the change
  Their renderers update on the next frame
  [They see the column move within ~50–100ms of London making the change]
            ↓
[CommandBus — OTel span closed]
  pryzm.command.execute span recorded: 127ms total round-trip
            ↓
[CommandBus — Audit log]
  project_command_log: { type: 'element.move', actor: 'user-london-struct', timestamp: ..., elementId: 'col-045' }
```

This entire flow — from user releasing the mouse to seeing the column at its new position — takes less than 16 milliseconds for the local user (one frame). The remote update propagates to other engineers within 50–150ms depending on network latency.

---

## Part 5 — The LOD System: Managing What the GPU Can Handle

LOD stands for **Level of Detail**. It is a technique for managing the performance cost of rendering large models.

**The problem:** A 50,000-element building model, if rendered at full geometric detail for every element simultaneously, would require processing hundreds of millions of triangles per frame. Even the fastest consumer GPU cannot do this at 60fps.

**The insight:** Elements far from the camera do not need to be rendered at full detail. A column that is 200 metres away (across the building) will occupy perhaps 4 pixels on screen. Rendering it as a full 3D solid with 2,000 triangles is wasteful — a coloured rectangle would look identical at that distance.

**The three LOD tiers:**

```
LOD 0 — Full detail (elements within 10 metres of camera)
  Used for: whatever the engineer is actively working on
  Triangle count: full tessellation, all detail
  Materials: full PBR (physically based rendering) — diffuse, roughness, metallic, normal maps
  Example: A wall with 2,800 triangles showing brick texture detail

LOD 1 — Simplified (elements 10–50 metres from camera)
  Used for: background context visible but not the focus
  Triangle count: ~30% of LOD 0 (meshopt simplification algorithm)
  Materials: diffuse colour only, no texture detail
  Example: The same wall reduced to 840 triangles, solid colour

LOD 2 — Bounding box (elements more than 50 metres from camera)
  Used for: distant elements — spatial reference only
  Triangle count: 12 (a box — 6 faces × 2 triangles)
  Materials: semi-transparent coloured box
  Example: The same wall is now just a translucent grey box
```

**How LOD switching works in the engine:**

The `LODManager` component runs inside the `SceneCommitter`. Each frame, it measures the distance from the camera to each element's bounding box centre, computes the LOD tier, and compares to the current tier:

```typescript
class LODManager {
  computeLOD(distanceMetres: number): 0 | 1 | 2 {
    if (distanceMetres < 10) return 0   // full detail
    if (distanceMetres < 50) return 1   // simplified
    return 2                            // bounding box
  }

  shouldSkip(elementId: string, cameraPosition: Vector3): boolean {
    const bbox = this.getBoundingBox(elementId)
    const distance = bbox.distanceTo(cameraPosition)
    const tier = this.computeLOD(distance)
    
    // If the element is already at the correct tier, skip it (no update needed)
    return this.currentTier.get(elementId) === tier
  }
}
```

LOD transitions are cross-faded over 200ms — the old geometry fades out while the new geometry fades in, eliminating the "pop" that would occur with an instant switch.

**Why this matters for performance:**

On a 50,000-element building:
- Elements within 10m (what you are working on): perhaps 200 elements at LOD 0
- Elements 10–50m away (adjacent areas): perhaps 2,000 elements at LOD 1
- Elements beyond 50m (rest of the building): 47,800 elements at LOD 2

Instead of rendering 50,000 × 2,000 triangles = **100 million triangles**, the scene renders roughly:
- 200 × 2,800 = 560,000 triangles at LOD 0
- 2,000 × 840 = 1,680,000 triangles at LOD 1  
- 47,800 × 12 = 573,600 triangles at LOD 2
- **Total: ~2.8 million triangles**

A 35x reduction in geometry load, with the close-up view looking identical to full detail.

---

## Summary: The Engine Layer in One Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ENGINE LAYER                                      │
│                                                                      │
│  GEOMETRY KERNEL                    SCENE GRAPH                     │
│  ─────────────────                  ──────────────                  │
│  Converts semantic data             Three.js object tree            │
│  (wall parameters) into             50,000+ Object3D nodes          │
│  3D solid geometry.                 LOD management                  │
│  Runs WASM for heavy math.          Visibility filtering             │
│  Runs on bake-worker server.        Lives in browser RAM only       │
│                                                                      │
│  COMMAND BUS                        FRAME SCHEDULER                 │
│  ────────────                       ───────────────                 │
│  Single entry point for             Owns the 16ms render loop       │
│  every model change.                Priority tiers:                 │
│  Validates → applies →              interaction → render →          │
│  relays → audits → undoes.          post-render → overlay → idle   │
│                                                                      │
│  CRDT INTEGRATION LAYER                                             │
│  ──────────────────────                                             │
│  Connects everything to Yjs.                                        │
│  Outbound: commands → Yjs operations → binary update → server      │
│  Inbound: server update → Yjs apply → observe event → scene diff   │
│                                                                      │
│         WASM MODULES (called by the engine as needed)               │
│  ─────────────────────────────────────────────────────             │
│  web-ifc: parse IFC files     rhino3dm: parse .3dm files           │
│  manifold: boolean geometry   meshopt: simplify meshes             │
│                                                                      │
│  TypeScript orchestrates all of the above.                          │
│  WASM handles what TypeScript cannot do fast enough.                │
└─────────────────────────────────────────────────────────────────────┘
```

The engine layer is the reason the platform feels like a professional tool rather than a web page. It is why 50 engineers can collaborate on the same model in real time, why a 200 MB IFC file opens in seconds rather than minutes, why the 3D viewport runs at 60fps on a mid-range laptop with 50,000 elements on screen, and why every change — whether from a human, an AI, or a plugin — is validated, audited, and reversible.

---

*Document written for non-technical and technical readers as a detailed explanation of the BIM platform engine layer.*
