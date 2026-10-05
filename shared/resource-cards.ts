/** Groups citations by resource identity and preserves every cited attachment page. */
import type { Schema } from './model.js';

// Merge repeated cards, including attachment citations with different pages.
export function mergeResourceCards(
  cards: readonly Schema['ResourceCard'][],
): Schema['ResourceCard'][] {
  const merged = new Map<string, Schema['ResourceCard']>();
  for (const card of cards) {
    const key =
      card.type === 'FIELD'
        ? JSON.stringify([
            card.type,
            card.thingId,
            card.fieldSetId,
            card.fieldId,
            card.customFieldId,
          ])
        : JSON.stringify([
            card.type,
            card.type === 'THING'
              ? card.thingId
              : card.type === 'ATTACHMENT'
                ? card.attachmentId
                : card.type === 'EVENT'
                  ? card.eventId
                  : card.type === 'ISSUE'
                    ? card.issueId
                    : card.purchasableId,
          ]);
    const previous = merged.get(key);
    if (card.type === 'ATTACHMENT') {
      const pages = [
        ...new Set([
          ...(previous?.type === 'ATTACHMENT'
            ? (previous.pages ?? (previous.page ? [previous.page] : []))
            : []),
          ...(card.pages ?? []),
          ...(card.page ? [card.page] : []),
        ]),
      ].sort((a, b) => a - b);
      merged.set(key, {
        ...previous,
        ...card,
        ...(pages.length ? { page: pages[0], pages } : {}),
      });
    } else if (!previous) merged.set(key, card);
  }
  return [...merged.values()];
}
