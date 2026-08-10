import * as THREE from '@pryzm/renderer-three/three';

export interface Command {
    execute(): void;
    undo(): void;
}

export class AddObjectCommand implements Command {
    // pryzm/affected-stores-required — truthful declaration: this LEGACY command
    // (Sprint AP extraction; still used by initFurnitureInteraction) mutates the
    // THREE scene graph directly and touches NO domain store. An empty list is
    // the honest answer, not an exemption — if it ever gains a store write, the
    // field must name it.
    readonly affectedStores = [] as const;
    constructor(private scene: THREE.Object3D, private object: THREE.Object3D) {}
    execute() {
        this.scene.add(this.object);
    }
    undo() {
        this.scene.remove(this.object);
    }
}

export class UndoManager {
    private history: Command[] = [];
    private pointer: number = -1;

    add(command: Command) {
        this.history.splice(this.pointer + 1);
        this.history.push(command);
        this.pointer++;
    }

    undo() {
        if (this.pointer >= 0) {
            this.history[this.pointer].undo();
            this.pointer--;
            return true;
        }
        return false;
    }

    redo() {
        if (this.pointer < this.history.length - 1) {
            this.pointer++;
            this.history[this.pointer].execute();
            return true;
        }
        return false;
    }
}

export const undoManager = new UndoManager();
