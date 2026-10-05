export const maxDocumentBytes = 100_000_000;
export const maxModelDocumentBytes = 40_000_000;
export const maxModelDocumentPages = 25;
export const maxDocumentTextLength = 1_000_000;

export class DocumentSizeError extends Error {
  constructor(
    readonly actual: number,
    readonly limit: number,
  ) {
    super('Document too large');
  }
}
