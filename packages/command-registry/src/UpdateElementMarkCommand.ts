import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from './types';

export interface UpdateElementMarkInput {
    elementId: string;
    elementType: 'wall' | 'window' | 'door' | 'slab' | 'column' | 'beam' | 'curtain-wall' | 'stair';
    newMark: string;
}

export class UpdateElementMarkCommand implements Command {
    /**
     * F4.4 — May touch any of these element stores depending on `elementType`.
     * Window/door updates go through wallStore; curtain wall not yet covered.
     */
    readonly affectedStores = ['wall', 'slab', 'column', 'beam', 'stair'] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.UPDATE_ELEMENT_MARK;
    readonly timestamp = Date.now();
    readonly targetIds: string[];

    private previousMark?: string;

    constructor(private input: UpdateElementMarkInput) {
        this.targetIds = [input.elementId];
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        if (!this.input.elementId) return { ok: false, reason: "Missing elementId" };
        if (!this.input.newMark) return { ok: false, reason: "Mark cannot be empty" };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { elementId, elementType, newMark } = this.input;
        let element: any;

        switch (elementType) {
            case 'wall': element = context.stores.wallStore.getById(elementId); break;
            case 'window': element = context.stores.wallStore.getWindow(elementId); break;
            case 'door': element = context.stores.wallStore.getDoor(elementId); break;
            case 'slab': element = context.stores.slabStore.getById(elementId); break;
            case 'column': element = context.stores.columnStore.get(elementId); break;
            case 'beam': element = context.stores.beamStore.get(elementId); break;
            case 'stair': element = context.stores.stairStore.get(elementId); break;
            // Curtain wall store might need to be added to CommandContext if not there
            default: return { success: false, affectedElementIds: [], info: [`Unsupported element type: ${elementType}`] };
        }

        if (!element) return { success: false, affectedElementIds: [], info: ["Element not found"] };

        this.previousMark = element.properties?.mark;

        const updatedProperties = { ...element.properties, mark: newMark };

        switch (elementType) {
            case 'wall': context.stores.wallStore.update(elementId, { properties: updatedProperties }); break;
            case 'window': context.stores.wallStore.updateWindow(elementId, { properties: updatedProperties }); break;
            case 'door': context.stores.wallStore.updateDoor(elementId, { properties: updatedProperties }); break;
            case 'slab': {
                // SlabStore.update() requires a full SlabData (§01 §3.4).
                // Fetch the current full slab and return it with only properties replaced.
                const fullSlab = context.stores.slabStore.getById(elementId);
                if (fullSlab) {
                    context.stores.slabStore.update(elementId, { ...fullSlab, properties: updatedProperties });
                }
                break;
            }
            case 'column': {
                // §COLUMN-AUDIT-2026 §W2: ColumnStore.update() requires a full
                // Omit<ColumnData, 'id' | 'type'> next-state. Build it from the
                // current column with only properties replaced.
                const fullCol = context.stores.columnStore.get(elementId);
                if (fullCol) {
                    const { id: _id, type: _type, ...rest } = { ...fullCol, properties: updatedProperties };
                    void _id; void _type;
                    context.stores.columnStore.update(elementId, rest as any);
                }
                break;
            }
            case 'beam': context.stores.beamStore.update(elementId, { properties: updatedProperties }); break;
            case 'stair': context.stores.stairStore.update(elementId, { properties: updatedProperties }); break;
        }

        return { success: true, affectedElementIds: [elementId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.previousMark === undefined) return { success: true, affectedElementIds: [] };
        
        const undoInput = { ...this.input, newMark: this.previousMark };
        const undoCommand = new UpdateElementMarkCommand(undoInput);
        return undoCommand.execute(context);
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.input,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
