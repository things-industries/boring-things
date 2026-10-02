import type { Schema } from '../../../../shared/model';

export interface MessageCards {
  /** Thing cards, shown before the message text. */
  things: Schema['ResourceCard'][];
  /** Every other card, shown after the text. */
  others: Schema['ResourceCard'][];
}

/**
 * Splits a message's cards around its text. Leaves out the chat's own Thing, and adds a Thing card
 * for each field card whose Thing has none.
 */
export function messageCards(
  cards: Schema['ResourceCard'][],
  contextThingId: string | null,
): MessageCards {
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
