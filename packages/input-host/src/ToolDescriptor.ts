export interface ToolDescriptor {
    id: string;
    label: string;
    section: "MODEL" | "ANNOTATION" | "VIEW";
    icon?: string;
}
