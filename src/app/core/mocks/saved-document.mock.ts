// Mock for #14: chat saves assistant content as a document attachment. Remove when #14 is delivered.
import type { Schema } from '../../../../shared/model';

/** Whether an attachment card marks a document the assistant has just saved. */
export function mockSavedDocument(card: Schema['ResourceCard']): boolean {
  return card.type === 'ATTACHMENT' && (card as { created?: boolean }).created === true;
}
