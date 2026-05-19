import { CommandProposal } from './types';

export class CommandProposalStore {
    private proposals = new Map<string, CommandProposal>();

    add(proposal: CommandProposal) {
        this.proposals.set(proposal.id, proposal);
    }

    remove(proposalId: string) {
        this.proposals.delete(proposalId);
    }

    get(proposalId: string): CommandProposal | undefined {
        return this.proposals.get(proposalId);
    }

    getAll(): CommandProposal[] {
        return Array.from(this.proposals.values());
    }

    list(): CommandProposal[] {
        return this.getAll();
    }

    clear() {
        this.proposals.clear();
    }

    size(): number {
        return this.proposals.size;
    }
}

export const commandProposalStore = new CommandProposalStore();
