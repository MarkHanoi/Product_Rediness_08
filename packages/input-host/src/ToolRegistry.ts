import { ToolDescriptor } from './ToolDescriptor.js';

class ToolRegistry {
    private tools: Map<string, ToolDescriptor> = new Map();

    register(descriptor: ToolDescriptor) {
        this.tools.set(descriptor.id, descriptor);
    }

    getBySection(section: "MODEL" | "ANNOTATION" | "VIEW"): ToolDescriptor[] {
        return Array.from(this.tools.values()).filter(t => t.section === section);
    }

    getById(id: string): ToolDescriptor | undefined {
        return this.tools.get(id);
    }

    getAll(): ToolDescriptor[] {
        return Array.from(this.tools.values());
    }
}

export const toolRegistry = new ToolRegistry();
