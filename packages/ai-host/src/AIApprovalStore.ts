import { AIApprovalRecord } from './AIApprovalRecord.js';

/**
 * Persistent, immutable, and append-only store for AI action approvals.
 * History is stored in localStorage to survive restarts and reloads.
 */
export class AIApprovalStore {
    private static STORAGE_KEY = 'ai-approval-log';
    private records: AIApprovalRecord[] = [];

    constructor() {
        // Defer localStorage restoration to idle time — avoids a synchronous
        // JSON.parse() hit on the project-open critical path.
        const scheduleIdle: (fn: () => void) => void =
            typeof requestIdleCallback !== 'undefined'
                ? (fn) => requestIdleCallback(fn, { timeout: 3000 })
                : (fn) => setTimeout(fn, 0);
        scheduleIdle(() => this.load());
    }

    /**
     * Appends a new approval record to the audit log.
     * Records are immutable once written.
     */
    append(record: AIApprovalRecord): void {
        this.records.push(record);
        this.save();
        console.log(`[AIApprovalStore] Audit record appended: ${record.id} (${record.commandType})`);
    }

    /**
     * Returns a read-only list of all approval records.
     */
    getAll(): readonly AIApprovalRecord[] {
        return Object.freeze([...this.records]);
    }

    /**
     * Retrieves an approval record by its associated proposal ID.
     */
    getByProposalId(proposalId: string): AIApprovalRecord | undefined {
        return this.records.find(r => r.proposalId === proposalId);
    }

    /**
     * Returns the total number of approved actions in the audit log.
     */
    size(): number {
        return this.records.length;
    }

    /**
     * Persists the log to localStorage.
     */
    private save(): void {
        try {
            // @project-isolation: app-global. AI approval audit log is per-user
            // and intentionally crosses projects (a single audit trail per device);
            // see AIApprovalStore.STORAGE_KEY = 'pryzm.aiApprovalLog.v1'.
            localStorage.setItem(AIApprovalStore.STORAGE_KEY, JSON.stringify(this.records));
        } catch (error) {
            console.error('[AIApprovalStore] Failed to persist audit log:', error);
        }
    }

    /**
     * Restores the log from localStorage on startup.
     */
    private load(): void {
        try {
            const data = localStorage.getItem(AIApprovalStore.STORAGE_KEY);
            if (data) {
                this.records = JSON.parse(data);
                console.log(`[AIApprovalStore] Restored ${this.records.length} audit records.`);
            }
        } catch (error) {
            console.error('[AIApprovalStore] Failed to restore audit log:', error);
            this.records = [];
        }
    }
}

// Single authoritative instance
export const aiApprovalStore = new AIApprovalStore();
