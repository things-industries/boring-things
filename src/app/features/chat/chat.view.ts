import type { Schema } from '../../../../shared/model';
import { mergeResourceCards } from '../../../../shared/resource-cards';

export interface MessageCards {
  /** Thing cards, shown after the answer text. */
  things: Schema['ResourceCard'][];
  /** Every other card, shown after the text. */
  others: Schema['ResourceCard'][];
}

/**
 * Groups supporting cards, omits the chat's own Thing and adds the Thing for referenced fields.
 */
export function messageCards(
  cards: Schema['ResourceCard'][],
  contextThingId: string | null,
  sourceRefs: Schema['SourceRef'][] = [],
): MessageCards {
  cards = mergeResourceCards([
    ...cards,
    ...sourceRefs
      .filter((ref) => ref.attachmentId)
      .map((ref): Schema['ResourceCard'] => ({
        type: 'ATTACHMENT',
        attachmentId: ref.attachmentId!,
        ...(ref.page ? { page: ref.page } : {}),
      })),
  ]);
  const things: Schema['ResourceCard'][] = [];
  const seen = new Set<string>(contextThingId ? [contextThingId] : []);

  for (const card of cards) {
    if (card.type !== 'THING' && card.type !== 'FIELD') continue;
    if (seen.has(card.thingId)) continue;
    seen.add(card.thingId);
    things.push(
      card.type === 'THING'
        ? card
        : { type: 'THING', thingId: card.thingId, available: card.available },
    );
  }

  return { things, others: cards.filter((card) => card.type !== 'THING') };
}

export type AssistantState = 'waiting' | 'preparing' | 'answered' | 'interrupted';

/** State of the newest assistant message, for the page's status announcement. */
export function assistantState(messages: Schema['Message'][]): AssistantState | null {
  const last = [...messages].reverse().find((message) => message.role === 'ASSISTANT');

  if (!last) return null;
  if (last.status === 'QUEUED') return 'waiting';
  if (last.status === 'PROCESSING') return 'preparing';
  if (last.status === 'FAILED') return 'interrupted';
  return 'answered';
}
