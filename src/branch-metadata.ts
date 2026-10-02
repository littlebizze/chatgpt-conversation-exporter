import { unzipSync, strFromU8 } from 'fflate';
import { isRecord } from './types';

export interface BranchMetadata {
  rootConversationId: string;
  rootTitle: string;
  parentConversationId: string;
  branchNumber: number;
}

export function readBranchMetadata(bytes: Uint8Array): BranchMetadata | undefined {
  try {
    // Inspect only the small metadata entry. Never expand nested archives or files.
    const entries = unzipSync(bytes, { filter: file => file.name === 'branch-metadata.json' && file.originalSize <= 16_384 });
    const entry = entries['branch-metadata.json'];
    if (!entry) return;
    const value: unknown = JSON.parse(strFromU8(entry));
    if (isRecord(value) && typeof value.rootConversationId === 'string' &&
        typeof value.rootTitle === 'string' && typeof value.parentConversationId === 'string' &&
        typeof value.branchNumber === 'number' && Number.isSafeInteger(value.branchNumber) && value.branchNumber > 0) {
      return value as unknown as BranchMetadata;
    }
  } catch { /* Ordinary ZIP attachments do not have to be extension exports. */ }
}

export function branchPrompt(): string {
  return `Attached is an export of another conversation, including its branches and files. Continue from the branch identified as current. Read that branch and inspect the relevant files. Summarize the goal, decisions, unresolved questions, and next step. Tell me if anything could not be read, then wait for my next instruction.`;
}
