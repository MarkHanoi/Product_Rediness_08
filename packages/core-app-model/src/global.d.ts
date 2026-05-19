// @pryzm/core-app-model — global Window augmentation for legacy store globals.
//
// These are temporary bridge properties set on window by engineLauncher.ts during
// bootstrap. They will be removed/gated when the plugin DI system matures
// (tracked at ADR-0038 §7 "store injection phase").
//
// Rules:
//  • Declare the MINIMUM interface the code inside this package actually uses.
//  • All stores use `LegacyElementStoreGlobal` so stores-arrays union correctly.
//  • Every window property is optional — nothing is guaranteed to be present.
//  • Interfaces declared inside declare global{} are globally visible.

declare global {
    /** Minimal common interface for all element-family stores bridged via window globals.
     *  Using `any` returns is intentional — these are runtime-injected, opaque stores
     *  whose concrete types live outside this package (pending DI migration, ADR-0038). */
    interface LegacyElementStoreGlobal {
        // query
        get?(id: string): any;
        getById?(id: string): any;
        getAll?(): any[];
        getAllDoors?(): any[];
        getAllWindows?(): any[];
        getWindow?(id: string): any;
        getDoor?(id: string): any;
        // mutation (used by gridStore bridge in BimKernel)
        add?(item: unknown): void;
        update?(id: string, updates: unknown): void;
        has?(id: string): boolean;
        remove?(id: string): void;
    }

    /** SpeechRecognition constructor shape — used by VoiceSpatialInterface. */
    interface LegacySpeechRecognitionCtor {
        new(): {
            continuous: boolean;
            interimResults: boolean;
            lang: string;
            onresult: ((e: SpeechRecognitionEvent) => void) | null;
            onerror:  ((e: SpeechRecognitionErrorEvent) => void) | null;
            onend:    (() => void) | null;
            start(): void;
            abort(): void;
        };
    }

    interface Window {
        // ── Element-family stores — all typed as LegacyElementStoreGlobal so that
        //    stores-arrays in BimKernel + SpatialAuthority produce a clean union ──
        columnStore?:       LegacyElementStoreGlobal;
        wallStore?:         LegacyElementStoreGlobal;
        gridStore?:         LegacyElementStoreGlobal;
        slabStore?:         LegacyElementStoreGlobal;
        beamStore?:         LegacyElementStoreGlobal;
        stairStore?:        LegacyElementStoreGlobal;
        curtainWallStore?:  LegacyElementStoreGlobal;
        plumbingStore?:     LegacyElementStoreGlobal;
        furnitureStore?:    LegacyElementStoreGlobal;
        lightingStore?:     LegacyElementStoreGlobal;
        openingStore?:      LegacyElementStoreGlobal;
        handrailStore?:     LegacyElementStoreGlobal;

        // ── BatchCoordinator diagnostics + renderer access ─────────────────────
        /** Short UUID slice set during a batch; cleared on forceReset(). §A.6/§D.1 */
        __activeBatchId?: string;
        /** THREE renderer exposed by engineLauncher; null until initScene() runs. */
        pryzmRenderer?:   { shadowMap?: { enabled: boolean }; [key: string]: unknown } | null;
        /** Saved shadow-map state during batch shadow suppression. §BATCH-SHADOW-MAP */
        __pryzmBatchShadowWasEnabled?: boolean;
        /** RoomTopologyObserver singleton — set by initTools(). §G.2 */
        roomTopologyObserver?: {
            cancelPendingForLevels?(levelIds: string[]): void;
            setPostBatchCooldown?(until: number): void;
            [key: string]: unknown;
        };
        /** ProjectIsolationAudit — in-memory leak report history. §CONTRACT-48 */
        __pryzmIsolationLeaks?: unknown[];

        /** RenderPipelineManager singleton — set by initUI(). §POST-GEOMETRY-COMPILE */
        renderPipelineManager?: {
            render(delta: number): void;
            selectedObjects?: object[];
            hoveredObjects?:  object[];
            [key: string]: unknown;
        };

        // ── VoiceSpatialInterface — Web Speech API + runtime bridge globals ────
        SpeechRecognition?:       LegacySpeechRecognitionCtor;
        webkitSpeechRecognition?: LegacySpeechRecognitionCtor;
        worldModelAdapter?: {
            toPromptContext(mode: string): string;
            [key: string]: unknown;
        };
        selectionBus?: {
            currentIds?: string[];
            [key: string]: unknown;
        };
        commandManager?: {
            execute(cmd: unknown): void;
            [key: string]: unknown;
        };
        roomStore?: {
            getById(id: string): any;
            getAll(): any[];
            [key: string]: unknown;
        };
        templateStore?: {
            getAll(): any[];
            [key: string]: unknown;
        };
        bimManager?: {
            getComponents?(): any;
            [key: string]: unknown;
        };
        selectionManager?: {
            getSelected?(): string[];
            select?(id: string): void;
            [key: string]: unknown;
        };
    }
}

export {};
