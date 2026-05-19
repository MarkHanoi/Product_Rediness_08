# BIM Intelligence Agent Configuration

## Overview
This project is a Building Information Modeling (BIM) system equipped with a BIM Intelligence Agent. The agent is a system component designed to analyze, explain, validate, and summarize BIM models using semantic data.

## Core Role & Operating Principles
- **Read-Only Analysis**: The agent operates strictly in read-only mode regarding the BIM model. It provides insights and analysis but does not execute modifications, geometry changes, or tool commands.
- **Source of Truth**: All reasoning is grounded in semantic data (attributes, relationships, rules, constraints).
- **Output Contract**: Responses must follow a structured format:
    1. SUMMARY
    2. OBSERVATIONS
    3. REASONING
    4. IMPLICATIONS
    5. CONFIDENCE

## Capabilities
- Semantic data querying and summarization.
- Relationship traversal and statistical analysis.
- Rule evaluation and pattern detection.
- Risk and anomaly identification.

## Restrictions
- No creation, modification, or deletion of elements.
- No executable commands or UI control.
- No autonomous optimization.
- No apologizing for limitations; follow the Refusal Protocol.

## Project Structure
- `src/`: Source code for the BIM viewer and analysis tools.
- `src/commands/`: Command pattern implementation for safe, undoable BIM operations.
- `src/elements/`: Element stores (walls, slabs, columns, etc.).
- `src/ai/`: AI read model and query engine.
- `src/core/`: Core BIM kernel and services.
- `public/`: Static assets.
- `attached_assets/`: Project-specific documentation and logs.

## Command System Architecture (Horizon-2)

### Anchor Commands
The system implements three anchor commands to prove command authority:

1. **CreateWallCommand** - Creates new wall elements
2. **DeleteElementCommand** - Removes existing elements  
3. **UpdateWallHeightCommand** - Updates wall height (parametric edit)

### Command Authority Principles
- All BIM element mutations MUST go through `CommandManager.execute()`
- Commands are context-pure (rely exclusively on `CommandContext`)
- All commands are undoable and deterministic
- Semantic state is the source of truth; geometry reflects semantics
- Partial execution is forbidden

### UpdateWallHeightCommand Contract
```typescript
interface UpdateWallHeightInput {
    wallId: string;    // Wall must exist
    newHeight: number; // Absolute height, finite, positive
}
```

**Validation Constraints:**
- Wall must exist
- Height must be finite and positive
- Height must be >= 0.3m (MIN_HEIGHT)
- Height must be <= 20.0m (MAX_HEIGHT)
- Height must not clip existing openings
- Height must respect level bounds (if applicable)

**Events Emitted:**
- `wall-updated` - On successful height change
- `bim-model-changed` - Triggers AI read-model refresh

## AI Actions Workflow (Horizon-2 Entry)

### Purpose
Enables user-initiated AI action proposals with explicit human approval before execution.

### Workflow
1. User clicks "Analyze Model for AI Actions" button in the AI Actions tab
2. `AIService.getCommandProposals()` generates `CommandProposal[]` from model violations
3. Proposals are staged in `CommandProposalStore` (NOT executed)
4. UI renders each proposal with:
   - Intent type and rationale
   - Confidence score
   - Validation status (VALID/INVALID)
   - Approve / Reject buttons
5. **Approve** → `CommandManager.execute(proposal.command)` → removes from store
6. **Reject** → removes from store with no side effects

### Safety Guarantees
- AI NEVER executes commands automatically
- AI does NOT infer intent from free-text queries
- All proposals require explicit user approval
- All mutations go through `CommandManager`
- Invalid proposals cannot be approved (button disabled)

### Key Files
- `src/ui/ai/AIPanel.ts` - AI Actions tab with proposal rendering
- `src/ai/AIService.ts` - `getCommandProposals()` method
- `src/commands/CommandProposalStore.ts` - Proposal staging store
- `src/commands/CommandManager.ts` - Command execution with source tracking

## User Preferences
- Follow the structured BIM Intelligence Agent personality for all analytical responses.
- Maintain a technical, factual, and non-apologetic tone.

## Project Status: Horizon-3 Readiness Audit (2026-02-01)

The system has been audited against the Horizon-3 Readiness Checklist. We are currently in **Horizon 2 (Enhanced Semantic Intelligence)** with strong indicators for Horizon-3 transition.

### 🧱 CATEGORY 1 — Command System Maturity
- **1.1 Every Model Mutation Is a Command**: ✅ Pass. All mutations go through `CommandManager.execute()`.
- **1.2 Commands Are Fully Reversible**: ✅ Pass. `execute()` and `undo()` are implemented.
- **1.3 Commands Are Serializable**: ✅ Pass. `serialize()` returns standard JSON payloads.

### 🧠 CATEGORY 2 — Intent → Proposal Boundary
- **2.1 AI Never Executes Commands**: ✅ Pass. `AIService` only returns `CommandProposal[]`.
- **2.2 CommandProposal Is a First-Class Type**: ✅ Pass. Defined in `src/commands/types.ts`.
- **2.3 Proposal Validation Exists**: ✅ Pass. `CommandProposalFactory` runs `canExecute()` during creation.

### 🧑‍⚖️ CATEGORY 3 — Human Authority & Control
- **3.1 Explicit Approval UI Exists**: ✅ Pass. `AIPanel.ts` implements Approve/Reject buttons.
- **3.2 Rejection Is Side-Effect Free**: ✅ Pass. Rejection only removes the proposal from the store.
- **3.3 Approval Is Logged**: ✅ Pass. `AIApprovalStore` provides a persistent, immutable, and append-only audit log of all human-approved AI actions.

### 📐 CATEGORY 4 — Determinism & Predictability
- **4.1 Commands Are Deterministic**: ✅ Pass. Logic relies strictly on `CommandContext`.
- **4.2 Simulation / Dry-Run Exists**: ✅ Pass. `canExecute()` provides pre-approval validation.

### 🧩 CATEGORY 5 — Semantic Readiness
- **5.1 Core Elements Have Stable Identity**: ✅ Pass. Persistent IDs survive undo/redo.
- **5.2 Minimum Semantic Coverage Exists**: ✅ Pass. Rules now cover thickness, height, accessibility, and fire safety.

### 🛑 CATEGORY 6 — Explicit Non-Goals
- **6.1 No Autonomous Execution**: 🔒 Locked.
- **6.2 No Multi-Step Autonomy**: 🔒 Locked.
- **6.3 No View or Camera Control**: 🔒 Locked.

### 🧪 CATEGORY 7 — Testing & Proof
- **7.1 Manual Test Scenario Exists**: ✅ Pass. (Wall height update scenario).
- **7.2 Negative Test Exists**: ✅ Pass. (Invalid height validation).

---
**Current State: Horizon 3**
The system is officially in Horizon 3 (Human-Approved, Intent-Driven AI Actions). Every AI-suggested mutation is human-verified and recorded in a persistent, immutable audit log.

## Stair System Architecture (Horizon-3)

### Stair Commands
The system implements four stair commands following semantic-first principles:

1. **CreateStairCommand** - Creates new stair elements with code-compliant parameters
2. **UpdateStairParametersCommand** - Updates stair dimensions (riser height, tread depth, width)
3. **ValidateStairCommand** - Validates stair against building codes
4. **GenerateStairGeometryCommand** - Projects 3D geometry from semantic stair data

### Stair Validation Rules
- **P0-STAIR-NON-ADJACENT-LEVELS** (error): Stairs can only connect adjacent levels
- **P1-STAIR-RISER-HEIGHT-OUT-OF-RANGE** (warning): Riser height must be 150-190mm
- **P1-STAIR-WIDTH-BELOW-ACCESSIBILITY** (warning): Width must be 900mm+ (1200mm for accessible)

### StairCommandPlan Pattern
Multi-step stair creation uses the CommandPlan pattern:
1. Calculate optimal riser count and height from level heights
2. Create semantic stair entity
3. Validate against building codes
4. Project geometry

### Key Stair Files
- `src/elements/stairs/StairTypes.ts` - Stair semantic model interface
- `src/elements/stairs/StairStore.ts` - Stair data management
- `src/elements/stairs/StairMeshBuilder.ts` - Geometry projection
- `src/commands/stair/` - All stair commands
- `src/commands/plans/StairCommandPlan.ts` - Multi-step stair plan factory

### Stair Constraints
- Riser height: 150-190mm (code requirement)
- Tread depth: ≥250mm
- Width: ≥900mm standard, ≥1200mm accessible
- Height tolerance: 1mm for level-to-riser calculations

## Beam System Architecture (Horizon-3)

### Beam Commands
The system implements three beam commands following the Command pattern:

1. **CreateBeamCommand** - Creates new beam elements with structural validation
2. **UpdateBeamCommand** - Updates beam properties (dimensions, material, fire rating)
3. **AssignBeamSupportsCommand** - Assigns beam to vertical supports (columns, walls, beams)

### BeamStore
Semantic data management for beams with calculated metrics:
- `calculateSpan(beam)` - Returns beam span from start/end points
- `calculateSpanToDepthRatio(beam)` - Critical structural ratio
- `getSupportCount(beam)` - Number of assigned supports (0, 1, or 2)

### BeamCommandPlan Pattern
Multi-step beam creation uses preconditions and postconditions:
1. **Preconditions**: Level exists, span within limits, dimensions valid, span-to-depth ratio check
2. **Steps**: Create beam, assign supports, validate
3. **Postconditions**: Beam has valid span, connected to supports, on correct level

### Beam Validation Rules
- **P0-BEAM-WITHOUT-SUPPORTS** (error): Beams must have at least 2 supports
- **P0-BEAM-SPAN-EXCEEDS-MAXIMUM** (error): Span-to-depth ratio > 20 is invalid
- **P1-BEAM-DEPTH-TOO-SMALL** (warning): Span-to-depth ratio > 15 may cause deflection
- **P1-BEAM-NO-LOAD-PATH** (warning): Beam without any support assignments
- **P2-BEAM-MISSING-FIRE-RATING** (info): Load-bearing beams should have fire rating

### LoadPathGraph
Semantic load path analysis for structural reasoning:
- `analyze()` - Builds graph and finds load path issues
- `getLoadPath(elementId)` - Traces load path from element to foundation
- `whatBreaksIf(elementId)` - Shows elements depending on a support
- `explainLoadPath(elementId)` - Human-readable load path explanation

**Note**: LoadPathGraph provides semantic connectivity reasoning only - no physics simulation.

### Beam Constraints
- Min span: 0.5m, Max span: 20m
- Min width: 0.1m, Min depth: 0.15m
- Max span-to-depth ratio: 20 (recommended: 15)

### Key Beam Files
- `src/elements/beams/BeamTypes.ts` - Beam semantic model interface
- `src/elements/beams/BeamStore.ts` - Beam data management
- `src/commands/beam/` - All beam commands
- `src/commands/plans/BeamCommandPlan.ts` - Multi-step beam plan factory
- `src/structural/LoadPathGraph.ts` - Semantic load path analysis

## Recent Changes
- 2026-02-02: Implemented complete Beam system with BeamStore, 3 commands, 5 validation rules.
- 2026-02-02: Added BeamCommandPlanFactory with preconditions, postconditions, and risk assessment.
- 2026-02-02: Added LoadPathGraph for semantic load path reasoning (no physics simulation).
- 2026-02-02: Updated AIReadModel with beam support (AIBeam type, calculated metrics).
- 2026-02-02: Updated CommandContext to include beamStore.
- 2026-02-02: Added Stair button to UI Create section with BimService.createStair() method.
- 2026-02-02: Fixed PlanOrdering.ts to include all CommandTypes (stair commands + REGISTER_ELEMENT).
- 2026-02-02: Implemented comprehensive Stair system with 4 commands and 3 validation rules.
- 2026-02-02: Added StairCommandPlanFactory for multi-step stair creation.
- 2026-02-02: Updated CommandContext to include stairStore.
- 2026-02-01: Performed formal Horizon-3 Readiness Audit.
- 2026-02-01: Implemented 8+ professional domain-driven validation rules (P0-P2) in `RuleEngine.ts`.
- 2026-02-01: Updated `AIService` to surface technical rule details verbatim in action rationales.
- 2026-02-01: Implemented AI Actions workflow with explicit intent triggering and Approve/Reject UI.
- 2026-02-01: Implemented `UpdateWallHeightCommand` with safety constraints.
