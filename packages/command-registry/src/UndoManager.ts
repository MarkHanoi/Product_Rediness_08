import * as THREE from '@pryzm/renderer-three/three';

export interface Command {
    execute(): void;
    undo(): void;
}

export class AddObjectCommand implements Command {
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
